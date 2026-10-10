use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use crate::discovery::PlaceCandidate;

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: String,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

#[derive(Deserialize, Debug)]
struct OllamaTagsResponse {
    models: Vec<OllamaTagModel>,
}

#[derive(Deserialize, Debug)]
struct OllamaTagModel {
    name: String,
}

/// Pick a usable local qwen instruct model from the Ollama daemon, since the
/// exact tag requested (e.g. "qwen2.5") may not be installed. Embedding-only
/// models (nomic-embed-text) are excluded.
async fn pick_qwen_model(client: &Client) -> Option<String> {
    let tags: OllamaTagsResponse = client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    // Prefer an exact "qwen2.5" match, then any qwen2.5 tag (fast, no
    // thinking overhead), then any qwen model, then any model at all
    if let Some(m) = tags.models.iter().find(|m| m.name == "qwen2.5") {
        return Some(m.name.clone());
    }
    if let Some(m) = tags.models.iter().find(|m| m.name.starts_with("qwen2.5")) {
        return Some(m.name.clone());
    }
    if let Some(m) = tags.models.iter().find(|m| m.name.starts_with("qwen")) {
        return Some(m.name.clone());
    }
    tags.models.iter().map(|m| m.name.clone()).next()
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RecommendedPlace {
    pub name: String,
    pub category: String,
    pub distance: String,
    pub reason: String,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

pub async fn get_recommendation(client: &Client, candidates: &[PlaceCandidate]) -> Result<RecommendedPlace, Box<dyn Error + Send + Sync>> {
    println!("[LLM] Generating recommendation using local Qwen model...");

    let candidate_list: Vec<String> = candidates.iter().map(|p| format!(
        "- {} ({}, {})",
        p.name,
        p.category,
        format_distance(p.distance_km),
    )).collect();
    let candidate_text = candidate_list.join("\n");
    let recent = recent::names();

    let prompt = format!(
        "You are an AI assistant helping a user take a break from their screen. \
Here are nearby outdoor places, with straight-line distance from the user:
{}

The user has seen these places recently — AVOID them unless there is no alternative:
{}

Choose ONE good place for a short break, preferring variety over the recent list and a sensible distance.
Respond ONLY with a JSON object in this exact format, with no markdown formatting or other text:
{{
  \"name\": \"Name of the place (copied EXACTLY from the list above)\",
  \"category\": \"Category (e.g. Park, Garden, Water / Nature)\",
  \"distance\": \"Human distance copied from the list, e.g. '350 m away' or '1.2 km away'\",
  \"reason\": \"One short sentence why it's a good place to rest your eyes.\"
}}
The \"name\" MUST exactly match one of the places in the list.",
        candidate_text,
        if recent.is_empty() { "(none yet)".to_string() } else { recent.join(", ") }
    );

    let req = OllamaRequest {
        // Exact tag "qwen2.5" is not installed locally (Ollama returns 404 for
        // name mismatches); resolve a usable qwen model from /api/tags instead
        model: pick_qwen_model(client).await.unwrap_or_else(|| "qwen2.5:1.5b".to_string()), // local Ollama model
        prompt,
        stream: false,
        format: "json".to_string(),
    };

    let res = client.post("http://127.0.0.1:11434/api/generate")
        .json(&req)
        .send()
        .await;
        
    match res {
        Ok(response) => {
            let data = response.json::<OllamaResponse>().await;
            let rec: Result<RecommendedPlace, Box<dyn Error + Send + Sync>> = match data {
                Ok(d) => serde_json::from_str::<RecommendedPlace>(&d.response).map_err(|e| e.into()),
                Err(e) => Err(e.into()),
            };
            match rec {
                Ok(mut r) => {
                    let Some(candidate) = candidates.iter().find(|candidate| candidate.name.eq_ignore_ascii_case(&r.name)) else {
                        return Ok(varied_fallback(candidates));
                    };
                    r.lat = Some(candidate.lat);
                    r.lon = Some(candidate.lon);
                    r.category = candidate.category.clone();
                    r.distance = format_distance(candidate.distance_km);
                    println!("[LLM] Recommended: {}", r.name);
                    recent::remember(&r);
                    Ok(r)
                }
                // A malformed LLM response (bad JSON, string lat/lon, missing
                // fields) must not kill the pipeline — fall back like an
                // HTTP failure would
                Err(e) => {
                    println!("[LLM] Could not parse model response: {}. Using fallback.", e);
                    Ok(fallback_place(candidates))
                }
            }
        },
        Err(e) => {
            println!("[LLM] Local Ollama failed or not running: {}. Using fallback.", e);
            Ok(fallback_place(candidates))
        }
    }
}

/// Recent recommendations, so Grounded doesn't suggest the same place twice in
/// a row. Survives restarts via the settings dir. In-memory mirror is last-N
/// names; the file is the source of truth on launch.
pub mod recent {
    use super::RecommendedPlace;
    use std::path::PathBuf;

    const MAX_RECENT: usize = 5;

    fn path() -> Option<PathBuf> {
        let home = std::env::var("HOME").ok()?;
        Some(PathBuf::from(home).join("Library/Application Support/com.grounded.touchgrass/recent_places.json"))
    }

    /// State: [remember_count, name1, name2, …] — the count drives rotation so
    /// the pick index keeps changing even when the recent list is saturated
    fn load() -> (u64, Vec<String>) {
        path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|raw| {
                let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
                let count = value.get(0)?.as_u64()?;
                let names = value
                    .as_array()?
                    .iter()
                    .skip(1)
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                Some((count, names))
            })
            .unwrap_or((0, Vec::new()))
    }

    fn store(count: u64, names: &[String]) {
        if let Some(p) = path() {
            let mut value = vec![serde_json::Value::from(count)];
            value.extend(names.iter().map(|n| serde_json::Value::from(n.clone())));
            if let Ok(json) = serde_json::to_vec(&value) {
                let tmp = p.with_extension("tmp");
                if std::fs::write(&tmp, json).is_ok() {
                    let _ = std::fs::rename(&tmp, &p);
                }
            }
        }
    }

    /// Names recommended recently (most recent first)
    pub fn names() -> Vec<String> {
        load().1
    }

    /// How many places have been remembered, ever — a stable rotation counter
    pub fn remembers() -> u64 {
        load().0
    }

    pub fn remember(place: &RecommendedPlace) {
        let (count, mut names) = load();
        names.retain(|n| n != &place.name);
        names.insert(0, place.name.clone());
        names.truncate(MAX_RECENT);
        store(count + 1, &names);
    }
}

/// Deterministic varied pick when the LLM is unavailable: prefer a place NOT
/// recommended recently and closest to the user, with a little rotation so
/// consecutive fallbacks still differ.
fn varied_fallback(candidates: &[PlaceCandidate]) -> RecommendedPlace {
    if candidates.is_empty() {
        // No candidates at all: an honest no-map suggestion, NOT a fabricated
        // place. (This must not re-enter fallback_place — it would recurse.)
        return RecommendedPlace {
            name: "A moment away from the screen".to_string(),
            category: "Nature".to_string(),
            distance: "At your own pace".to_string(),
            reason: "Take a deep breath and look at the sky.".to_string(),
            lat: None,
            lon: None,
        };
    }
    let recent = recent::names();
    let mut pool: Vec<&PlaceCandidate> = candidates.iter().filter(|c| !recent.iter().any(|n| n == &c.name)).collect();
    if pool.is_empty() {
        pool = candidates.iter().collect();
    }
    // Nearest of the eligible pool; ties broken by rotation over the list
    pool.sort_by(|a, b| {
        a.distance_km
            .unwrap_or(f64::MAX)
            .partial_cmp(&b.distance_km.unwrap_or(f64::MAX))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let pick = (recent::remembers() as usize) % pool.len();
    let choice = pool[pick];
    let rec = RecommendedPlace {
        name: choice.name.clone(),
        category: choice.category.clone(),
        distance: format_distance(choice.distance_km),
        reason: format!("A quiet {} about {} from you.", choice.category.to_lowercase(), format_distance(choice.distance_km).to_lowercase()),
        lat: Some(choice.lat),
        lon: Some(choice.lon),
    };
    recent::remember(&rec);
    rec
}

/// Human distance: metres under 1 km, one decimal in km beyond
pub fn format_distance(distance_km: Option<f64>) -> String {
    match distance_km {
        Some(km) if km < 0.05 => "right around you".to_string(),
        Some(km) if km < 1.0 => format!("{} m away", (km * 1000.0).round() as i64),
        Some(km) => format!("{:.1} km away", km),
        None => "Check the map for distance".to_string(),
    }
}

/// Fallback recommendation: first candidate with its real coordinates, so the
/// map shows the right place even when the LLM is unreachable or unparseable.
/// Also used by the threshold pipeline so a break nudge ALWAYS carries a place.
pub fn fallback_place(candidates: &[PlaceCandidate]) -> RecommendedPlace {
    varied_fallback(candidates)
}

pub async fn answer_query(client: &Client, query: &str, candidates: &[PlaceCandidate]) -> Result<String, Box<dyn Error + Send + Sync>> {
    let candidate_list: Vec<String> = candidates.iter().map(|p| format!("- {}", p.name)).collect();
    let candidate_text = candidate_list.join("\n");
    
    let prompt = format!(
        "You are an AI assistant in a screen-break app. 
The user asked: \"{}\"
If relevant, gently recommend one of these outdoor places in Bangalore:
{}
Keep the answer very short, natural, and friendly (1-2 sentences). Do not use markdown.", query, candidate_text);

    let req = OllamaRequest {
        // Same model resolution as get_recommendation: avoid 404 on "qwen2.5"
        model: pick_qwen_model(client).await.unwrap_or_else(|| "qwen2.5:1.5b".to_string()),
        prompt,
        stream: false,
        format: "".to_string(), // normal text
    };

    let res = client.post("http://127.0.0.1:11434/api/generate")
        .json(&req)
        .send()
        .await?;

    let data = res.json::<OllamaResponse>().await?;
    Ok(data.response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::PlaceCandidate;

    fn candidates() -> Vec<PlaceCandidate> {
        vec![
            PlaceCandidate { name: "Near Park".into(), category: "Park".into(), lat: 12.9763, lon: 77.5929, distance_km: Some(0.4) },
            PlaceCandidate { name: "Mid Garden".into(), category: "Garden".into(), lat: 12.9700, lon: 77.5900, distance_km: Some(1.2) },
            PlaceCandidate { name: "Far Lake".into(), category: "Water / Nature".into(), lat: 12.9812, lon: 77.6216, distance_km: Some(2.8) },
        ]
    }

    #[test]
    fn fallback_varies_between_consecutive_calls() {
        let pool = candidates();
        let first = fallback_place(&pool).name;
        let second = fallback_place(&pool).name;
        let third = fallback_place(&pool).name;
        // With 3 candidates and a 2-deep recent memory, three calls cannot all
        // be the same place
        assert!(
            !(first == second && second == third),
            "fallback repeated the same place three times: {first}, {second}, {third}"
        );
    }

    #[test]
    fn fallback_never_repeats_the_last_place() {
        let pool = candidates();
        let first = fallback_place(&pool).name.clone();
        let second = fallback_place(&pool).name;
        assert_ne!(first, second, "fallback picked the just-recommended place again");
    }

    #[test]
    fn fallback_carries_real_coordinates_and_distance() {
        let pool = candidates();
        let rec = fallback_place(&pool);
        assert!(rec.lat.is_some() && rec.lon.is_some(), "fallback must map");
        assert!(rec.distance.ends_with("away") || rec.distance.contains("around"),
            "distance should be human: {}", rec.distance);
        let in_pool = pool.iter().any(|c| c.name == rec.name);
        assert!(in_pool, "fallback invented a place outside the candidate list");
    }

    #[test]
    fn empty_candidates_still_produce_a_place() {
        let rec = fallback_place(&[]);
        assert!(!rec.name.is_empty());
        assert!(rec.lat.is_none(), "no candidates → no fabricated coordinates");
    }

    #[test]
    fn distance_formatting_is_human() {
        assert_eq!(format_distance(Some(0.4)), "400 m away");
        assert_eq!(format_distance(Some(1.24)), "1.2 km away");
        assert_eq!(format_distance(Some(0.01)), "right around you");
        assert_eq!(format_distance(None), "Check the map for distance");
    }

    #[test]
    fn recent_memory_rotates() {
        let pool = candidates();
        // Exhaust the variety: with 3 places and 2-deep memory the pool should
        // rotate rather than collapsing to one answer
        let mut seen = std::collections::HashSet::new();
        for _ in 0..6 {
            seen.insert(fallback_place(&pool).name);
        }
        assert!(seen.len() >= 2, "six fallbacks only produced: {seen:?}");
    }
}
