use crate::contracts::{DayzInstall, RequiredMod};
use crate::error::AppError;
use crate::steam::discovery::quoted_fields;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const DAYZ_APP_ID: &str = "221100";

pub fn read_installed_mods(dayz: &DayzInstall) -> Result<Vec<RequiredMod>, AppError> {
  let manifest_path = Path::new(&dayz.workshop_manifest_path);
  let mut installed_ids = BTreeSet::new();
  if manifest_path.exists() {
    let contents = std::fs::read_to_string(manifest_path)?;
    installed_ids.extend(parse_workshop_installed_ids(&contents));
  }

  let content_root = workshop_content_root(Path::new(&dayz.workshop_manifest_path));
  if content_root.exists() {
    for entry in std::fs::read_dir(content_root)? {
      let entry = entry?;
      if entry.file_type()?.is_dir() {
        if let Some(id) = entry.file_name().to_str() {
          if id.chars().all(|character| character.is_ascii_digit()) {
            installed_ids.insert(id.to_string());
          }
        }
      }
    }
  }

  Ok(
    installed_ids
      .into_iter()
      .map(|workshop_id| {
        let display_name = mod_display_name(manifest_path, &workshop_id)
          .unwrap_or_else(|| format!("Workshop {workshop_id}"));
        RequiredMod {
          display_name,
          workshop_id,
          source: String::from("local"),
          installed_state: String::from("installed"),
          download_state: String::from("ready"),
        }
      })
      .collect(),
  )
}

pub fn workshop_content_root(workshop_manifest_path: &Path) -> PathBuf {
  workshop_manifest_path
    .parent()
    .map(|parent| parent.join("content").join(DAYZ_APP_ID))
    .unwrap_or_else(|| PathBuf::from(""))
}

pub fn mod_install_path(workshop_manifest_path: &Path, workshop_id: &str) -> PathBuf {
  workshop_content_root(workshop_manifest_path).join(workshop_id)
}

pub fn mod_display_name(workshop_manifest_path: &Path, workshop_id: &str) -> Option<String> {
  let mod_root = mod_install_path(workshop_manifest_path, workshop_id);
  for candidate in [mod_root.join("mod.cpp"), mod_root.join("meta.cpp")] {
    if !candidate.exists() {
      continue;
    }
    let Ok(contents) = std::fs::read_to_string(candidate) else {
      continue;
    };
    if let Some(name) = extract_assignment_value(&contents, "name") {
      if !name.trim().is_empty() {
        return Some(name);
      }
    }
  }
  None
}

fn extract_assignment_value(contents: &str, key: &str) -> Option<String> {
  contents.lines().find_map(|line| {
    let trimmed = line.trim();
    if !trimmed.starts_with(key) {
      return None;
    }
    let start = trimmed.find('"')?;
    let rest = &trimmed[start + 1..];
    let end = rest.find('"')?;
    Some(rest[..end].trim().to_string())
  })
}

pub fn parse_workshop_installed_ids(contents: &str) -> Vec<String> {
  let mut in_items = false;
  let mut item_section_depth = 0_u32;
  let mut pending_id: Option<String> = None;
  let mut installed = Vec::new();

  for line in contents.lines() {
    let trimmed = line.trim();
    let fields = quoted_fields(trimmed);

    if !in_items && fields.len() == 1 && fields[0] == "WorkshopItemsInstalled" {
      in_items = true;
      continue;
    }

    if !in_items {
      continue;
    }

    if trimmed == "{" {
      item_section_depth = item_section_depth.saturating_add(1);
      continue;
    }

    if trimmed == "}" {
      if item_section_depth == 2 {
        if let Some(item_id) = pending_id.take() {
          installed.push(item_id);
        }
      }
      item_section_depth = item_section_depth.saturating_sub(1);
      if item_section_depth == 0 {
        break;
      }
      continue;
    }

    if item_section_depth == 1 && fields.len() == 1 && fields[0].chars().all(|character| character.is_ascii_digit()) {
      pending_id = Some(fields[0].clone());
    }
  }

  installed
}

#[cfg(test)]
mod tests {
  use super::{extract_assignment_value, parse_workshop_installed_ids};

  #[test]
  fn parses_installed_item_ids() {
    let sample = "\"AppWorkshop\"\n{\n\t\"WorkshopItemsInstalled\"\n\t{\n\t\t\"1559212036\"\n\t\t{\n\t\t\t\"size\" \"1\"\n\t\t}\n\t\t\"1646187754\"\n\t\t{\n\t\t\t\"size\" \"2\"\n\t\t}\n\t}\n}";
    let ids = parse_workshop_installed_ids(sample);
    assert_eq!(ids, vec!["1559212036".to_string(), "1646187754".to_string()]);
  }

  #[test]
  fn extracts_mod_name_from_cpp() {
    let contents = "name = \"Community Framework\";\nauthor = \"CF Team\";";
    assert_eq!(extract_assignment_value(contents, "name").as_deref(), Some("Community Framework"));
  }
}
