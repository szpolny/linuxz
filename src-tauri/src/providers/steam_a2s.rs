use crate::error::AppError;
use std::net::SocketAddr;
use std::time::Instant;
use tokio::net::UdpSocket;
use tokio::time::{timeout, Duration};

#[derive(Debug, Clone)]
pub struct A2sInfo {
    pub name: String,
    pub map: String,
    pub players: u8,
    pub max_players: u8,
    pub version: String,
}

#[derive(Debug, Clone)]
pub struct A2sSnapshot {
    pub info: A2sInfo,
    pub ping_ms: u32,
}

pub async fn fetch_snapshot(ip: &str, port: u16, wait: Duration) -> Result<A2sSnapshot, AppError> {
    let target = format!("{ip}:{port}")
        .parse::<SocketAddr>()
        .map_err(|error| AppError::new(error.to_string()))?;
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|error| AppError::new(error.to_string()))?;
    let mut request = vec![0xFF, 0xFF, 0xFF, 0xFF, 0x54];
    request.extend_from_slice(b"Source Engine Query\0");
    let started = Instant::now();
    socket
        .send_to(&request, target)
        .await
        .map_err(|error| AppError::new(error.to_string()))?;

    let mut buffer = [0_u8; 1400];
    let (count, _) = timeout(wait, socket.recv_from(&mut buffer))
        .await
        .map_err(|_| AppError::new("Timed out waiting for A2S response"))?
        .map_err(|error| AppError::new(error.to_string()))?;

    let ping_ms = started.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
    let info = parse_info_response(&buffer[..count])?;
    Ok(A2sSnapshot { info, ping_ms })
}

fn parse_info_response(packet: &[u8]) -> Result<A2sInfo, AppError> {
    if packet.len() < 6 || packet[4] != 0x49 {
        return Err(AppError::new("Unexpected A2S packet"));
    }
    let mut cursor = 6_usize;
    let name = read_c_string(packet, &mut cursor)?;
    let map = read_c_string(packet, &mut cursor)?;
    let _folder = read_c_string(packet, &mut cursor)?;
    let _game = read_c_string(packet, &mut cursor)?;
    cursor += 2;
    let players = packet
        .get(cursor)
        .copied()
        .ok_or_else(|| AppError::new("Missing players field"))?;
    cursor += 1;
    let max_players = packet
        .get(cursor)
        .copied()
        .ok_or_else(|| AppError::new("Missing max players field"))?;
    cursor += 1;
    cursor += 5;
    let version = read_c_string(packet, &mut cursor)?;

    Ok(A2sInfo {
        name,
        map,
        players,
        max_players,
        version,
    })
}

fn read_c_string(packet: &[u8], cursor: &mut usize) -> Result<String, AppError> {
    let start = *cursor;
    let mut end = start;
    while let Some(byte) = packet.get(end) {
        if *byte == 0 {
            let value = String::from_utf8(packet[start..end].to_vec())
                .map_err(|error| AppError::new(error.to_string()))?;
            *cursor = end + 1;
            return Ok(value);
        }
        end += 1;
    }
    Err(AppError::new("Invalid A2S string"))
}

#[cfg(test)]
mod tests {
    use super::parse_info_response;

    #[test]
    fn parses_basic_info_response() {
        let packet = [
            0xFF, 0xFF, 0xFF, 0xFF, 0x49, 0x11, b'S', b'e', b'r', b'v', b'e', b'r', 0x00, b'c',
            b'h', b'e', b'r', b'n', 0x00, b'd', b'a', b'y', b'z', 0x00, b'D', b'a', b'y', b'Z',
            0x00, 0x00, 0x00, 10, 60, 0, b'd', b'l', 0, 0, b'1', b'.', b'2', b'8', 0x00,
        ];
        let info = parse_info_response(&packet).expect("a2s packet should parse");
        assert_eq!(info.name, "Server");
        assert_eq!(info.map, "chern");
        assert_eq!(info.players, 10);
        assert_eq!(info.max_players, 60);
        assert_eq!(info.version, "1.28");
    }
}
