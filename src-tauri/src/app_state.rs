use crate::contracts::JoinJobStatus;
use crate::error::AppError;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct AppState {
  pub db_path: PathBuf,
  pub jobs: Arc<Mutex<HashMap<String, JoinJobStatus>>>,
}

impl AppState {
  pub fn new(app: &AppHandle) -> Result<Self, AppError> {
    let app_dir = app
      .path()
      .app_data_dir()
      .map_err(|error| AppError::new(error.to_string()))?;
    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("dayz-launcher.sqlite3");
    let connection = Connection::open(&db_path)?;
    connection.execute_batch(
      "
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_cache (
        endpoint TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ",
    )?;
    Ok(Self {
      db_path,
      jobs: Arc::new(Mutex::new(HashMap::new())),
    })
  }
}
