use crate::contracts::{LaunchMode, LaunchSettings, ServerLibrary, ServerRecord};
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;

pub fn load_settings(db_path: &Path) -> Result<LaunchSettings, AppError> {
    let connection = Connection::open(db_path)?;
    let row = connection.query_row("SELECT json FROM app_settings WHERE id = 1", [], |row| {
        row.get::<_, String>(0)
    });

    match row {
        Ok(json) => {
            let mut settings = serde_json::from_str::<LaunchSettings>(&json)?;
            let needs_normalization = !json.contains("\"onboardingCompleted\"")
                || !json.contains("\"customLaunchCommand\"")
                || json.contains("\"enableDzsaExperimental\"")
                || matches!(settings.launch_mode, LaunchMode::SteamHandoff);

            if matches!(settings.launch_mode, LaunchMode::SteamHandoff) {
                settings.launch_mode = LaunchMode::DirectProton;
            }

            if needs_normalization {
                save_settings(db_path, &settings)?;
            }

            Ok(settings)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let settings = LaunchSettings::default();
            save_settings(db_path, &settings)?;
            Ok(settings)
        }
        Err(error) => Err(AppError::from(error)),
    }
}

pub fn save_settings(
    db_path: &Path,
    settings: &LaunchSettings,
) -> Result<LaunchSettings, AppError> {
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
    let mut statement =
        connection.prepare("SELECT json FROM server_cache ORDER BY updated_at DESC")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut records = Vec::new();
    for row in rows {
        let json = row?;
        let record = serde_json::from_str::<ServerRecord>(&json)?;
        records.push(record);
    }
    merge_server_activity(db_path, records)
}

pub fn merge_server_activity(
    db_path: &Path,
    mut records: Vec<ServerRecord>,
) -> Result<Vec<ServerRecord>, AppError> {
    let connection = Connection::open(db_path)?;
    let activity = load_server_activity_map(&connection)?;

    for record in &mut records {
        if let Some((is_favorite, last_joined_at)) = activity.get(&record.endpoint) {
            apply_server_activity(record, *is_favorite, last_joined_at.clone());
        }
    }

    Ok(records)
}

pub fn load_server_snapshot(
    db_path: &Path,
    endpoint: &str,
) -> Result<Option<ServerRecord>, AppError> {
    let connection = Connection::open(db_path)?;

    if let Some(record) = query_server_snapshot(
        &connection,
        "SELECT json, favorite, last_joined_at FROM server_activity WHERE endpoint = ?1",
        endpoint,
    )? {
        return Ok(Some(record));
    }

    query_server_snapshot(
        &connection,
        "SELECT json, 0 as favorite, NULL as last_joined_at FROM server_cache WHERE endpoint = ?1",
        endpoint,
    )
}

pub fn load_server_library(db_path: &Path, limit: u32) -> Result<ServerLibrary, AppError> {
    let connection = Connection::open(db_path)?;
    let favorites = query_server_collection(
        &connection,
        "
        SELECT json, favorite, last_joined_at
        FROM server_activity
        WHERE favorite = 1
        ORDER BY COALESCE(last_joined_at, updated_at) DESC, endpoint ASC
        LIMIT ?1
        ",
        limit,
    )?;
    let recents = query_server_collection(
        &connection,
        "
        SELECT json, favorite, last_joined_at
        FROM server_activity
        WHERE last_joined_at IS NOT NULL
        ORDER BY last_joined_at DESC, endpoint ASC
        LIMIT ?1
        ",
        limit,
    )?;

    Ok(ServerLibrary { favorites, recents })
}

pub fn save_server_favorite(
    db_path: &Path,
    server: &ServerRecord,
    favorite: bool,
) -> Result<ServerRecord, AppError> {
    let connection = Connection::open(db_path)?;
    let last_joined_at = load_server_activity_state(&connection, &server.endpoint)?.1;
    let mut stored_server = server.clone();
    apply_server_activity(&mut stored_server, favorite, last_joined_at.clone());
    let updated_at = current_timestamp(&connection)?;

    connection.execute(
        "
        INSERT INTO server_activity (endpoint, favorite, last_joined_at, json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(endpoint) DO UPDATE SET
          favorite = excluded.favorite,
          last_joined_at = excluded.last_joined_at,
          json = excluded.json,
          updated_at = excluded.updated_at
        ",
        params![
            &stored_server.endpoint,
            favorite,
            last_joined_at,
            serde_json::to_string(&stored_server)?,
            updated_at,
        ],
    )?;

    Ok(stored_server)
}

pub fn record_recent_server(
    db_path: &Path,
    server: &ServerRecord,
) -> Result<ServerRecord, AppError> {
    let connection = Connection::open(db_path)?;
    let is_favorite = load_server_activity_state(&connection, &server.endpoint)?.0;
    let timestamp = current_timestamp(&connection)?;
    let mut stored_server = server.clone();
    apply_server_activity(&mut stored_server, is_favorite, Some(timestamp.clone()));

    connection.execute(
        "
        INSERT INTO server_activity (endpoint, favorite, last_joined_at, json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(endpoint) DO UPDATE SET
          favorite = excluded.favorite,
          last_joined_at = excluded.last_joined_at,
          json = excluded.json,
          updated_at = excluded.updated_at
        ",
        params![
            &stored_server.endpoint,
            stored_server.is_favorite,
            stored_server.last_joined_at.clone(),
            serde_json::to_string(&stored_server)?,
            timestamp,
        ],
    )?;

    Ok(stored_server)
}

pub fn effective_launch_mode(
    _settings: &LaunchSettings,
    _direct_proton_available: bool,
) -> LaunchMode {
    LaunchMode::DirectProton
}

fn apply_server_activity(
    record: &mut ServerRecord,
    is_favorite: bool,
    last_joined_at: Option<String>,
) {
    record.is_favorite = is_favorite;
    record.last_joined_at = last_joined_at;
}

fn current_timestamp(connection: &Connection) -> Result<String, AppError> {
    connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get::<_, String>(0)
        })
        .map_err(AppError::from)
}

