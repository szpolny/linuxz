use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LaunchMode {
    SteamHandoff,
    DirectProton,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SteamInstall {
    pub id: String,
    pub kind: String,
    pub root_path: String,
    pub library_paths: Vec<String>,
    pub has_dayz: bool,
    pub has_workshop_manifest: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DayzInstall {
    pub game_path: String,
    pub app_manifest_path: String,
    pub workshop_manifest_path: String,
    pub compat_data_path: String,
    pub documents_path: String,
    pub launcher_preset_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSettings {
    #[serde(default)]
    pub onboarding_completed: bool,
    pub default_player_name: String,
    pub launch_mode: LaunchMode,
    pub preferred_steam_install_id: Option<String>,
    pub preferred_proton_path: Option<String>,
    #[serde(default)]
    pub custom_launch_command: Option<String>,
    pub enable_battlemetrics: bool,
    #[serde(
        default = "default_true",
        alias = "enableDzsaExperimental",
        deserialize_with = "deserialize_boolish"
    )]
    pub enable_dzsa_provider: bool,
}

impl Default for LaunchSettings {
    fn default() -> Self {
        Self {
            onboarding_completed: false,
            default_player_name: String::from("survivor"),
            launch_mode: LaunchMode::DirectProton,
            preferred_steam_install_id: None,
            preferred_proton_path: None,
            custom_launch_command: None,
            enable_battlemetrics: true,
            enable_dzsa_provider: true,
        }
    }
}

fn default_true() -> bool {
    true
}

fn deserialize_boolish<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Boolish {
        Bool(bool),
        U64(u64),
        I64(i64),
        String(String),
    }

    match Boolish::deserialize(deserializer)? {
        Boolish::Bool(value) => Ok(value),
        Boolish::U64(value) => Ok(value != 0),
        Boolish::I64(value) => Ok(value != 0),
        Boolish::String(value) => match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "enabled" => Ok(true),
            "false" | "0" | "disabled" => Ok(false),
            _ => Err(serde::de::Error::custom(
                "invalid boolean value for enableDzsaProvider",
            )),
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrap {
    pub detected_steam_installs: Vec<SteamInstall>,
    pub selected_steam_install_id: Option<String>,
    pub dayz_install: Option<DayzInstall>,
    pub compatdata_ready: bool,
    pub workshop_manifest_ready: bool,
    pub available_launch_modes: Vec<LaunchMode>,
    pub settings: LaunchSettings,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerRecord {
    pub endpoint: String,
    pub ip: String,
    pub query_port: u16,
    pub connect_port: Option<u16>,
    pub display_name: String,
    pub map: String,
    pub players: u32,
    pub max_players: u32,
    pub ping: Option<u32>,
    pub source_coverage: Vec<String>,
    pub readiness: String,
    pub version: Option<String>,
    pub country: Option<String>,
    pub has_password: bool,
    pub modded: bool,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub last_joined_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RequiredMod {
    pub workshop_id: String,
    pub display_name: String,
    pub source: String,
    pub installed_state: String,
    pub download_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerDetails {
    pub server: ServerRecord,
    pub rules: BTreeMap<String, String>,
    pub required_mods: Vec<RequiredMod>,
    pub warnings: Vec<String>,
    pub provider_provenance: Vec<String>,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ListServersRequest {
    pub search: String,
    pub modded_only: bool,
    pub player_floor: u32,
    pub limit: u32,
    pub page: u32,
    pub sort_by: ServerSort,
}

impl Default for ListServersRequest {
    fn default() -> Self {
        Self {
            search: String::new(),
            modded_only: false,
            player_floor: 0,
            limit: 25,
            page: 1,
            sort_by: ServerSort::Players,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ServerSort {
    Players,
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedServersResponse {
    pub items: Vec<ServerRecord>,
    pub page: u32,
    pub page_size: u32,
    pub has_previous_page: bool,
    pub has_next_page: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerLibrary {
    pub favorites: Vec<ServerRecord>,
    pub recents: Vec<ServerRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerLookup {
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JoinPreparationRequest {
    pub endpoint: String,
    pub ip: String,
    pub query_port: u16,
    pub connect_port: Option<u16>,
    pub settings: LaunchSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JoinPreparationResult {
    pub job_id: String,
    pub launch_mode: LaunchMode,
    pub launch_args: Vec<String>,
    pub blocking_issues: Vec<String>,
    pub warnings: Vec<String>,
    pub resolved_mods: Vec<RequiredMod>,
    pub ready_to_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JoinJobStatus {
    pub job_id: String,
    pub phase: String,
    pub progress: f32,
    pub message: String,
    pub missing_mods: Vec<String>,
    pub subscribed_mods: Vec<String>,
    pub installed_mods: Vec<String>,
    pub ready_to_launch: bool,
    pub warnings: Vec<String>,
    pub launch_result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JobLookup {
    pub job_id: String,
}
