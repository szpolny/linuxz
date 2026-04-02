use crate::contracts::{DayzInstall, LaunchMode, LaunchSettings, RequiredMod};
use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::process::Command;

const DAYZ_APP_ID: &str = "221100";

pub fn build_launch_args(
    dayz: &DayzInstall,
    settings: &LaunchSettings,
    endpoint_ip: &str,
    connect_port: u16,
    required_mods: &[RequiredMod],
) -> Vec<String> {
    let mut args = vec![
        format!("-connect={endpoint_ip}"),
        format!("-port={connect_port}"),
    ];

    if !settings.default_player_name.trim().is_empty() {
        args.push(format!("-name={}", settings.default_player_name.trim()));
    }

    let workshop_manifest = Path::new(&dayz.workshop_manifest_path);
    let mod_paths = required_mods
        .iter()
        .filter(|item| item.installed_state == "installed")
        .map(|item| {
            let path = crate::dayz::install::mod_install_path(workshop_manifest, &item.workshop_id);
            linux_path_to_proton_drive(&path)
        })
        .collect::<Vec<_>>();

    if !mod_paths.is_empty() {
        args.push(format!("-mod={}", mod_paths.join(";")));
    }

    args
}

pub fn launch(
    dayz: &DayzInstall,
    settings: &LaunchSettings,
    args: &[String],
) -> Result<String, AppError> {
    let (_, proton_path) = resolve_runtime_launch_mode(dayz, settings);
    let proton = proton_path
        .ok_or_else(|| AppError::new("No Proton binary could be resolved for direct launch"))?;
    let steam_root = steam_root(dayz)?;
    let library_root = game_library_root(dayz)?;
    let executable = select_game_executable(dayz);
    let launch_argv = build_direct_proton_argv(&proton, steam_root, &executable);
    let mut command = build_launch_command(
        &launch_argv,
        args,
        settings.custom_launch_command.as_deref(),
    )?;
    let mut compat_library_paths = vec![steam_root.to_string()];
    if library_root != steam_root {
        compat_library_paths.push(library_root.to_string());
    }

    command
        .env("SteamAppId", DAYZ_APP_ID)
        .env("SteamGameId", DAYZ_APP_ID)
        .env("STEAM_COMPAT_APP_ID", DAYZ_APP_ID)
        .env("STEAM_COMPAT_DATA_PATH", &dayz.compat_data_path)
        .env("STEAM_COMPAT_CLIENT_INSTALL_PATH", steam_root)
        .env("STEAM_COMPAT_INSTALL_PATH", &dayz.game_path)
        .env("STEAM_COMPAT_LIBRARY_PATHS", compat_library_paths.join(":"));

    if let Some(ld_preload) = build_overlay_preload(Path::new(steam_root)) {
        command.env("LD_PRELOAD", ld_preload);
    }

    let status = command.status()?;
    Ok(format!("Direct Proton launch exited with status {status}"))
}

pub fn resolve_runtime_launch_mode(
    dayz: &DayzInstall,
    settings: &LaunchSettings,
) -> (LaunchMode, Option<String>) {
    (
        LaunchMode::DirectProton,
        resolve_proton_path(dayz, settings),
    )
}

fn resolve_proton_path(dayz: &DayzInstall, settings: &LaunchSettings) -> Option<String> {
    if let Some(path) = settings
        .preferred_proton_path
        .as_ref()
        .filter(|path| Path::new(path).exists())
    {
        return Some(path.clone());
    }

    let steam_root = dayz.app_manifest_path.split("/steamapps/").next()?;
    find_proton_in_root(Path::new(steam_root)).map(|path| path.display().to_string())
}

fn find_proton_in_root(steam_root: &Path) -> Option<PathBuf> {
    let common_path = steam_root.join("steamapps").join("common");
    let preferred = common_path.join("Proton - Experimental").join("proton");
    if preferred.exists() {
        return Some(preferred);
    }

    let mut candidates = std::fs::read_dir(common_path)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("proton"))
        .filter(|path| path.exists())
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.pop()
}

