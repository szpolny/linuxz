use crate::contracts::{LaunchMode, LaunchSettings, ServerRecord};
use crate::error::AppError;
use rusqlite::{params, Connection};
use std::path::Path;

pub fn load_settings(db_path: &Path) -> Result<LaunchSettings, AppError> {
  let connection = Connection::open(db_path)?;
  let row = connection.query_row(
    "SELECT json FROM app_settings WHERE id = 1",
    [],
    |row| row.get::<_, String>(0),
  );

  match row {
    Ok(json) => Ok(serde_json::from_str(&json)?),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      let settings = LaunchSettings::default();
      save_settings(db_path, &settings)?;
      Ok(settings)
    }
    Err(error) => Err(AppError::from(error)),
  }
}

pub fn save_settings(db_path: &Path, settings: &LaunchSettings) -> Result<LaunchSettings, AppError> {
  let connection = Connection::open(db_path)?;
  let json = serde_json::to_string(settings)?;
  connection.execute(
    "
    INSERT INTO app_settings (id, json) VALUES (1, ?1)
    ON CONFLICT(id) DO UPDATE SET json = excluded.json
    ",
    params![json],
  )?;
  Ok(settings.clone())
}

pub fn cache_servers(db_path: &Path, records: &[ServerRecord]) -> Result<(), AppError> {
  let mut connection = Connection::open(db_path)?;
  let transaction = connection.transaction()?;
  for record in records {
    transaction.execute(
      "
      INSERT INTO server_cache (endpoint, json, updated_at) VALUES (?1, ?2, datetime('now'))
      ON CONFLICT(endpoint) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
      ",
      params![record.endpoint, serde_json::to_string(record)?],
    )?;
  }
  transaction.commit()?;
  Ok(())
}

pub fn load_cached_servers(db_path: &Path) -> Result<Vec<ServerRecord>, AppError> {
  let connection = Connection::open(db_path)?;
  let mut statement = connection.prepare("SELECT json FROM server_cache ORDER BY updated_at DESC")?;
  let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
  let mut records = Vec::new();
  for row in rows {
    let json = row?;
    let record = serde_json::from_str::<ServerRecord>(&json)?;
    records.push(record);
  }
  Ok(records)
}

pub fn effective_launch_mode(settings: &LaunchSettings, direct_proton_available: bool) -> LaunchMode {
  if matches!(settings.launch_mode, LaunchMode::DirectProton) && direct_proton_available {
    LaunchMode::DirectProton
  } else {
    LaunchMode::SteamHandoff
  }
}
