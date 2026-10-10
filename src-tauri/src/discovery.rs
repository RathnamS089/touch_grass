use reqwest::Client;
use serde::Deserialize;
use std::error::Error;

/// Overpass (and ip-api) reject requests without a User-Agent header;
/// reqwest's Client::new() sends none by default, so discovery always 406'd.
const USER_AGENT: &str = "Grounded/0.1 (desktop companion)";

#[derive(Deserialize, Debug)]
struct IpApiResp {
    // ip-api.com and ipwho.is use latitude/longitude; ipapi.co uses
    // latitude/longitude too (lat/lon broke ipwho.is deserialization →
    // discovery fell back to offline candidates on EVERY nudge)
    #[serde(alias = "lat")]
    latitude: f64,
    #[serde(alias = "lon")]
    longitude: f64,
}
#[derive(Deserialize, Debug)]
struct Coordinates { lat: f64, lon: f64 }

#[derive(Deserialize, Debug)]
struct OverpassElement {
    lat: Option<f64>,
    lon: Option<f64>,
    center: Option<Coordinates>,
    tags: Option<std::collections::HashMap<String, String>>,
}

#[derive(Deserialize, Debug)]
struct OverpassResp {
    elements: Vec<OverpassElement>,
}

#[derive(Debug, Clone)]
pub struct PlaceCandidate {
    pub name: String,
    pub category: String,
    pub lat: f64,
    pub lon: f64,
    /// Straight-line distance from the user in km (None when unknown)
    pub distance_km: Option<f64>,
}

/// Great-circle distance between two coordinates in km (haversine formula)
pub fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let to_rad = std::f64::consts::PI / 180.0;
    let d_lat = (lat2 - lat1) * to_rad;
    let d_lon = (lon2 - lon1) * to_rad;
    let a = (d_lat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (d_lon / 2.0).sin().powi(2);
    6371.0 * 2.0 * a.sqrt().asin()
}

/// POST an Overpass query with the required User-Agent, falling back to a
/// mirror instance when the primary one is rate-limited or down
async fn post_overpass(client: &Client, query: &str) -> Result<OverpassResp, Box<dyn Error + Send + Sync>> {
    let mirrors = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ];
    let mut last_err = None;
    for url in mirrors {
        match client.post(url)
            .header("User-Agent", USER_AGENT)
            .body(query.to_string())
            .send()
            .await
        {
            Ok(resp) => match resp.json::<OverpassResp>().await {
                Ok(parsed) => return Ok(parsed),
                Err(e) => last_err = Some(e.into()),
            },
            Err(e) => last_err = Some(e.into()),
        }
    }
    Err(last_err.unwrap_or_else(|| "all Overpass mirrors failed".into()))
}

/// Static offline candidates used when IP geolocation or Overpass are
/// unreachable, so recommendations and orb answers still work. Coordinates
/// are real Bangalore park locations.
pub fn fallback_candidates() -> Vec<PlaceCandidate> {
    vec![
        PlaceCandidate { name: "Cubbon Park".into(), category: "Park".into(), lat: 12.9763, lon: 77.5929, distance_km: None },
        PlaceCandidate { name: "Lalbagh Botanical Garden".into(), category: "Botanical Garden".into(), lat: 12.9507, lon: 77.5848, distance_km: None },
        PlaceCandidate { name: "Ulsoor Lake".into(), category: "Lake".into(), lat: 12.9812, lon: 77.6216, distance_km: None },
    ]
}

