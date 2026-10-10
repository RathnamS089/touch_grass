use reqwest::Client;
use serde::Serialize;
use std::error::Error;

#[derive(Serialize, Debug)]
pub struct NotificationRecord {
    pub place_name: String,
    pub place_category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub place_lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub place_lon: Option<f64>,
    /// "threshold" (timer fired) or "manual" (Try a reminder button)
    pub nudge_kind: String,
}

pub async fn save_notification(
    client: &Client,
    url: &str,
    anon_key: &str,
    record: &NotificationRecord
) -> Result<(), Box<dyn Error + Send + Sync>> {
    if url.is_empty() || anon_key.is_empty() {
        println!("[DB] Supabase URL or Anon Key is empty. Skipping DB insert.");
        return Err("Supabase is not configured".into());
    }

    let request = notification_request(client, url, anon_key, record).timeout(std::time::Duration::from_secs(10));
    let res = request.send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let err = res.text().await.unwrap_or_default();
        println!("[DB] Supabase error {}: {}", status, err);
        let message = match status.as_u16() {
            404 => "Supabase table is missing; apply the notification_history migration",
            401 | 403 => "Supabase rejected the insert; check the key and insert policy",
            _ => "Supabase could not save the reminder; try again later",
        };
        return Err(message.into());
    }

    println!("[DB] Saved notification history to Supabase.");
    Ok(())
}

fn notification_request(
    client: &Client,
    url: &str,
    anon_key: &str,
    record: &NotificationRecord,
) -> reqwest::RequestBuilder {
    let endpoint = format!("{}/rest/v1/notification_history", url.trim_end_matches('/'));
    let mut request = client.post(&endpoint)
        .header("apikey", anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(record);
    // Publishable keys are opaque API keys, not user JWTs.
    if !anon_key.starts_with("sb_publishable_") {
        request = request.bearer_auth(anon_key);
    }
    request
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publishable_key_uses_apikey_without_invalid_bearer_token() {
        let request = notification_request(
            &Client::new(), "https://example.supabase.co/", "sb_publishable_test",
            &NotificationRecord { place_name: "Park".into(), place_category: "Nature".into(), place_lat: Some(12.9), place_lon: Some(77.5), nudge_kind: "threshold".into() },
        ).build().unwrap();
        assert_eq!(request.url().as_str(), "https://example.supabase.co/rest/v1/notification_history");
        assert_eq!(request.headers()["apikey"], "sb_publishable_test");
        assert!(!request.headers().contains_key("authorization"));
        assert_eq!(request.headers()["prefer"], "return=minimal");
        let body: serde_json::Value = serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap();
        assert_eq!(body, serde_json::json!({"place_name": "Park", "place_category": "Nature", "place_lat": 12.9, "place_lon": 77.5, "nudge_kind": "threshold"}));
    }

    #[test]
    fn legacy_anon_jwt_keeps_bearer_authentication() {
        let request = notification_request(
            &Client::new(), "https://example.supabase.co", "legacy.jwt.key",
            &NotificationRecord { place_name: "Park".into(), place_category: "Nature".into(), place_lat: None, place_lon: None, nudge_kind: "manual".into() },
        ).build().unwrap();
        assert_eq!(request.headers()["authorization"], "Bearer legacy.jwt.key");
        assert_eq!(request.headers()["apikey"], "legacy.jwt.key");
        // Coordinates absent → omitted from the payload entirely
        let body: serde_json::Value = serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap();
        assert!(body.get("place_lat").is_none());
    }
}
