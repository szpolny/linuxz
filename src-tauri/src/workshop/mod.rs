pub mod steamworks;

use crate::contracts::{DayzInstall, RequiredMod};
use crate::dayz::install::{mod_install_path, read_installed_mods};
use crate::error::AppError;
use std::collections::BTreeSet;
use std::path::Path;

pub fn reconcile_mods(
    dayz: &DayzInstall,
    required: &[RequiredMod],
) -> Result<Vec<RequiredMod>, AppError> {
    let installed = read_installed_mods(dayz)?
        .into_iter()
        .map(|item| item.workshop_id)
        .collect::<BTreeSet<_>>();

    Ok(required
        .iter()
        .map(|item| {
            let mut resolved = item.clone();
            let install_path =
                mod_install_path(Path::new(&dayz.workshop_manifest_path), &item.workshop_id);
            let is_ready = installed.contains(&item.workshop_id) || install_path.exists();
            resolved.installed_state = if is_ready {
                String::from("installed")
            } else {
                String::from("missing")
            };
            resolved.download_state = if is_ready {
                String::from("ready")
            } else {
                String::from("missing")
            };
            resolved
        })
        .collect())
}
