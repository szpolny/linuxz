use crate::contracts::{ListServersRequest, ServerRecord};
use crate::error::AppError;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BattleMetricsResponse {
    data: Vec<BattleMetricsServer>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BattleMetricsServer {
    attributes: BattleMetricsAttributes,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BattleMetricsAttributes {
    name: String,
    ip: String,
    port: u16,
    players: u32,
    max_players: u32,
    country: Option<String>,
    details: BattleMetricsDetails,
    port_query: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BattleMetricsDetails {
    version: Option<String>,
    password: bool,
    modded: bool,
}

pub async fn list_servers(request: &ListServersRequest) -> Result<Vec<ServerRecord>, AppError> {
    let limit = request
        .limit
        .saturating_mul(request.page.saturating_add(1))
        .clamp(20, 250);
    let url = format!(
    "https://api.battlemetrics.com/servers?filter%5Bgame%5D=dayz&page%5Bsize%5D={limit}&sort=-players"
  );
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await?
        .error_for_status()?;
    let payload = response.json::<BattleMetricsResponse>().await?;
    Ok(payload
        .data
        .into_iter()
        .map(|server| {
            let query_port = server
                .attributes
                .port_query
                .unwrap_or(server.attributes.port.saturating_add(3));
            ServerRecord {
                endpoint: format!("{}:{query_port}", server.attributes.ip),
                ip: server.attributes.ip,
                query_port,
                connect_port: Some(server.attributes.port),
                display_name: server.attributes.name,
                map: String::from("unknown"),
                players: server.attributes.players,
                max_players: server.attributes.max_players,
                ping: None,
                source_coverage: vec![String::from("battlemetrics")],
                readiness: String::from("cached"),
                version: server.attributes.details.version,
                country: server.attributes.country,
                has_password: server.attributes.details.password,
                modded: server.attributes.details.modded,
            }
        })
        .collect())
}
