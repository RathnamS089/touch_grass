pub mod monitor;
pub mod engine;
pub mod discovery;
pub mod llm;
pub mod db;
pub mod pipeline;
mod activity_store;

use serde::{Serialize, Deserialize};
use std::time::Duration;
use std::sync::atomic::Ordering;
use tokio::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize)]
struct BackendStatus {
    ok: bool,
    backend: String,
    message: String,
}

/// Live screen-time snapshot for the Dashboard, from Grounded's own activity
/// engine (idle via CGEventSource + threshold timer). Updated every second.
#[derive(Serialize, Clone)]
struct ScreenTimeDetail {
    source: String,
    /// Total active seconds today (all sessions)
    total_seconds: u64,
    /// Seconds in the current continuous active session (0 when idle)
    current_session_seconds: u64,
    /// True while the user is actively at the screen
    is_active: bool,
    /// Active sessions started today
    sessions: u64,
    /// Break nudges shown today
    nudges: u64,
    /// (local hour 0-23, active seconds) for each hour that had activity
    hourly: Vec<(u32, u64)>,
}

#[tauri::command]
fn get_backend_status() -> BackendStatus {
    BackendStatus {
        ok: true,
        backend: "rust".to_string(),
        message: "Grounded backend is running".to_string(),
    }
}

#[tauri::command]
fn get_screen_time() -> u64 {
    engine::TODAY_ACTIVE_SECONDS.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
fn get_screen_time_detail() -> ScreenTimeDetail {
    use std::sync::atomic::Ordering;
    let hourly = engine::HOURLY_ACTIVE_SECONDS
        .iter()
        .enumerate()
        .filter_map(|(hour, secs)| {
            let s = secs.load(Ordering::Relaxed);
            (s > 0).then_some((hour as u32, s))
        })
        .collect();
    ScreenTimeDetail {
        source: "grounded-engine".to_string(),
        total_seconds: engine::TODAY_ACTIVE_SECONDS.load(Ordering::Relaxed),
        current_session_seconds: engine::CURRENT_SESSION_SECONDS.load(Ordering::Relaxed),
        is_active: engine::IS_ACTIVE.load(Ordering::Relaxed) == 1,
        sessions: engine::SESSIONS_TODAY.load(Ordering::Relaxed),
        nudges: engine::NUDGES_TODAY.load(Ordering::Relaxed),
        hourly,
    }
}

/// Shared HTTP client: a User-Agent is required by Overpass/ip-api (reqwest
/// sends none by default → HTTP 406), and a timeout keeps the UI from hanging
/// forever on a slow endpoint
fn api_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Grounded/0.1 (desktop companion)")
        .timeout(Duration::from_secs(90))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

#[tauri::command]
async fn ask_llm(query: String) -> Result<String, String> {
    let client = api_client();
    // Discovery is best-effort: if IP geolocation or Overpass are unreachable,
    // fall back to static candidates so the orb still answers
    let candidates = match discovery::discover_blr_places(&client).await {
        Ok(c) if !c.is_empty() => c,
        _ => {
            println!("[AskLLM] Discovery unavailable — using offline candidates.");
            discovery::fallback_candidates()
        }
    };
    match llm::answer_query(&client, &query, &candidates).await {
        Ok(answer) => Ok(answer),
        Err(e) => {
            println!("[AskLLM] LLM failed: {}. Using graceful fallback.", e);
            let place = candidates.first().map(|c| c.name.as_str()).unwrap_or("a nearby park");
            Ok(format!(
                "The local model didn't respond just now. Meanwhile: {} is nearby — a good spot for a break.",
                place
            ))
        }
    }
}

// Minimal Tauri Command API
// Field names MUST match the frontend's GroundedSettings exactly
// (sessionThresholdMinutes / breakDurationMinutes / reminderFrequencyMinutes —
// rename_all = "camelCase" maps to these snake_case names). The reviewer's
// serde probe proved a name mismatch (frontend sessionThresholdMinutes vs an
// older interventionThresholdMinutes) silently rejected every save.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundedSettings {
    // Legacy alias: settings files written by older builds used
    // intervention_threshold_minutes — they must still load (via the default)
    #[serde(alias = "intervention_threshold_minutes", alias = "interventionThresholdMinutes")]
    pub session_threshold_minutes: u64,
    #[serde(default = "default_break_duration")]
    pub break_duration_minutes: u64,
    #[serde(default = "default_reminder_frequency")]
    pub reminder_frequency_minutes: u64,
    // The two toggles are persisted too — without these fields serde silently
    // drops them and they'd reset to true on every app restart
    #[serde(default = "default_true")]
    pub nature_imagery: bool,
    #[serde(default = "default_true")]
    pub nearby_recommendations: bool,
}

fn default_break_duration() -> u64 {
    15
}

fn default_reminder_frequency() -> u64 {
    60
}

fn default_true() -> bool {
    true
}

/// Settings file inside the app data dir, e.g.
/// ~/Library/Application Support/com.grounded.touchgrass/settings.json
fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "no app data dir".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create data dir: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn default_settings() -> GroundedSettings {
    GroundedSettings {
        session_threshold_minutes: 45,
        break_duration_minutes: default_break_duration(),
        reminder_frequency_minutes: default_reminder_frequency(),
        nature_imagery: true,
        nearby_recommendations: true,
    }
}