fn load_server_activity_map(
    connection: &Connection,
) -> Result<HashMap<String, (bool, Option<String>)>, AppError> {
    let mut statement =
        connection.prepare("SELECT endpoint, favorite, last_joined_at FROM server_activity")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, bool>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut activity = HashMap::new();
    for row in rows {
        let (endpoint, favorite, last_joined_at) = row?;
        activity.insert(endpoint, (favorite, last_joined_at));
    }
    Ok(activity)
}

fn load_server_activity_state(
    connection: &Connection,
    endpoint: &str,
) -> Result<(bool, Option<String>), AppError> {
    Ok(connection
        .query_row(
            "SELECT favorite, last_joined_at FROM server_activity WHERE endpoint = ?1",
            params![endpoint],
            |row| Ok((row.get::<_, bool>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()?
        .unwrap_or((false, None)))
}

fn query_server_snapshot(
    connection: &Connection,
    sql: &str,
    endpoint: &str,
) -> Result<Option<ServerRecord>, AppError> {
    connection
        .query_row(sql, params![endpoint], |row| {
            let json = row.get::<_, String>(0)?;
            let favorite = row.get::<_, bool>(1)?;
            let last_joined_at = row.get::<_, Option<String>>(2)?;
            Ok((json, favorite, last_joined_at))
        })
        .optional()?
        .map(|(json, favorite, last_joined_at)| {
            let mut record = serde_json::from_str::<ServerRecord>(&json)?;
            apply_server_activity(&mut record, favorite, last_joined_at);
            Ok(record)
        })
        .transpose()
}

fn query_server_collection(
    connection: &Connection,
    sql: &str,
    limit: u32,
) -> Result<Vec<ServerRecord>, AppError> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, bool>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut records = Vec::new();
    for row in rows {
        let (json, favorite, last_joined_at) = row?;
        let mut record = serde_json::from_str::<ServerRecord>(&json)?;
        apply_server_activity(&mut record, favorite, last_joined_at);
        records.push(record);
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::{load_server_library, record_recent_server, save_server_favorite};
    use crate::contracts::ServerRecord;
    use rusqlite::Connection;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn db_path() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "linuxz-settings-test-{}-{nanos}.sqlite3",
            std::process::id()
        ))
    }

    fn initialize_schema(path: &std::path::Path) {
        let connection = Connection::open(path).expect("open db");
        connection
            .execute_batch(
                "
                CREATE TABLE app_settings (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  json TEXT NOT NULL
                );
                CREATE TABLE server_cache (
                  endpoint TEXT PRIMARY KEY,
                  json TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE server_activity (
                  endpoint TEXT PRIMARY KEY,
                  favorite INTEGER NOT NULL DEFAULT 0,
                  last_joined_at TEXT,
                  json TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                ",
            )
            .expect("create schema");
    }

    fn sample_server(endpoint: &str) -> ServerRecord {
        ServerRecord {
            endpoint: endpoint.to_string(),
            ip: String::from("127.0.0.1"),
            query_port: 2305,
            connect_port: Some(2302),
            display_name: format!("Server {endpoint}"),
            map: String::from("chernarusplus"),
            players: 12,
            max_players: 60,
            ping: Some(44),
            source_coverage: vec![String::from("test")],
            readiness: String::from("live"),
            version: Some(String::from("1.0")),
            country: Some(String::from("PL")),
            has_password: false,
            modded: true,
            official: false,
            is_favorite: false,
            last_joined_at: None,
        }
    }

    #[test]
    fn persists_favorites_and_recents() {
        let path = db_path();
        initialize_schema(&path);

        let favorite = save_server_favorite(&path, &sample_server("1.2.3.4:2305"), true)
            .expect("favorite save");
        assert!(favorite.is_favorite);
        assert!(favorite.last_joined_at.is_none());

        let recent =
            record_recent_server(&path, &sample_server("5.6.7.8:2305")).expect("recent save");
        assert!(recent.last_joined_at.is_some());

        let library = load_server_library(&path, 10).expect("load library");
        assert_eq!(library.favorites.len(), 1);
        assert_eq!(library.recents.len(), 1);
        assert_eq!(library.favorites[0].endpoint, "1.2.3.4:2305");
        assert_eq!(library.recents[0].endpoint, "5.6.7.8:2305");

        let _ = std::fs::remove_file(path);
    }
}