pub async fn discover_nearby_places(client: &Client) -> Result<Vec<PlaceCandidate>, Box<dyn Error + Send + Sync>> {
    // 1. Get approximate location via IP (Privacy-friendly, rough location,
    // no OS prompts). HTTPS so the network observer can't read the location
    // query in plaintext — ip-api's free tier is HTTP-only, so ipwho.is first
    let println_loc = |lat: f64, lon: f64| println!("[Discovery] Found location: {}, {}", lat, lon);
    println!("[Discovery] Fetching location...");
    let geo = match client.get("https://ipwho.is/")
        .header("User-Agent", USER_AGENT)
        .send()
        .await?
        .json::<IpApiResp>()
        .await
    {
        Ok(g) if g.latitude != 0.0 || g.longitude != 0.0 => {
            println_loc(g.latitude, g.longitude);
            g
        }
        _ => {
            // Fallback: ipapi.co (HTTPS)
            client.get("https://ipapi.co/json/")
                .header("User-Agent", USER_AGENT)
                .send()
                .await?
                .json::<IpApiResp>()
                .await?
        }
    };

    let lat = geo.latitude;
    let lon = geo.longitude;
    println!("[Discovery] Using location: {}, {}", lat, lon);

    // 2. Query Overpass API for nearby outdoor places (parks, nature reserves,
    // lakes, gardens, playgrounds). Ask for 30 so the recommender has real
    // variety instead of always choosing among the same two or three.
    let overpass_query = format!(
        "[out:json][timeout:10];\n\
        (\n  \
          node[\"leisure\"=\"park\"](around:5000,{},{});\n  \
          way[\"leisure\"=\"park\"](around:5000,{},{});\n  \
          node[\"natural\"=\"water\"](around:5000,{},{});\n  \
          node[\"leisure\"=\"nature_reserve\"](around:5000,{},{});\n  \
          node[\"leisure\"=\"garden\"](around:5000,{},{});\n  \
          way[\"leisure\"=\"garden\"](around:5000,{},{});\n  \
          node[\"leisure\"=\"playground\"](around:3000,{},{});\n\
        );\n\
        out center 30;",
        lat, lon, lat, lon, lat, lon, lat, lon, lat, lon, lat, lon, lat, lon
    );

    println!("[Discovery] Querying Overpass API...");
    let overpass_resp = post_overpass(client, &overpass_query).await?;

    let mut candidates = Vec::new();
    for el in overpass_resp.elements {
        if let Some(tags) = el.tags {
            if let Some(name) = tags.get("name") {
                let category = if tags.contains_key("natural") {
                    "Water / Nature".to_string()
                } else if tags.contains_key("garden") {
                    "Garden".to_string()
                } else if tags.contains_key("playground") {
                    "Playground".to_string()
                } else {
                    "Park / Reserve".to_string()
                };
                let place_lat = el.lat.or_else(|| el.center.as_ref().map(|center| center.lat)).unwrap_or(lat);
                let place_lon = el.lon.or_else(|| el.center.as_ref().map(|center| center.lon)).unwrap_or(lon);
                candidates.push(PlaceCandidate {
                    name: name.clone(),
                    category,
                    lat: place_lat,
                    lon: place_lon,
                    distance_km: Some(haversine_km(lat, lon, place_lat, place_lon)),
                });
            }
        }
    }
    // Same place can appear as node AND way — keep the nearest copy of each name
    candidates.sort_by(|a, b| a.name.cmp(&b.name).then(a.distance_km.partial_cmp(&b.distance_km).unwrap_or(std::cmp::Ordering::Equal)));
    candidates.dedup_by(|a, b| a.name == b.name);

    if candidates.is_empty() {
        // Fallbacks if no POIs found nearby
        candidates.push(PlaceCandidate {
            name: "A nearby quiet street".to_string(),
            category: "Walk".to_string(),
            lat, lon,
            distance_km: Some(0.0),
        });
        candidates.push(PlaceCandidate {
            name: "Your garden or balcony".to_string(),
            category: "Rest".to_string(),
            lat, lon,
            distance_km: Some(0.0),
        });
    }

    Ok(candidates)
}

pub async fn discover_blr_places(client: &Client) -> Result<Vec<PlaceCandidate>, Box<dyn Error + Send + Sync>> {
    let lat = 12.9716;
    let lon = 77.5946;
    let overpass_query = format!(
        "[out:json][timeout:10];\n\
        (\n  \
          node[\"leisure\"=\"park\"](around:5000,{},{});\n  \
          way[\"leisure\"=\"park\"](around:5000,{},{});\n  \
          node[\"natural\"=\"water\"](around:5000,{},{});\n  \
        );\n\
        out center 20;",
        lat, lon, lat, lon, lat, lon
    );
    let overpass_resp = post_overpass(client, &overpass_query).await?;

    let mut candidates = Vec::new();
    for el in overpass_resp.elements {
        if let Some(tags) = el.tags {
            if let Some(name) = tags.get("name") {
                let place_lat = el.lat.or_else(|| el.center.as_ref().map(|center| center.lat)).unwrap_or(lat);
                let place_lon = el.lon.or_else(|| el.center.as_ref().map(|center| center.lon)).unwrap_or(lon);
                candidates.push(PlaceCandidate {
                    name: name.clone(),
                    category: "Bangalore Location".to_string(),
                    lat: place_lat,
                    lon: place_lon,
                    distance_km: Some(haversine_km(lat, lon, place_lat, place_lon)),
                });
            }
        }
    }

    let time_millis = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_millis() as usize;
    if candidates.len() > 5 {
        let start = time_millis % (candidates.len() - 5);
        candidates = candidates[start..start+5].to_vec();
    }

    if candidates.is_empty() {
        candidates.push(PlaceCandidate { name: "Cubbon Park".into(), category: "Park".into(), lat: 12.9763, lon: 77.5929, distance_km: Some(0.0) });
    }
    Ok(candidates)
}