fn build_direct_proton_argv(proton: &str, steam_root: &str, executable: &Path) -> Vec<String> {
    if let Some(runtime_entry) = resolve_steam_runtime_entry(Path::new(steam_root)) {
        return vec![
            runtime_entry.display().to_string(),
            "--verb=waitforexitandrun".to_string(),
            "--".to_string(),
            proton.to_string(),
            "waitforexitandrun".to_string(),
            executable.display().to_string(),
        ];
    }

    vec![
        proton.to_string(),
        "waitforexitandrun".to_string(),
        executable.display().to_string(),
    ]
}

fn build_launch_command(
    launch_argv: &[String],
    args: &[String],
    custom_launch_command: Option<&str>,
) -> Result<Command, AppError> {
    let executable = launch_argv
        .first()
        .ok_or_else(|| AppError::new("Launch command could not be constructed"))?;

    let custom_launch_command = custom_launch_command
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(template) = custom_launch_command {
        let default_command = render_default_launch_command(launch_argv, args);
        let mut command = Command::new("sh");
        command
            .arg("-lc")
            .arg(render_custom_launch_script(template, &default_command));
        return Ok(command);
    }

    let mut command = Command::new(executable);
    command.args(&launch_argv[1..]).args(args);
    Ok(command)
}

fn render_default_launch_command(launch_argv: &[String], args: &[String]) -> String {
    let parts = launch_argv
        .iter()
        .map(String::as_str)
        .chain(args.iter().map(String::as_str));
    shell_join(parts)
}

fn render_custom_launch_script(template: &str, default_command: &str) -> String {
    let trimmed = template.trim();
    if trimmed.contains("%command%") {
        return trimmed.replace("%command%", default_command);
    }

    if trimmed.starts_with('-') {
        return format!("{default_command} {trimmed}");
    }

    format!("{trimmed} {default_command}")
}

