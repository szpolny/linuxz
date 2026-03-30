pub mod battlemetrics;
pub mod dzsa;
pub mod steam_a2s;

use crate::contracts::{ListServersRequest, RequiredMod, ServerDetails, ServerRecord, ServerSort};
use crate::error::AppError;
use crate::settings;
use std::collections::BTreeMap;
use std::path::Path;
use tokio::task::JoinSet;
use tokio::time::Duration;

use crate::contracts::PaginatedServersResponse;

pub async fn list_servers(
    request: &ListServersRequest,
    db_path: &Path,
    enable_battlemetrics: bool,
    enable_dzsa: bool,
) -> Result<PaginatedServersResponse, AppError> {
    let mut servers = if enable_battlemetrics {
        battlemetrics::list_servers(request).await?
    } else {
        settings::load_cached_servers(db_path)?
    };

    if servers.is_empty() {
        servers = settings::load_cached_servers(db_path)?;
    } else {
        servers = enrich_live_browser_data(servers).await;
        settings::cache_servers(db_path, &servers)?;
        servers = settings::merge_server_activity(db_path, servers)?;
    }

    let normalized_search = request.search.to_lowercase();
    let mut filtered = servers
        .into_iter()
        .filter(|server| {
            if request.modded_only && !server.modded {
                return false;
            }
            if server.players < request.player_floor {
                return false;
            }
            if normalized_search.is_empty() {
                return true;
            }
            server
                .display_name
                .to_lowercase()
                .contains(&normalized_search)
                || server.map.to_lowercase().contains(&normalized_search)
                || server.endpoint.to_lowercase().contains(&normalized_search)
        })
        .collect::<Vec<_>>();

    filtered.sort_by(|left, right| match request.sort_by {
        ServerSort::Players => right
            .players
            .cmp(&left.players)
            .then_with(|| left.display_name.cmp(&right.display_name)),
        ServerSort::Ping => left
            .ping
            .unwrap_or(u32::MAX)
            .cmp(&right.ping.unwrap_or(u32::MAX))
            .then_with(|| right.players.cmp(&left.players)),
    });

    let page_size = request.limit.max(1);
    let page = request.page.max(1);
    let start = page_size.saturating_mul(page.saturating_sub(1)) as usize;
    let end = start.saturating_add(page_size as usize);
    let has_previous_page = page > 1;
    let has_next_page = filtered.len() > end;

    let mut page_items = if start >= filtered.len() {
        Vec::new()
    } else {
        filtered[start..filtered.len().min(end)].to_vec()
    };

    if enable_dzsa {
        page_items = enrich_browser_page_with_dzsa(page_items).await;
    }

    Ok(PaginatedServersResponse {
        items: page_items,
        page,
        page_size,
        has_previous_page,
        has_next_page,
    })
}

