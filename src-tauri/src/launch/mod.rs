use crate::contracts::{DayzInstall, LaunchMode, LaunchSettings, RequiredMod};
use crate::error::AppError;
use crate::settings;
use std::path::{Path, PathBuf};
use std::process::Command;

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
  let (launch_mode, proton_path) = resolve_runtime_launch_mode(dayz, settings);

  match launch_mode {
    LaunchMode::SteamHandoff => {
      let status = Command::new("steam")
        .arg("-applaunch")
        .arg("221100")
        .args(args)
        .status()?;
      Ok(format!("Steam handoff exited with status {status}"))
    }
    LaunchMode::DirectProton => {
      let proton = proton_path.ok_or_else(|| AppError::new("No Proton binary could be resolved for direct launch"))?;
      let steam_root = dayz
        .app_manifest_path
        .split("/steamapps/")
        .next()
        .ok_or_else(|| AppError::new("Could not infer Steam root from app manifest path"))?;
      let executable = select_game_executable(dayz);
      let status = Command::new(proton)
        .env("STEAM_COMPAT_DATA_PATH", &dayz.compat_data_path)
        .env("STEAM_COMPAT_CLIENT_INSTALL_PATH", steam_root)
        .arg("run")
        .arg(executable)
        .args(args)
        .status()?;
      Ok(format!("Direct Proton launch exited with status {status}"))
    }
  }
}

pub fn resolve_runtime_launch_mode(dayz: &DayzInstall, settings: &LaunchSettings) -> (LaunchMode, Option<String>) {
  let proton_path = resolve_proton_path(dayz, settings);
  let direct_proton_available = proton_path.is_some();
  let requested = settings::effective_launch_mode(settings, direct_proton_available);

  if direct_proton_available {
    return (LaunchMode::DirectProton, proton_path);
  }

  (requested, None)
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
  use super::{build_launch_args, resolve_runtime_launch_mode};
  use crate::contracts::{DayzInstall, LaunchMode, LaunchSettings, RequiredMod};

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
      default_player_name: "Szymon".to_string(),
      launch_mode: LaunchMode::SteamHandoff,
      preferred_steam_install_id: None,
      preferred_proton_path: None,
      enable_battlemetrics: true,
      enable_dzsa_experimental: true,
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
  fn prefers_direct_proton_when_binary_exists() {
    let temp = std::env::temp_dir().join(format!("dayz-launcher-test-{}", std::process::id()));
    let proton_dir = temp.join("steamapps/common/Proton - Experimental");
    std::fs::create_dir_all(&proton_dir).expect("test proton dir");
    std::fs::write(proton_dir.join("proton"), b"#!/bin/sh").expect("test proton file");

    let dayz = DayzInstall {
      game_path: "/games/DayZ".to_string(),
      app_manifest_path: temp.join("steamapps/appmanifest_221100.acf").display().to_string(),
      workshop_manifest_path: "/steam/steamapps/workshop/appworkshop_221100.acf".to_string(),
      compat_data_path: "/steam/steamapps/compatdata/221100".to_string(),
      documents_path: "/docs".to_string(),
      launcher_preset_path: "/presets".to_string(),
    };
    let settings = LaunchSettings::default();

    let (mode, proton_path) = resolve_runtime_launch_mode(&dayz, &settings);
    assert_eq!(mode, LaunchMode::DirectProton);
    assert!(proton_path.is_some());

    let _ = std::fs::remove_dir_all(temp);
  }
}