fn shell_join<'a>(parts: impl IntoIterator<Item = &'a str>) -> String {
    parts
        .into_iter()
        .map(shell_quote)
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    if value.bytes().all(is_shell_safe) {
        return value.to_string();
    }

    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn is_shell_safe(byte: u8) -> bool {
    matches!(
      byte,
      b'a'..=b'z'
        | b'A'..=b'Z'
        | b'0'..=b'9'
        | b'_'
        | b'@'
        | b'%'
        | b'+'
        | b'='
        | b':'
        | b','
        | b'.'
        | b'/'
        | b'-'
    )
}

fn resolve_steam_runtime_entry(steam_root: &Path) -> Option<PathBuf> {
    [
        "SteamLinuxRuntime_sniper",
        "SteamLinuxRuntime_soldier",
        "SteamLinuxRuntime",
    ]
    .into_iter()
    .map(|runtime| {
        steam_root
            .join("steamapps")
            .join("common")
            .join(runtime)
            .join("_v2-entry-point")
    })
    .find(|path| path.exists())
}

fn build_overlay_preload(steam_root: &Path) -> Option<String> {
    let preload = [
        "ubuntu12_32/gameoverlayrenderer.so",
        "ubuntu12_64/gameoverlayrenderer.so",
    ]
    .into_iter()
    .map(|relative| steam_root.join(relative))
    .filter(|path| path.exists())
    .map(|path| path.display().to_string())
    .collect::<Vec<_>>();

    if preload.is_empty() {
        None
    } else {
        Some(preload.join(":"))
    }
}

fn steam_root(dayz: &DayzInstall) -> Result<&str, AppError> {
    dayz.app_manifest_path
        .split("/steamapps/")
        .next()
        .ok_or_else(|| AppError::new("Could not infer Steam root from app manifest path"))
}

fn game_library_root(dayz: &DayzInstall) -> Result<&str, AppError> {
    dayz.game_path
        .split("/steamapps/")
        .next()
        .ok_or_else(|| AppError::new("Could not infer Steam library root from game path"))
}

fn select_game_executable(dayz: &DayzInstall) -> PathBuf {
    let be = Path::new(&dayz.game_path).join("DayZ_BE.exe");
    if be.exists() {
        return be;
    }
    Path::new(&dayz.game_path).join("DayZ_x64.exe")
}

fn linux_path_to_proton_drive(path: &Path) -> String {
    let rendered = path.display().to_string().replace('/', "\\");
    format!("Z:{rendered}")
}

#[cfg(test)]
mod tests {
    use super::{
        build_launch_args, build_overlay_preload, render_custom_launch_script,
        render_default_launch_command, resolve_runtime_launch_mode, select_game_executable,
        shell_quote,
    };
    use crate::contracts::{DayzInstall, LaunchMode, LaunchSettings, RequiredMod};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("dayz-launcher-test-{}-{nanos}", std::process::id()))
    }

    fn build_test_dayz(app_manifest_path: PathBuf) -> DayzInstall {
        DayzInstall {
            game_path: "/games/DayZ".to_string(),
            app_manifest_path: app_manifest_path.display().to_string(),
            workshop_manifest_path: "/steam/steamapps/workshop/appworkshop_221100.acf".to_string(),
            compat_data_path: "/steam/steamapps/compatdata/221100".to_string(),
            documents_path: "/docs".to_string(),
            launcher_preset_path: "/presets".to_string(),
        }
    }

    #[test]
    fn builds_launch_arguments() {
        let dayz = DayzInstall {
            game_path: "/games/DayZ".to_string(),
            app_manifest_path: "/steam/steamapps/appmanifest_221100.acf".to_string(),
            workshop_manifest_path: "/steam/steamapps/workshop/appworkshop_221100.acf".to_string(),
            compat_data_path: "/steam/steamapps/compatdata/221100".to_string(),
            documents_path: "/docs".to_string(),
            launcher_preset_path: "/presets".to_string(),
        };
        let settings = LaunchSettings {
            onboarding_completed: false,
            default_player_name: "Szymon".to_string(),
            launch_mode: LaunchMode::DirectProton,
            preferred_steam_install_id: None,
            preferred_proton_path: None,
            custom_launch_command: None,
            enable_battlemetrics: true,
            enable_dzsa_provider: true,
        };
        let args = build_launch_args(
            &dayz,
            &settings,
            "127.0.0.1",
            2302,
            &[RequiredMod {
                workshop_id: "1559212036".to_string(),
                display_name: "CF".to_string(),
                source: "dzsa".to_string(),
                installed_state: "installed".to_string(),
                download_state: "ready".to_string(),
            }],
        );
        assert!(args.iter().any(|item| item == "-connect=127.0.0.1"));
        assert!(args.iter().any(|item| item == "-port=2302"));
        assert!(args.iter().any(|item| item == "-name=Szymon"));
        assert!(args.iter().any(|item| item.starts_with("-mod=Z:\\")));
    }

    #[test]
    fn reports_direct_proton_when_runtime_is_available() {
        let temp = unique_test_dir();
        let proton_dir = temp.join("steamapps/common/Proton - Experimental");
        std::fs::create_dir_all(&proton_dir).expect("test proton dir");
        std::fs::write(proton_dir.join("proton"), b"#!/bin/sh").expect("test proton file");

        let dayz = build_test_dayz(temp.join("steamapps/appmanifest_221100.acf"));
        let settings = LaunchSettings::default();

        let (mode, proton_path) = resolve_runtime_launch_mode(&dayz, &settings);
        assert_eq!(mode, LaunchMode::DirectProton);
        assert!(proton_path.is_some());

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn uses_direct_proton_when_requested_and_available() {
        let temp = unique_test_dir();
        let proton_dir = temp.join("steamapps/common/Proton - Experimental");
        std::fs::create_dir_all(&proton_dir).expect("test proton dir");
        std::fs::write(proton_dir.join("proton"), b"#!/bin/sh").expect("test proton file");

        let dayz = build_test_dayz(temp.join("steamapps/appmanifest_221100.acf"));
        let settings = LaunchSettings {
            launch_mode: LaunchMode::DirectProton,
            ..LaunchSettings::default()
        };

        let (mode, proton_path) = resolve_runtime_launch_mode(&dayz, &settings);
        assert_eq!(mode, LaunchMode::DirectProton);
        assert!(proton_path.is_some());

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn keeps_direct_proton_selected_when_runtime_is_unavailable() {
        let temp = unique_test_dir();
        let dayz = build_test_dayz(temp.join("steamapps/appmanifest_221100.acf"));
        let settings = LaunchSettings {
            launch_mode: LaunchMode::DirectProton,
            ..LaunchSettings::default()
        };

        let (mode, proton_path) = resolve_runtime_launch_mode(&dayz, &settings);
        assert_eq!(mode, LaunchMode::DirectProton);
        assert!(proton_path.is_none());
    }

    #[test]
    fn prefers_battleye_binary_for_direct_launches() {
        let temp = unique_test_dir();
        let game_path = temp.join("steamapps/common/DayZ");
        std::fs::create_dir_all(&game_path).expect("test game dir");
        std::fs::write(game_path.join("DayZLauncher.exe"), b"").expect("launcher exe");
        std::fs::write(game_path.join("DayZ_BE.exe"), b"").expect("battleye exe");
        std::fs::write(game_path.join("DayZ_x64.exe"), b"").expect("game exe");

        let dayz = DayzInstall {
            game_path: game_path.display().to_string(),
            app_manifest_path: temp
                .join("steamapps/appmanifest_221100.acf")
                .display()
                .to_string(),
            workshop_manifest_path: "/steam/steamapps/workshop/appworkshop_221100.acf".to_string(),
            compat_data_path: "/steam/steamapps/compatdata/221100".to_string(),
            documents_path: "/docs".to_string(),
            launcher_preset_path: "/presets".to_string(),
        };

        assert_eq!(select_game_executable(&dayz), game_path.join("DayZ_BE.exe"));

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn builds_overlay_preload_from_steam_root() {
        let temp = unique_test_dir();
        let overlay32 = temp.join("ubuntu12_32/gameoverlayrenderer.so");
        let overlay64 = temp.join("ubuntu12_64/gameoverlayrenderer.so");
        std::fs::create_dir_all(overlay32.parent().expect("overlay32 parent"))
            .expect("overlay32 dir");
        std::fs::create_dir_all(overlay64.parent().expect("overlay64 parent"))
            .expect("overlay64 dir");
        std::fs::write(&overlay32, b"").expect("overlay32");
        std::fs::write(&overlay64, b"").expect("overlay64");

        let preload = build_overlay_preload(&temp).expect("overlay preload");
        assert_eq!(
            preload,
            format!("{}:{}", overlay32.display(), overlay64.display())
        );

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn renders_custom_command_placeholder_with_quoted_default_command() {
        let default_command = render_default_launch_command(
            &[
                "/tmp/Proton Runner".to_string(),
                "waitforexitandrun".to_string(),
                "/games/Day Z/DayZ_x64.exe".to_string(),
            ],
            &[
                "-name=O'Brien".to_string(),
                "-connect=127.0.0.1".to_string(),
            ],
        );

        let rendered =
            render_custom_launch_script("PROTON_LOG=1 %command% -nosplash", &default_command);

        assert_eq!(
      rendered,
      "PROTON_LOG=1 '/tmp/Proton Runner' waitforexitandrun '/games/Day Z/DayZ_x64.exe' '-name=O'\"'\"'Brien' -connect=127.0.0.1 -nosplash"
    );
    }

    #[test]
    fn prefixes_wrapper_when_placeholder_is_omitted() {
        let rendered = render_custom_launch_script("gamemoderun", "default-command");
        assert_eq!(rendered, "gamemoderun default-command");
    }

    #[test]
    fn appends_flags_when_placeholder_is_omitted() {
        let rendered = render_custom_launch_script("-nosplash -noPause", "default-command");
        assert_eq!(rendered, "default-command -nosplash -noPause");
    }

    #[test]
    fn shell_quotes_values_with_single_quotes() {
        assert_eq!(shell_quote("O'Brien"), "'O'\"'\"'Brien'");
    }
}
