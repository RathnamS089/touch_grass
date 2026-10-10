use crate::{discovery, llm};
use std::time::Duration;

/// Bound remote work so a stalled location provider/model cannot suppress a break.
pub async fn prepare_recommendation(client: &reqwest::Client, nearby: bool) -> llm::RecommendedPlace {
    if !nearby {
        return llm::fallback_place(&[]);
    }
    let candidates = match tokio::time::timeout(Duration::from_secs(20), discovery::discover_nearby_places(client)).await {
        Ok(Ok(candidates)) => candidates,
        _ => Vec::new(),
    };
    if candidates.is_empty() {
        return llm::fallback_place(&[]);
    }
    match tokio::time::timeout(Duration::from_secs(15), llm::get_recommendation(client, &candidates)).await {
        Ok(Ok(place)) => place,
        _ => llm::fallback_place(&candidates),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn disabled_recommendations_do_not_invent_a_mapped_location() {
        let rec = prepare_recommendation(&reqwest::Client::new(), false).await;
        assert!(rec.lat.is_none());
        assert!(rec.lon.is_none());
        assert!(!rec.reason.is_empty());
    }
}
