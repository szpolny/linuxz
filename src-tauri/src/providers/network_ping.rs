use crate::contracts::ServerRecord;
use std::process::Command;
use std::time::Duration;
use tokio::task::JoinSet;

pub async fn enrich_rtt(servers: Vec<ServerRecord>, timeout: Duration) -> Vec<ServerRecord> {
    let mut join_set = JoinSet::new();
    for (index, server) in servers.into_iter().enumerate() {
        join_set.spawn(async move {
            let ping = probe_rtt_ms(&server.ip, timeout).await;
            (index, server, ping)
        });
    }

    let mut enriched = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok((index, mut server, ping)) => {
                if let Some(ping_ms) = ping {
                    server.ping = Some(ping_ms);
                    if !server.source_coverage.iter().any(|entry| entry == "icmp") {
                        server.source_coverage.push(String::from("icmp"));
                    }
                }
                enriched.push((index, server));
            }
            Err(_) => {}
        }
    }

    enriched.sort_by_key(|(index, _)| *index);
    enriched.into_iter().map(|(_, server)| server).collect()
}

pub async fn probe_rtt_ms(ip: &str, timeout: Duration) -> Option<u32> {
    let ip = ip.to_owned();
    tokio::task::spawn_blocking(move || probe_rtt_ms_blocking(&ip, timeout))
        .await
        .ok()
        .flatten()
}

fn probe_rtt_ms_blocking(ip: &str, timeout: Duration) -> Option<u32> {
    let timeout_secs = timeout.as_secs().max(1).to_string();
    let output = Command::new("ping")
        .args(["-c", "1", "-n", "-W", &timeout_secs, ip])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8(output.stdout).ok()?;
    parse_ping_output(&stdout)
}

fn parse_ping_output(stdout: &str) -> Option<u32> {
    let marker = "time=";
    let start = stdout.find(marker)? + marker.len();
    let rest = &stdout[start..];
    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    let raw = rest[..end].trim_end_matches("ms");
    let value = raw.parse::<f64>().ok()?;
    if !value.is_finite() || value < 0.0 {
        return None;
    }

    Some(value.round().clamp(0.0, f64::from(u32::MAX)) as u32)
}

#[cfg(test)]
mod tests {
    use super::parse_ping_output;

    #[test]
    fn parses_decimal_ping_output() {
        let sample = "64 bytes from 172.111.51.230: icmp_seq=1 ttl=109 time=128.790 ms";
        assert_eq!(parse_ping_output(sample), Some(129));
    }

    #[test]
    fn parses_integer_ping_output() {
        let sample = "64 bytes from 172.111.51.230: icmp_seq=1 ttl=109 time=20 ms";
        assert_eq!(parse_ping_output(sample), Some(20));
    }

    #[test]
    fn returns_none_without_time_field() {
        assert_eq!(parse_ping_output("unreachable"), None);
    }
}
