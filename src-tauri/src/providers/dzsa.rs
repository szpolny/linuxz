use crate::error::AppError;
use serde::Deserialize;
use std::collections::BTreeSet;
use std::time::Duration;
use tokio::task::JoinSet;

#[derive(Debug, Deserialize)]
pub struct DzsaResponse {
  pub status: i32,
  pub result: Option<DzsaResult>,
  pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DzsaResult {
  pub game_port: u16,
  pub name: String,
  pub map: String,
  pub version: String,
  pub password: bool,
  #[serde(rename = "battlEye")]
  pub battleye: bool,
  pub first_person_only: bool,
  pub time: String,
  #[serde(default)]
  pub mods: Vec<DzsaMod>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DzsaMod {
  pub name: String,
  pub steam_workshop_id: Option<u64>,
}

pub async fn fetch_details_for_server(
  ip: &str,
  query_port: u16,
  connect_port: Option<u16>,
) -> Result<DzsaResult, AppError> {
  let mut candidates = BTreeSet::new();
  candidates.insert(query_port);
  if let Some(connect_port) = connect_port {
    candidates.insert(connect_port);
    candidates.insert(connect_port.saturating_add(1));
    candidates.insert(connect_port.saturating_add(3));
  }
  if query_port > 3 {
    candidates.insert(query_port.saturating_sub(3));
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(2))
    .build()?;
  let mut join_set = JoinSet::new();

  for port in candidates {
    let client = client.clone();
    let ip = ip.to_owned();
    join_set.spawn(async move {
      let endpoint = format!("{ip}:{port}");
      let url = format!("https://www.dayzsalauncher.com/api/v1/query/{endpoint}");
      let response = client.get(&url).send().await?.error_for_status()?;
      let payload = response.json::<DzsaResponse>().await?;

      if payload.status == 0 {
        return payload
          .result
          .ok_or_else(|| AppError::new("DZSA returned success without a result payload"));
      }

      Err(AppError::new(
        payload
          .error
          .unwrap_or_else(|| String::from("DZSA returned an error response")),
      ))
    });
  }

  let mut last_error = None;
  while let Some(result) = join_set.join_next().await {
    match result {
      Ok(Ok(details)) => return Ok(details),
      Ok(Err(error)) => last_error = Some(error.to_string()),
      Err(error) => last_error = Some(error.to_string()),
    }
  }

  Err(AppError::new(
    last_error.unwrap_or_else(|| String::from("DZSA did not return server metadata for any attempted port")),
  ))
}

#[cfg(test)]
mod tests {
  use super::DzsaResponse;

  #[test]
  fn parses_live_like_dzsa_payload_with_mods() {
    let payload = r#"{
      "status": 0,
      "result": {
        "gamePort": 2302,
        "name": "KarmaKrew Chernarus #1 EU - 1PP | VANILLA + MODS",
        "map": "chernarusplus",
        "version": "1.28.161464",
        "password": false,
        "battlEye": true,
        "firstPersonOnly": true,
        "time": "14:10",
        "mods": [
          { "name": "Building Fortifications", "steamWorkshopId": 2670506982 },
          { "name": "FlipTransport", "steamWorkshopId": 1832448183 }
        ]
      }
    }"#;

    let response = serde_json::from_str::<DzsaResponse>(payload).expect("dzsa payload should deserialize");
    let result = response.result.expect("dzsa payload should include result");
    assert!(result.battleye);
    assert_eq!(result.mods.len(), 2);
    assert_eq!(result.mods[0].steam_workshop_id, Some(2_670_506_982));
  }
}