fn load_settings_from(app: &tauri::AppHandle) -> GroundedSettings {
    match settings_path(app) {
        Ok(path) => std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_else(default_settings),
        Err(_) => default_settings(),
    }
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> GroundedSettings {
    load_settings_from(&app)
}

#[tauri::command]
fn set_settings(app: tauri::AppHandle, mut settings: GroundedSettings) -> Result<(), String> {
    // Server-side clamp, same bounds as the frontend: an IPC caller must not
    // be able to set threshold 0 (nudge every tick) or absurd values
    let clamp = |v: u64, min: u64, max: u64| v.clamp(min, max);
    settings.session_threshold_minutes = clamp(settings.session_threshold_minutes, 5, 240);
    settings.break_duration_minutes = clamp(settings.break_duration_minutes, 5, 60);
    settings.reminder_frequency_minutes = clamp(settings.reminder_frequency_minutes, 15, 240);
    let path = settings_path(&app)?;
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| format!("cannot save settings: {e}"))?;
    // The thresholds steer the live engine — no restart needed
    engine::INTERVENTION_THRESHOLD_SECONDS.store(
        settings.session_threshold_minutes.saturating_mul(60),
        Ordering::Relaxed,
    );
    engine::REMINDER_INTERVAL_SECONDS.store(
        settings.reminder_frequency_minutes.saturating_mul(60),
        Ordering::Relaxed,
    );
    println!(
        "[Settings] Saved threshold: {} min, reminders every {} min",
        settings.session_threshold_minutes, settings.reminder_frequency_minutes
    );
    Ok(())
}

// Starts the backend loop
fn start_backend_loop(app_handle: AppHandle) {
    let (tx, mut rx) = mpsc::channel(10);

    // Engine config
    let config = engine::EngineConfig {
        idle_threshold: Duration::from_secs(60), // 1 minute idle = left keyboard
        intervention_threshold: Duration::from_secs(45 * 60), // 45 minutes active
    };

    // Seed the live thresholds from persisted settings so saved values apply
    // from launch
    let saved = load_settings_from(&app_handle);
    engine::INTERVENTION_THRESHOLD_SECONDS.store(
        saved.session_threshold_minutes.saturating_mul(60),
        Ordering::Relaxed,
    );
    engine::REMINDER_INTERVAL_SECONDS.store(
        saved.reminder_frequency_minutes.saturating_mul(60),
        Ordering::Relaxed,
    );

    let activity_path = app_handle.path().app_data_dir().ok().map(|dir| dir.join("activity.json"));
    if let Some(path) = &activity_path {
        if let Some(parent) = path.parent() { let _ = std::fs::create_dir_all(parent); }
        activity_store::restore(path);
    }
    let mut session_engine = engine::SessionEngine::new(config, tx);

    // Spawn monitor loop
    tauri::async_runtime::spawn(async move {
        loop {
            let idle_dur = monitor::activity::get_idle_duration();
            session_engine.tick(idle_dur).await;
            if let Some(path) = &activity_path {
                if let Err(error) = activity_store::save(path) {
                    eprintln!("[Activity] Could not save daily totals: {error}");
                }
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });

    // Timer and manual test use exactly the same delivery path.
    tauri::async_runtime::spawn(async move {
        while let Some(engine::EngineEvent::ThresholdExceeded(_)) = rx.recv().await {
            if let Err(error) = deliver_break(&app_handle, "threshold").await {
                eprintln!("[Pipeline] Break delivery failed: {error}");
            }
        }
    });
}

async fn deliver_break(app: &AppHandle, nudge_kind: &str) -> Result<(), String> {
    let settings = load_settings_from(app);
    let client = api_client();
    let rec = pipeline::prepare_recommendation(&client, settings.nearby_recommendations).await;
    // Deliver before cloud persistence: an unavailable database must never delay the nudge.
    app.emit("break_ready", &rec).map_err(|error| error.to_string())?;
    let _ = app.emit("recommendation_ready", &rec);
    engine::NUDGES_TODAY.fetch_add(1, Ordering::Relaxed);
    llm::recent::remember(&rec);
    let _ = app.notification().builder().title("Time for a break")
        .body(format!("Take {} minutes away from your screen. {}", settings.break_duration_minutes, rec.reason))
        .show();
    let app = app.clone();
    let nudge_kind = nudge_kind.to_string();
    tauri::async_runtime::spawn(async move {
        let url = std::env::var("SUPABASE_URL").unwrap_or_default();
        let key = std::env::var("SUPABASE_ANON_KEY").unwrap_or_default();
        let record = db::NotificationRecord {
            place_name: rec.name.clone(),
            place_category: rec.category.clone(),
            place_lat: rec.lat,
            place_lon: rec.lon,
            nudge_kind,
        };
        let result = db::save_notification(&client, &url, &key, &record).await;
        let message = match result {
            Ok(()) => "Reminder saved to Supabase.".to_string(),
            Err(error) => format!("Reminder shown, but history was not saved: {error}"),
        };
        let _ = app.emit("history_save_status", message);
    });
    Ok(())
}

#[tauri::command]
async fn test_break(app: AppHandle) -> Result<(), String> {
    deliver_break(&app, "manual").await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Tauri dev starts in src-tauri; load the repository .env explicitly.
    // Existing process environment always takes precedence over the file.
    #[cfg(debug_assertions)]
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    #[cfg(not(debug_assertions))]
    let env_path = std::path::PathBuf::from(".env");
    if let Err(error) = dotenvy::from_path(&env_path) {
        if !error.not_found() {
            eprintln!("[Config] Could not load .env; check its format and file permissions.");
        }
    }
    app_builder()
        .run(tauri::generate_context!())
        .expect("error while running Grounded");
}

/// Shared builder for the desktop app and the native end-to-end probe.
pub fn app_builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .setup(|app| {
            start_backend_loop(app.handle().clone());
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_backend_status,
            get_screen_time,
            get_screen_time_detail,
            get_settings,
            set_settings,
            ask_llm,
            test_break
        ])

}
