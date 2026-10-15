// Optional, read-only BPM lookup. Requires an API key supplied by the user in
// COUCOU_GETSONGBPM_API_KEY. Never include this key in the app bundle or logs.
// GetSongBPM requires attribution: https://getsongbpm.com/api
use serde_json::Value;

fn normalize(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

fn verified_tempo(json: &Value, title: &str, artist: &str) -> Option<f64> {
    let wanted_title = normalize(title);
    let wanted_artist = normalize(artist);
    if wanted_title.is_empty() || wanted_artist.is_empty() { return None; }
    let songs = json.get("search")?.as_array()?;
    let mut found = Vec::new();
    for song in songs {
        let name = song.get("title").and_then(Value::as_str).unwrap_or("");
        let artists: Vec<&str> = match song.get("artist") {
            Some(Value::Object(a)) => a.get("name").and_then(Value::as_str).into_iter().collect(),
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.get("name").and_then(Value::as_str)).collect(),
            _ => Vec::new(),
        };
        if normalize(name) != wanted_title || !artists.iter().any(|artist_name| {
            let candidate = normalize(artist_name);
            !candidate.is_empty() &&
                (candidate == wanted_artist || candidate.contains(&wanted_artist) || wanted_artist.contains(&candidate))
        }) { continue; }
        let tempo = song.get("tempo").and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse::<f64>().ok()));
        if let Some(bpm) = tempo.filter(|b| b.is_finite() && (40.0..=220.0).contains(b)) {
            found.push(bpm);
        }
    }
    // Ambiguous recordings/remixes must not provide an incorrect tempo.
    if found.is_empty() || found.iter().any(|b| (b - found[0]).abs() > 1.0) { return None; }
    Some(found[0])
}

#[tauri::command]
pub async fn bpm_lookup(title: String, artist: String) -> Option<f64> {
    if title.len() > 250 || artist.len() > 250 || title.trim().is_empty() || artist.trim().is_empty() {
        return None;
    }
    let key = crate::secrets::get("getsongbpm-api-key")
        .or_else(|| std::env::var("COUCOU_GETSONGBPM_API_KEY").ok())?;
    if key.is_empty() { return None; }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5)).build().ok()?;
    let response = client.get("https://api.getsong.co/search/")
        .header("X-API-KEY", key)
        .query(&[("type", "both"), ("lookup", &format!("song:{title} artist:{artist}")), ("limit", "10")])
        .send().await.ok()?;
    if !response.status().is_success() { return None; }
    let data: Value = response.json().await.ok()?;
    verified_tempo(&data, &title, &artist)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_exact_recording_and_rejects_ambiguous_results() {
        let data = serde_json::json!({"search":[
            {"title":"Get Lucky","artist":{"name":"Daft Punk"},"tempo":"116"},
            {"title":"Get Lucky (Remix)","artist":{"name":"Daft Punk"},"tempo":128}
        ]});
        assert_eq!(verified_tempo(&data,"Get Lucky","Daft Punk"),Some(116.0));
        assert_eq!(verified_tempo(&data,"Other Song","Daft Punk"),None);
        let ambiguous=serde_json::json!({"search":[
            {"title":"Get Lucky","artist":{"name":"Daft Punk"},"tempo":116},
            {"title":"Get Lucky","artist":{"name":"Daft Punk"},"tempo":128}
        ]});
        assert_eq!(verified_tempo(&ambiguous,"Get Lucky","Daft Punk"),None);
    }
}
