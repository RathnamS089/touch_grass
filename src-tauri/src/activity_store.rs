use crate::engine;
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::atomic::Ordering};

#[derive(Debug, Serialize, Deserialize)]
struct Snapshot {
    day: String,
    total_seconds: u64,
    sessions: u64,
    nudges: u64,
    hourly: [u64; 24],
}

pub fn save(path: &Path) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let snapshot = Snapshot {
        day: chrono::Local::now().date_naive().to_string(),
        total_seconds: engine::TODAY_ACTIVE_SECONDS.load(Ordering::Relaxed),
        sessions: engine::SESSIONS_TODAY.load(Ordering::Relaxed),
        nudges: engine::NUDGES_TODAY.load(Ordering::Relaxed),
        hourly: std::array::from_fn(|hour| engine::HOURLY_ACTIVE_SECONDS[hour].load(Ordering::Relaxed)),
    };
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, serde_json::to_vec(&snapshot)?)?;
    std::fs::rename(temporary, path)?;
    Ok(())
}

pub fn restore(path: &Path) {
    let Some(snapshot) = std::fs::read(path).ok().and_then(|raw| serde_json::from_slice::<Snapshot>(&raw).ok()) else { return; };
    if snapshot.day != chrono::Local::now().date_naive().to_string() { return; }
    engine::TODAY_ACTIVE_SECONDS.store(snapshot.total_seconds, Ordering::Relaxed);
    engine::SESSIONS_TODAY.store(snapshot.sessions, Ordering::Relaxed);
    engine::NUDGES_TODAY.store(snapshot.nudges, Ordering::Relaxed);
    for (hour, value) in snapshot.hourly.iter().enumerate() {
        engine::HOURLY_ACTIVE_SECONDS[hour].store(*value, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_totals_survive_restart_but_not_a_new_day() {
        let _guard = engine::ENGINE_TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
        let path = std::env::temp_dir().join(format!("grounded-activity-test-{}.json", std::process::id()));
        engine::TODAY_ACTIVE_SECONDS.store(123, Ordering::Relaxed);
        engine::HOURLY_ACTIVE_SECONDS[9].store(123, Ordering::Relaxed);
        engine::NUDGES_TODAY.store(2, Ordering::Relaxed);
        save(&path).unwrap();
        engine::TODAY_ACTIVE_SECONDS.store(0, Ordering::Relaxed);
        engine::HOURLY_ACTIVE_SECONDS[9].store(0, Ordering::Relaxed);
        engine::NUDGES_TODAY.store(0, Ordering::Relaxed);
        restore(&path);
        assert_eq!(engine::TODAY_ACTIVE_SECONDS.load(Ordering::Relaxed), 123);
        assert_eq!(engine::HOURLY_ACTIVE_SECONDS[9].load(Ordering::Relaxed), 123);
        assert_eq!(engine::NUDGES_TODAY.load(Ordering::Relaxed), 2);
        let mut old: Snapshot = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        old.day = "2000-01-01".into();
        std::fs::write(&path, serde_json::to_vec(&old).unwrap()).unwrap();
        engine::TODAY_ACTIVE_SECONDS.store(0, Ordering::Relaxed);
        restore(&path);
        assert_eq!(engine::TODAY_ACTIVE_SECONDS.load(Ordering::Relaxed), 0);
        std::fs::write(&path, b"incomplete JSON").unwrap();
        restore(&path);
        assert_eq!(engine::TODAY_ACTIVE_SECONDS.load(Ordering::Relaxed), 0);
        std::fs::remove_file(path).unwrap();
    }
}
