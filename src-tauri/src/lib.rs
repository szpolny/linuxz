mod app_state;
mod contracts;
mod dayz;
mod error;
mod jobs;
mod launch;
mod providers;
mod settings;
mod steam;
mod workshop;

use crate::app_state::AppState;
use crate::contracts::{
    AppBootstrap, JobLookup, JoinJobStatus, JoinPreparationRequest, JoinPreparationResult,
    LaunchSettings, ListServersRequest, PaginatedServersResponse, ProtonDiscoveryRequest,
    ProtonInstall, RequiredMod, ServerDetails, ServerLibrary, ServerLookup, ServerRecord,
};
use crate::error::AppError;
use crate::jobs::{get_job, upsert_job};
use crate::providers::get_server_details as hydrate_server_details;
use crate::steam::discovery::bootstrap;
use crate::workshop::steamworks::SteamworksAdapter;
use tauri::Manager;
use uuid::Uuid;

struct PreparedJoinPlan {
    result: JoinPreparationResult,
    server: ServerRecord,
}

#[tauri::command]
async fn bootstrap_scan(state: tauri::State<'_, AppState>) -> Result<AppBootstrap, String> {
    bootstrap(&state.db_path).map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_settings(state: tauri::State<'_, AppState>) -> Result<LaunchSettings, String> {
    settings::load_settings(&state.db_path).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_settings(
    state: tauri::State<'_, AppState>,
    settings: LaunchSettings,
) -> Result<LaunchSettings, String> {
    settings::save_settings(&state.db_path, &settings).map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_installed_protons(
    request: ProtonDiscoveryRequest,
) -> Result<Vec<ProtonInstall>, String> {
    crate::steam::discovery::list_proton_installs(request.preferred_steam_install_id.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_servers(
    state: tauri::State<'_, AppState>,
    request: Option<ListServersRequest>,
) -> Result<PaginatedServersResponse, String> {
    let request = request.unwrap_or_default();
    let settings = settings::load_settings(&state.db_path).map_err(|error| error.to_string())?;
    providers::list_servers(
        &request,
        &state.db_path,
        settings.enable_battlemetrics,
        settings.enable_dzsa_provider,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_server_details(
    state: tauri::State<'_, AppState>,
    lookup: ServerLookup,
) -> Result<ServerDetails, String> {
    let settings = settings::load_settings(&state.db_path).map_err(|error| error.to_string())?;
    let record = resolve_server_record(&state, &lookup.endpoint)
        .await
        .map_err(|error| error.to_string())?;
    hydrate_server_details(record, settings.enable_dzsa_provider)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_server_library(state: tauri::State<'_, AppState>) -> Result<ServerLibrary, String> {
    let library =
        settings::load_server_library(&state.db_path, 6).map_err(|error| error.to_string())?;
    Ok(providers::refresh_server_library(library).await)
}

#[tauri::command]
async fn save_server_favorite(
    state: tauri::State<'_, AppState>,
    server: ServerRecord,
    favorite: bool,
) -> Result<ServerRecord, String> {
    settings::save_server_favorite(&state.db_path, &server, favorite)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_detected_mods(state: tauri::State<'_, AppState>) -> Result<Vec<RequiredMod>, String> {
    let bootstrap = bootstrap(&state.db_path).map_err(|error| error.to_string())?;
    let dayz = bootstrap
        .dayz_install
        .ok_or_else(|| String::from("DayZ install could not be detected"))?;
    dayz::install::read_installed_mods(&dayz).map_err(|error| error.to_string())
}

#[tauri::command]
async fn prepare_join(
    state: tauri::State<'_, AppState>,
    request: JoinPreparationRequest,
) -> Result<JoinPreparationResult, String> {
    prepare_join_impl(state.inner().clone(), request)
        .await
        .map(|plan| plan.result)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn launch_server(
    state: tauri::State<'_, AppState>,
    request: JoinPreparationRequest,
) -> Result<JoinJobStatus, String> {
    let job_id = Uuid::new_v4().to_string();
    let initial_status = JoinJobStatus {
        job_id: job_id.clone(),
        phase: String::from("preparing"),
        progress: 0.12,
        message: String::from("Preparing join workflow"),
        missing_mods: Vec::new(),
        subscribed_mods: Vec::new(),
        installed_mods: Vec::new(),
        ready_to_launch: false,
        warnings: Vec::new(),
        launch_result: None,
    };
    let state_clone = state.inner().clone();
    upsert_job(&state_clone, initial_status.clone()).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn(async move {
        let _ = run_launch_job(state_clone, request, job_id).await;
    });
    Ok(initial_status)
}

#[tauri::command]
async fn get_job_status(
    state: tauri::State<'_, AppState>,
    lookup: JobLookup,
) -> Result<JoinJobStatus, String> {
    get_job(state.inner(), &lookup.job_id).map_err(|error| error.to_string())
}

async fn resolve_server_record(state: &AppState, endpoint: &str) -> Result<ServerRecord, AppError> {
    if let Some(record) = settings::load_server_snapshot(&state.db_path, endpoint)? {
        return Ok(record);
    }

    let (ip, query_port) = endpoint
        .split_once(':')
        .ok_or_else(|| AppError::new(format!("Invalid server endpoint format: {endpoint}")))?;
    let query_port = query_port
        .parse::<u16>()
        .map_err(|_| AppError::new(format!("Invalid query port in endpoint: {endpoint}")))?;

    Ok(ServerRecord {
        endpoint: endpoint.to_string(),
        ip: ip.to_string(),
        query_port,
        connect_port: Some(query_port.saturating_sub(3)),
        display_name: endpoint.to_string(),
        map: String::from("unknown"),
        players: 0,
        max_players: 0,
        ping: None,
        source_coverage: Vec::new(),
        readiness: String::from("pending"),
        version: None,
        country: None,
        has_password: false,
        modded: false,
        official: false,
        is_favorite: false,
        last_joined_at: None,
    })
}

async fn prepare_join_impl(
    state: AppState,
    request: JoinPreparationRequest,
) -> Result<PreparedJoinPlan, AppError> {
    let bootstrap_state = bootstrap(&state.db_path)?;
    let dayz = bootstrap_state
        .dayz_install
        .ok_or_else(|| AppError::new("DayZ install could not be detected"))?;
    let record = ServerRecord {
        endpoint: request.endpoint.clone(),
        ip: request.ip.clone(),
        query_port: request.query_port,
        connect_port: request.connect_port,
        display_name: request.endpoint.clone(),
        map: String::from("unknown"),
        players: 0,
        max_players: 0,
        ping: None,
        source_coverage: Vec::new(),
        readiness: String::from("pending"),
        version: None,
        country: None,
        has_password: false,
        modded: false,
        official: false,
        is_favorite: false,
        last_joined_at: None,
    };
    let details = hydrate_server_details(record, request.settings.enable_dzsa_provider).await?;
    let resolved_server = details.server.clone();
    let resolved_mods = workshop::reconcile_mods(&dayz, &details.required_mods)?;
    let blocking_issues = if resolved_mods
        .iter()
        .any(|item| item.installed_state == "missing")
    {
        vec![String::from(
            "One or more required workshop mods are still missing.",
        )]
    } else {
        Vec::new()
    };
    let (launch_mode, proton_path) = launch::resolve_runtime_launch_mode(&dayz, &request.settings);
    let launch_args = launch::build_launch_args(
        &dayz,
        &request.settings,
        &request.ip,
        request.connect_port.unwrap_or(request.query_port),
        &resolved_mods,
    );
    let mut warnings = details.warnings;
    if request.settings.preferred_proton_path.is_none() {
        if let Some(path) = proton_path {
            warnings.push(format!(
                "Auto-detected Proton runtime at {path} for direct join launch."
            ));
        }
    }
    Ok(PreparedJoinPlan {
        result: JoinPreparationResult {
            job_id: Uuid::new_v4().to_string(),
            launch_mode,
            launch_args,
            blocking_issues,
            warnings,
            resolved_mods,
            ready_to_launch: details.required_mods.is_empty()
                || details.required_mods.iter().all(|item| {
                    item.workshop_id
                        .chars()
                        .all(|character| character.is_ascii_digit())
                }),
        },
        server: resolved_server,
    })
}

async fn run_launch_job(
    state: AppState,
    request: JoinPreparationRequest,
    job_id: String,
) -> Result<(), AppError> {
    let bootstrap_state = bootstrap(&state.db_path)?;
    let dayz = bootstrap_state
        .dayz_install
        .ok_or_else(|| AppError::new("DayZ install could not be detected"))?;
    let preparation = prepare_join_impl(state.clone(), request.clone()).await?;
    let resolved_mods = preparation.result.resolved_mods.clone();
    let missing_mods = resolved_mods
        .iter()
        .filter(|item| item.installed_state == "missing")
        .map(|item| item.workshop_id.clone())
        .collect::<Vec<_>>();
    let installed_mods = resolved_mods
        .iter()
        .filter(|item| item.installed_state == "installed")
        .map(|item| item.workshop_id.clone())
        .collect::<Vec<_>>();

    let mut status = JoinJobStatus {
        job_id: job_id.clone(),
        phase: String::from("preflight"),
        progress: 0.36,
        message: String::from("Join plan resolved"),
        missing_mods: missing_mods.clone(),
        subscribed_mods: Vec::new(),
        installed_mods: installed_mods.clone(),
        ready_to_launch: missing_mods.is_empty(),
        warnings: preparation.result.warnings.clone(),
        launch_result: None,
    };
    upsert_job(&state, status.clone())?;

    if !missing_mods.is_empty() {
        let mut guided_fallback_ids = missing_mods.clone();

        if SteamworksAdapter::available() {
            status.phase = String::from("steamworks");
            status.progress = 0.55;
            status.message =
                String::from("Subscribing to missing workshop mods through Steamworks");
            upsert_job(&state, status.clone())?;

            match tokio::task::spawn_blocking({
                let missing_mods = missing_mods.clone();
                move || SteamworksAdapter::subscribe_items(&missing_mods)
            })
            .await
            {
                Ok(Ok(subscription_result)) => {
                    status.subscribed_mods = subscription_result.subscribed_ids.clone();
                    status.warnings.extend(subscription_result.warnings);
                    if subscription_result.subscribed_ids.is_empty() {
                        status.warnings.push(String::from(
                            "Steamworks did not accept any missing mods for subscription.",
                        ));
                    }
                    guided_fallback_ids = subscription_result.failed_ids;
                    status.message = if guided_fallback_ids.is_empty() {
                        String::from("Steam accepted the missing workshop subscriptions. Waiting for downloads.")
                    } else {
                        String::from(
                            "Steam subscribed some mods. Opening guided fallback for the rest.",
                        )
                    };
                    upsert_job(&state, status.clone())?;
                }
                Ok(Err(error)) => {
                    status
                        .warnings
                        .push(format!("Steamworks subscription failed: {error}"));
                    status
                        .warnings
                        .push(String::from("Falling back to guided Steam flow."));
                    upsert_job(&state, status.clone())?;
                }
                Err(error) => {
                    status.warnings.push(format!(
                        "Steamworks task failed before subscription completed: {error}"
                    ));
                    status
                        .warnings
                        .push(String::from("Falling back to guided Steam flow."));
                    upsert_job(&state, status.clone())?;
                }
            }
        }

        if !guided_fallback_ids.is_empty() {
            for workshop_id in &guided_fallback_ids {
                let uri = format!("steam://url/CommunityFilePage/{workshop_id}");
                let _ = std::process::Command::new("xdg-open").arg(uri).status();
            }

            status.phase = String::from("guided-download");
            status.progress = 0.64;
            status.message = String::from(
                "Opened remaining workshop items in Steam. Waiting for local installs.",
            );
            upsert_job(&state, status.clone())?;
        } else {
            status.phase = String::from("steam-download");
            status.progress = 0.64;
            status.message =
                String::from("Waiting for Steam to finish downloading subscribed workshop mods.");
            upsert_job(&state, status.clone())?;
        }

        for _ in 0..90 {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            let refreshed = workshop::reconcile_mods(&dayz, &resolved_mods)?;
            let still_missing = refreshed
                .iter()
                .filter(|item| item.installed_state == "missing")
                .map(|item| item.workshop_id.clone())
                .collect::<Vec<_>>();
            let ready = still_missing.is_empty();
            status.missing_mods = still_missing;
            status.installed_mods = refreshed
                .iter()
                .filter(|item| item.installed_state == "installed")
                .map(|item| item.workshop_id.clone())
                .collect();
            status.ready_to_launch = ready;
            status.progress = if ready { 0.82 } else { 0.72 };
            upsert_job(&state, status.clone())?;
            if ready {
                break;
            }
        }
    }

    if !status.missing_mods.is_empty() {
        status.phase = String::from("blocked");
        status.progress = 1.0;
        status.message = String::from("Waiting for missing workshop mods to finish installing.");
        upsert_job(&state, status)?;
        return Ok(());
    }

    status.phase = String::from("launching");
    status.progress = 0.9;
    status.message = String::from("Launching DayZ");
    upsert_job(&state, status.clone())?;

    let result = launch::launch(&dayz, &request.settings, &preparation.result.launch_args)?;
    let _ = settings::record_recent_server(&state.db_path, &preparation.server);
    status.phase = String::from("complete");
    status.progress = 1.0;
    status.ready_to_launch = true;
    status.message = String::from("Launch command dispatched");
    status.launch_result = Some(result);
    upsert_job(&state, status)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = AppState::new(app.handle())?;
            app.manage(state);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_scan,
            get_settings,
            save_settings,
            list_installed_protons,
            list_servers,
            get_server_details,
            get_server_library,
            save_server_favorite,
            prepare_join,
            launch_server,
            list_detected_mods,
            get_job_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
