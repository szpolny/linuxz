use crate::contracts::{AppBootstrap, DayzInstall, LaunchMode, SteamInstall};
use crate::error::AppError;
use crate::settings;
use std::path::{Path, PathBuf};

const DAYZ_APP_ID: &str = "221100";

#[derive(Debug, Clone)]
pub struct SteamInstallResolved {
    pub install: SteamInstall,
    pub dayz: Option<DayzInstall>,
}

pub fn bootstrap(db_path: &Path) -> Result<AppBootstrap, AppError> {
    let settings = settings::load_settings(db_path)?;
    let installs = detect_steam_installs()?;
    let selected = select_install(&installs, settings.preferred_steam_install_id.as_deref());
    let dayz = selected.as_ref().and_then(|install| install.dayz.clone());
    let compatdata_ready = dayz
        .as_ref()
        .map(|install| Path::new(&install.compat_data_path).exists())
        .unwrap_or(false);
    let workshop_manifest_ready = dayz
        .as_ref()
        .map(|install| Path::new(&install.workshop_manifest_path).exists())
        .unwrap_or(false);
    let available_launch_modes = vec![LaunchMode::DirectProton];
    let warnings = if installs.is_empty() {
        vec![String::from(
            "No supported Steam installations were detected.",
        )]
    } else if dayz.is_none() {
        vec![String::from(
            "Steam was found, but DayZ app 221100 was not detected in any scanned library.",
        )]
    } else {
        Vec::new()
    };

    let selected_steam_install_id = selected.map(|item| item.install.id.clone());
    let detected_steam_installs = installs.into_iter().map(|item| item.install).collect();

    Ok(AppBootstrap {
        detected_steam_installs,
        selected_steam_install_id,
        dayz_install: dayz,
        compatdata_ready,
        workshop_manifest_ready,
        available_launch_modes,
        settings,
        warnings,
    })
}

pub fn detect_steam_installs() -> Result<Vec<SteamInstallResolved>, AppError> {
    let mut candidates = Vec::new();
    for (kind, root) in candidate_roots() {
        if !root.exists() {
            continue;
        }
        let libraries = library_paths(&root)?;
        let has_dayz = libraries.iter().any(|library| {
            library
                .join(format!("appmanifest_{DAYZ_APP_ID}.acf"))
                .exists()
        });
        let has_workshop_manifest = root
            .join("steamapps")
            .join("workshop")
            .join(format!("appworkshop_{DAYZ_APP_ID}.acf"))
            .exists();
        let install = SteamInstall {
            id: format!("{kind}:{}", root.display()),
            kind: kind.to_string(),
            root_path: root.display().to_string(),
            library_paths: libraries
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            has_dayz,
            has_workshop_manifest,
        };
        let dayz = resolve_dayz_install(&root, &libraries)?;
        candidates.push(SteamInstallResolved { install, dayz });
    }
    Ok(candidates)
}

fn candidate_roots() -> Vec<(&'static str, PathBuf)> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(("native", home.join(".local/share/Steam")));
        roots.push(("native", home.join(".steam/steam")));
        roots.push((
            "flatpak",
            home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
        ));
    }
    roots
}

fn library_paths(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let steamapps = root.join("steamapps");
    let mut libraries = vec![steamapps.clone()];
    let libraryfolders = steamapps.join("libraryfolders.vdf");
    if !libraryfolders.exists() {
        return Ok(libraries);
    }
    let contents = std::fs::read_to_string(libraryfolders)?;
    for line in contents.lines() {
        let fields = quoted_fields(line);
        if fields.len() == 2 && fields[0] == "path" {
            let normalized = fields[1].replace("\\\\", "/");
            let candidate = PathBuf::from(normalized).join("steamapps");
            if !libraries.contains(&candidate) {
                libraries.push(candidate);
            }
        }
    }
    Ok(libraries)
}

fn resolve_dayz_install(
    root: &Path,
    libraries: &[PathBuf],
) -> Result<Option<DayzInstall>, AppError> {
    for library in libraries {
        let app_manifest = library.join(format!("appmanifest_{DAYZ_APP_ID}.acf"));
        if !app_manifest.exists() {
            continue;
        }
        let manifest = std::fs::read_to_string(&app_manifest)?;
        let install_dir =
            extract_value(&manifest, "installdir").unwrap_or_else(|| String::from("DayZ"));
        let game_path = library.join("common").join(install_dir);
        let compat_data = root.join("steamapps").join("compatdata").join(DAYZ_APP_ID);
        let workshop_manifest = root
            .join("steamapps")
            .join("workshop")
            .join(format!("appworkshop_{DAYZ_APP_ID}.acf"));
        let documents = compat_data
            .join("pfx")
            .join("drive_c")
            .join("users")
            .join("steamuser")
            .join("Documents")
            .join("DayZ");
        let launcher_preset = compat_data
            .join("pfx")
            .join("drive_c")
            .join("users")
            .join("steamuser")
            .join("AppData")
            .join("Local")
            .join("DayZ Launcher")
            .join("Presets");
        return Ok(Some(DayzInstall {
            game_path: game_path.display().to_string(),
            app_manifest_path: app_manifest.display().to_string(),
            workshop_manifest_path: workshop_manifest.display().to_string(),
            compat_data_path: compat_data.display().to_string(),
            documents_path: documents.display().to_string(),
            launcher_preset_path: launcher_preset.display().to_string(),
        }));
    }
    Ok(None)
}

fn select_install<'a>(
    installs: &'a [SteamInstallResolved],
    preferred_id: Option<&str>,
) -> Option<&'a SteamInstallResolved> {
    if let Some(preferred_id) = preferred_id {
        if let Some(match_install) = installs
            .iter()
            .find(|install| install.install.id == preferred_id)
        {
            return Some(match_install);
        }
    }
    installs
        .iter()
        .find(|install| install.dayz.is_some() && install.install.has_workshop_manifest)
        .or_else(|| installs.iter().find(|install| install.dayz.is_some()))
        .or_else(|| installs.first())
}

pub fn extract_value(contents: &str, key: &str) -> Option<String> {
    for line in contents.lines() {
        let fields = quoted_fields(line);
        if fields.len() >= 2 && fields[0] == key {
            return Some(fields[1].clone());
        }
    }
    None
}

pub fn quoted_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut in_quotes = false;
    let mut current = String::new();
    for character in line.chars() {
        if character == '"' {
            if in_quotes {
                fields.push(current.clone());
                current.clear();
            }
            in_quotes = !in_quotes;
            continue;
        }
        if in_quotes {
            current.push(character);
        }
    }
    fields
}

#[cfg(test)]
mod tests {
    use super::{extract_value, quoted_fields};

    #[test]
    fn extracts_manifest_value() {
        let manifest = "\"AppState\"\n{\n\"installdir\"\t\t\"DayZ\"\n}";
        assert_eq!(
            extract_value(manifest, "installdir").as_deref(),
            Some("DayZ")
        );
    }

    #[test]
    fn parses_quoted_fields() {
        let fields = quoted_fields("\"path\"\t\t\"/games/SteamLibrary\"");
        assert_eq!(
            fields,
            vec!["path".to_string(), "/games/SteamLibrary".to_string()]
        );
    }
}
