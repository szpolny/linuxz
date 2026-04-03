pub mod battlemetrics;
pub mod dzsa;
pub mod network_ping;
pub mod steam_a2s;

use crate::contracts::{
    ListServersRequest, RequiredMod, ServerDetails, ServerLibrary, ServerRecord, ServerSort,
};
use crate::error::AppError;
use crate::settings;
use crate::steam::matchmaking::{self, MatchmakingServerSnapshot};
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
    let normalized_search = request.search.trim().to_lowercase();
    let cached_servers = settings::load_cached_servers(db_path)
        .unwrap_or_default()
        .into_iter()
        .map(|server| (server.endpoint.clone(), server))
        .collect::<BTreeMap<_, _>>();
    let mut servers = if enable_battlemetrics {
        battlemetrics::list_servers(request).await?
    } else {
        settings::load_cached_servers(db_path)?
    };

    if enable_battlemetrics {
        merge_cached_browser_metadata(&mut servers, &cached_servers);
    }

    if servers.is_empty() {
        servers = settings::load_cached_servers(db_path)?;
    } else {
        settings::cache_servers(db_path, &servers)?;
        servers = settings::merge_server_activity(db_path, servers)?;
    }

    let mut filtered = filter_servers(servers, request, &normalized_search);
    filtered = enrich_live_browser_data(filtered).await;
    filtered = retain_browser_visible_servers(filtered);

    if matches!(request.sort_by, ServerSort::Ping) {
        filtered = network_ping::enrich_rtt(filtered, Duration::from_secs(1)).await;
    }

    sort_servers(&mut filtered, &request.sort_by);

    let mut response = paginate_servers(filtered, request);
    let mut page_items = response.items;

    if !matches!(request.sort_by, ServerSort::Ping) {
        page_items = network_ping::enrich_rtt(page_items, Duration::from_secs(1)).await;
    }

    if enable_dzsa {
        page_items = enrich_browser_page_with_dzsa(page_items).await;
    }

    sort_servers(&mut page_items, &request.sort_by);
    settings::cache_servers(db_path, &page_items)?;
    response.items = page_items;

    Ok(response)
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

    let matchmaking_snapshots =
        matchmaking::fetch_server_snapshots(vec![server.clone()], Duration::from_secs(2)).await;
    let matchmaking_snapshot = matchmaking_snapshots.get(&server.endpoint);
    if let Some(snapshot) = matchmaking_snapshot {
        apply_matchmaking_snapshot(&mut details.server, snapshot);
        details
            .provider_provenance
            .push(String::from("steamworks-matchmaking"));
    }

    if let Ok(snapshot) =
        steam_a2s::fetch_snapshot(&server.ip, server.query_port, Duration::from_secs(2)).await
    {
        details.server.version = Some(snapshot.info.version.clone());
        if matchmaking_snapshot.is_none() {
            details.server.display_name = snapshot.info.name.clone();
            details.server.map = snapshot.info.map.clone();
            details.server.players = u32::from(snapshot.info.players);
            details.server.max_players = u32::from(snapshot.info.max_players);
            details.server.ping = Some(snapshot.ping_ms);
            details.server.connect_port = Some(
                server
                    .connect_port
                    .unwrap_or(server.query_port.saturating_sub(3)),
            );
        }
        details.provider_provenance.push(String::from("a2s-info"));
    } else if matchmaking_snapshot.is_none() {
        details.warnings.push(String::from(
            "A2S live query failed; using cached browser values.",
        ));
    }

    if let Some(ping_ms) =
        network_ping::probe_rtt_ms(&details.server.ip, Duration::from_secs(2)).await
    {
        details.server.ping = Some(ping_ms);
        details.provider_provenance.push(String::from("icmp-rtt"));
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
                details.server.mod_count = extra.mods.len() as u32;
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

pub async fn refresh_server_library(mut library: ServerLibrary) -> ServerLibrary {
    library.favorites = refresh_library_collection(library.favorites).await;
    library.recents = refresh_library_collection(library.recents).await;
    library
}

async fn refresh_library_collection(servers: Vec<ServerRecord>) -> Vec<ServerRecord> {
    let servers = enrich_live_browser_data(servers).await;
    network_ping::enrich_rtt(servers, Duration::from_secs(1)).await
}

async fn enrich_live_browser_data(servers: Vec<ServerRecord>) -> Vec<ServerRecord> {
    let matchmaking_snapshots =
        matchmaking::fetch_server_snapshots(servers.clone(), Duration::from_millis(1800)).await;
    let mut join_set = JoinSet::new();
    for (index, server) in servers.into_iter().enumerate() {
        if let Some(snapshot) = matchmaking_snapshots.get(&server.endpoint) {
            let mut server = server;
            apply_matchmaking_snapshot(&mut server, snapshot);
            server.readiness = String::from("live");
            if !server
                .source_coverage
                .iter()
                .any(|entry| entry == "steamworks")
            {
                server.source_coverage.push(String::from("steamworks"));
            }
            join_set.spawn(async move { (index, server, None) });
            continue;
        }

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

fn filter_servers(
    servers: Vec<ServerRecord>,
    request: &ListServersRequest,
    normalized_search: &str,
) -> Vec<ServerRecord> {
    servers
        .into_iter()
        .filter(|server| matches_server_filters(server, request, normalized_search))
        .collect()
}

fn retain_browser_visible_servers(servers: Vec<ServerRecord>) -> Vec<ServerRecord> {
    servers
        .into_iter()
        .filter(|server| server.readiness == "live" || server.last_joined_at.is_some())
        .collect()
}

fn matches_server_filters(
    server: &ServerRecord,
    request: &ListServersRequest,
    normalized_search: &str,
) -> bool {
    if request.modded_only && !server.modded {
        return false;
    }
    if request.official_only && !server.official {
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
        .contains(normalized_search)
        || server.map.to_lowercase().contains(normalized_search)
        || server.endpoint.to_lowercase().contains(normalized_search)
}

fn sort_servers(servers: &mut [ServerRecord], sort_by: &ServerSort) {
    servers.sort_by(|left, right| match sort_by {
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
}

fn paginate_servers(
    filtered: Vec<ServerRecord>,
    request: &ListServersRequest,
) -> PaginatedServersResponse {
    let page_size = request.limit.max(1);
    let page = request.page.max(1);
    let start = page_size.saturating_mul(page.saturating_sub(1)) as usize;
    let end = start.saturating_add(page_size as usize);
    let has_previous_page = page > 1;
    let has_next_page = filtered.len() > end;
    let items = if start >= filtered.len() {
        Vec::new()
    } else {
        filtered[start..filtered.len().min(end)].to_vec()
    };

    PaginatedServersResponse {
        items,
        page,
        page_size,
        has_previous_page,
        has_next_page,
    }
}

fn apply_matchmaking_snapshot(server: &mut ServerRecord, snapshot: &MatchmakingServerSnapshot) {
    server.display_name = snapshot.display_name.clone();
    server.map = snapshot.map.clone();
    server.players = snapshot.players;
    server.max_players = snapshot.max_players;
    server.ping = Some(snapshot.ping_ms);
    server.connect_port = Some(snapshot.connect_port);
    server.has_password = snapshot.has_password;
}

fn merge_cached_browser_metadata(
    servers: &mut [ServerRecord],
    cached_servers: &BTreeMap<String, ServerRecord>,
) {
    for server in servers {
        let Some(cached) = cached_servers.get(&server.endpoint) else {
            continue;
        };

        if server.mod_count == 0 && cached.mod_count > 0 {
            server.mod_count = cached.mod_count;
        }

        if server.connect_port.is_none() {
            server.connect_port = cached.connect_port;
        }

        if server.version.is_none() {
            server.version = cached.version.clone();
        }

        if cached.source_coverage.iter().any(|entry| entry == "dzsa")
            && !server.source_coverage.iter().any(|entry| entry == "dzsa")
        {
            server.source_coverage.push(String::from("dzsa"));
        }

        if cached.mod_count > 0 {
            server.modded = true;
        }
    }
}

async fn enrich_browser_page_with_dzsa(servers: Vec<ServerRecord>) -> Vec<ServerRecord> {
    let mut join_set = JoinSet::new();
    for (index, server) in servers.into_iter().enumerate() {
        join_set.spawn(async move {
            let dzsa = tokio::time::timeout(
                Duration::from_millis(2200),
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
                server.mod_count = extra.mods.len() as u32;
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

#[cfg(test)]
mod tests {
    use super::retain_browser_visible_servers;
    use crate::contracts::ServerRecord;

    fn sample_server(
        endpoint: &str,
        readiness: &str,
        last_joined_at: Option<&str>,
    ) -> ServerRecord {
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
            readiness: readiness.to_string(),
            version: Some(String::from("1.0")),
            country: Some(String::from("PL")),
            has_password: false,
            modded: true,
            mod_count: 12,
            official: false,
            is_favorite: false,
            last_joined_at: last_joined_at.map(str::to_string),
        }
    }

    #[test]
    fn keeps_live_servers_in_browser_results() {
        let servers = vec![sample_server("1.2.3.4:2305", "live", None)];

        let visible = retain_browser_visible_servers(servers);

        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].endpoint, "1.2.3.4:2305");
    }

    #[test]
    fn keeps_recent_servers_even_when_offline() {
        let servers = vec![sample_server(
            "1.2.3.4:2305",
            "cached",
            Some("2026-04-03T12:00:00.000Z"),
        )];

        let visible = retain_browser_visible_servers(servers);

        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].endpoint, "1.2.3.4:2305");
    }

    #[test]
    fn drops_non_recent_offline_servers_from_browser_results() {
        let servers = vec![sample_server("1.2.3.4:2305", "cached", None)];

        let visible = retain_browser_visible_servers(servers);

        assert!(visible.is_empty());
    }
}