pub async fn get_server_details(
    server: ServerRecord,
    enable_dzsa: bool,
) -> Result<ServerDetails, AppError> {
    let mut details = ServerDetails {
        server: server.clone(),
        rules: BTreeMap::new(),
        required_mods: Vec::new(),
        warnings: Vec::new(),
        provider_provenance: vec![String::from("battlemetrics-cache")],
        labels: Vec::new(),
    };

    if let Ok(snapshot) =
        steam_a2s::fetch_snapshot(&server.ip, server.query_port, Duration::from_secs(2)).await
    {
        details.server.display_name = snapshot.info.name.clone();
        details.server.map = snapshot.info.map.clone();
        details.server.players = u32::from(snapshot.info.players);
        details.server.max_players = u32::from(snapshot.info.max_players);
        details.server.version = Some(snapshot.info.version.clone());
        details.server.ping = Some(snapshot.ping_ms);
        details.server.connect_port = Some(
            server
                .connect_port
                .unwrap_or(server.query_port.saturating_sub(3)),
        );
        details.provider_provenance.push(String::from("a2s-info"));
    } else {
        details.warnings.push(String::from(
            "A2S live query failed; using cached browser values.",
        ));
    }

    if enable_dzsa {
        match dzsa::fetch_details_for_server(&server.ip, server.query_port, server.connect_port)
            .await
        {
            Ok(extra) => {
                details.provider_provenance.push(String::from("dzsa"));
                details.server.display_name = extra.name.clone();
                details.server.connect_port = Some(extra.game_port);
                details.server.map = extra.map.clone();
                details.server.version = Some(extra.version.clone());
                details.server.has_password = extra.password;
                details
                    .rules
                    .insert(String::from("battleye"), extra.battleye.to_string());
                details
                    .rules
                    .insert(String::from("time"), extra.time.clone());
                details.labels.push(if extra.first_person_only {
                    String::from("1PP")
                } else {
                    String::from("3PP")
                });
                details.required_mods = extra
                    .mods
                    .into_iter()
                    .filter_map(|entry| {
                        entry.steam_workshop_id.map(|workshop_id| RequiredMod {
                            workshop_id: workshop_id.to_string(),
                            display_name: entry.name,
                            source: String::from("dzsa"),
                            installed_state: String::from("unknown"),
                            download_state: String::from("unknown"),
                        })
                    })
                    .collect();
            }
            Err(_) => {
                details
                    .warnings
                    .push(String::from("DZSA enrichment failed for this server."));
            }
        }
    }

    Ok(details)
}

async fn enrich_live_browser_data(servers: Vec<ServerRecord>) -> Vec<ServerRecord> {
    let mut join_set = JoinSet::new();
    for (index, server) in servers.into_iter().enumerate() {
        join_set.spawn(async move {
            let snapshot = steam_a2s::fetch_snapshot(
                &server.ip,
                server.query_port,
                Duration::from_millis(900),
            )
            .await
            .ok();
            (index, server, snapshot)
        });
    }

    let mut enriched = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok((index, mut server, Some(snapshot))) => {
                server.display_name = snapshot.info.name;
                server.map = snapshot.info.map;
                server.players = u32::from(snapshot.info.players);
                server.max_players = u32::from(snapshot.info.max_players);
                server.version = Some(snapshot.info.version);
                server.ping = Some(snapshot.ping_ms);
                server.readiness = String::from("live");
                if !server.source_coverage.iter().any(|entry| entry == "a2s") {
                    server.source_coverage.push(String::from("a2s"));
                }
                enriched.push((index, server));
            }
            Ok((index, server, None)) => enriched.push((index, server)),
            Err(_) => {}
        }
    }
    enriched.sort_by_key(|(index, _)| *index);
    enriched.into_iter().map(|(_, server)| server).collect()
}

async fn enrich_browser_page_with_dzsa(servers: Vec<ServerRecord>) -> Vec<ServerRecord> {
    let mut join_set = JoinSet::new();
    for (index, server) in servers.into_iter().enumerate() {
        join_set.spawn(async move {
            let dzsa = tokio::time::timeout(
                Duration::from_millis(1400),
                dzsa::fetch_details_for_server(&server.ip, server.query_port, server.connect_port),
            )
            .await
            .ok()
            .and_then(Result::ok);
            (index, server, dzsa)
        });
    }

    let mut enriched = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok((index, mut server, Some(extra))) => {
                server.display_name = extra.name;
                server.map = extra.map;
                server.version = Some(extra.version);
                server.connect_port = Some(extra.game_port);
                server.has_password = extra.password;
                server.modded = server.modded || !extra.mods.is_empty();
                if !server.source_coverage.iter().any(|entry| entry == "dzsa") {
                    server.source_coverage.push(String::from("dzsa"));
                }
                enriched.push((index, server));
            }
            Ok((index, server, None)) => enriched.push((index, server)),
            Err(_) => {}
        }
    }
    enriched.sort_by_key(|(index, _)| *index);
    enriched.into_iter().map(|(_, server)| server).collect()
}
