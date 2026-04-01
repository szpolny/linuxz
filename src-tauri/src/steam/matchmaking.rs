use crate::contracts::ServerRecord;
use std::collections::BTreeMap;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct MatchmakingServerSnapshot {
    pub display_name: String,
    pub map: String,
    pub players: u32,
    pub max_players: u32,
    pub ping_ms: u32,
    pub connect_port: u16,
    pub has_password: bool,
}

#[cfg(feature = "steamworks")]
mod implementation {
    use super::MatchmakingServerSnapshot;
    use crate::contracts::ServerRecord;
    use std::collections::BTreeMap;
    use std::ffi::CStr;
    use std::net::Ipv4Addr;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};
    use steamworks::Client;
    use steamworks_sys as sys;

    const DAYZ_APP_ID: u32 = 221100;
    const CALLBACK_POLL_INTERVAL: Duration = Duration::from_millis(25);

    #[derive(Debug)]
    struct PingQuery {
        handle: sys::HServerQuery,
        response: *mut PingResponse,
        snapshot: Option<MatchmakingServerSnapshot>,
        completed: bool,
    }

    unsafe impl Send for PingQuery {}

    #[repr(C)]
    struct PingResponseVTable {
        server_responded: extern "C" fn(*mut PingResponse, *mut sys::gameserveritem_t),
        server_failed_to_respond: extern "C" fn(*mut PingResponse),
    }

    #[repr(C)]
    struct PingResponse {
        vtable: *const PingResponseVTable,
        endpoint: String,
        shared: Arc<Mutex<BTreeMap<String, PingQuery>>>,
    }

    pub async fn fetch_server_snapshots(
        servers: Vec<ServerRecord>,
        timeout: Duration,
    ) -> BTreeMap<String, MatchmakingServerSnapshot> {
        tokio::task::spawn_blocking(move || fetch_server_snapshots_blocking(servers, timeout))
            .await
            .unwrap_or_default()
    }

    fn fetch_server_snapshots_blocking(
        servers: Vec<ServerRecord>,
        timeout: Duration,
    ) -> BTreeMap<String, MatchmakingServerSnapshot> {
        if servers.is_empty() {
            return BTreeMap::new();
        }

        let client = match Client::init_app(DAYZ_APP_ID) {
            Ok(client) => client,
            Err(_) => return BTreeMap::new(),
        };
        let results = Arc::new(Mutex::new(BTreeMap::<String, PingQuery>::new()));

        for server in servers {
            let ip = match server.ip.parse::<Ipv4Addr>() {
                Ok(ip) => ip,
                Err(_) => continue,
            };
            let endpoint = server.endpoint.clone();
            let response = PingResponse::allocate(endpoint.clone(), Arc::clone(&results));
            let handle = unsafe {
                sys::SteamAPI_ISteamMatchmakingServers_PingServer(
                    sys::SteamAPI_SteamMatchmakingServers_v002(),
                    u32::from(ip),
                    server.query_port,
                    response.cast(),
                )
            };

            if handle == sys::HSERVERQUERY_INVALID {
                unsafe { PingResponse::free(response) };
                continue;
            }

            if let Ok(mut guard) = results.lock() {
                guard.insert(
                    endpoint,
                    PingQuery {
                        handle,
                        response,
                        snapshot: None,
                        completed: false,
                    },
                );
            }
        }

        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            client.run_callbacks();
            let pending = results
                .lock()
                .map(|guard| guard.values().any(|query| !query.completed))
                .unwrap_or(false);
            if !pending {
                break;
            }

            thread::sleep(CALLBACK_POLL_INTERVAL);
        }

        client.run_callbacks();

        let mut resolved = BTreeMap::new();
        if let Ok(mut guard) = results.lock() {
            let matchmaking_servers = unsafe { sys::SteamAPI_SteamMatchmakingServers_v002() };
            for (endpoint, query) in guard.iter_mut() {
                if !query.completed {
                    unsafe {
                        sys::SteamAPI_ISteamMatchmakingServers_CancelServerQuery(
                            matchmaking_servers,
                            query.handle,
                        );
                    }
                }
                if let Some(snapshot) = query.snapshot.clone() {
                    resolved.insert(endpoint.clone(), snapshot);
                }
                unsafe { PingResponse::free(query.response) };
            }
        }

        resolved
    }

    impl PingResponse {
        fn allocate(
            endpoint: String,
            shared: Arc<Mutex<BTreeMap<String, PingQuery>>>,
        ) -> *mut PingResponse {
            let response = PingResponse {
                vtable: ping_response_vtable(),
                endpoint,
                shared,
            };
            Box::into_raw(Box::new(response))
        }

        unsafe fn free(response: *mut PingResponse) {
            drop(Box::from_raw(response));
        }
    }

    extern "C" fn ping_server_responded(
        response: *mut PingResponse,
        server: *mut sys::gameserveritem_t,
    ) {
        let Some(response) = (unsafe { response.as_ref() }) else {
            return;
        };
        let endpoint = response.endpoint.clone();
        let shared = Arc::clone(&response.shared);
        let snapshot = map_snapshot(server);

        let lock_result = shared.lock();
        if let Ok(mut guard) = lock_result {
            if let Some(query) = guard.get_mut(&endpoint) {
                query.snapshot = Some(snapshot);
                query.completed = true;
            }
        }
    }

    extern "C" fn ping_server_failed(response: *mut PingResponse) {
        let Some(response) = (unsafe { response.as_ref() }) else {
            return;
        };
        let endpoint = response.endpoint.clone();
        let shared = Arc::clone(&response.shared);

        let lock_result = shared.lock();
        if let Ok(mut guard) = lock_result {
            if let Some(query) = guard.get_mut(&endpoint) {
                query.completed = true;
            }
        }
    }

    fn ping_response_vtable() -> *const PingResponseVTable {
        static VTABLE: PingResponseVTable = PingResponseVTable {
            server_responded: ping_server_responded,
            server_failed_to_respond: ping_server_failed,
        };
        &VTABLE
    }

    fn map_snapshot(server: *mut sys::gameserveritem_t) -> MatchmakingServerSnapshot {
        let item = unsafe { server.read_unaligned() };
        MatchmakingServerSnapshot {
            display_name: read_c_string(&item.m_szServerName),
            map: read_c_string(&item.m_szMap),
            players: item.m_nPlayers.max(0) as u32,
            max_players: item.m_nMaxPlayers.max(0) as u32,
            ping_ms: item.m_nPing.max(0) as u32,
            connect_port: item.m_NetAdr.m_usConnectionPort,
            has_password: item.m_bPassword,
        }
    }

    fn read_c_string(buffer: &[std::os::raw::c_char]) -> String {
        let mut bytes = Vec::with_capacity(buffer.len() + 1);
        for value in buffer {
            bytes.push(*value as u8);
            if *value == 0 {
                break;
            }
        }
        if bytes.last().copied() != Some(0) {
            bytes.push(0);
        }

        CStr::from_bytes_with_nul(&bytes)
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

#[cfg(not(feature = "steamworks"))]
mod implementation {
    use super::MatchmakingServerSnapshot;
    use crate::contracts::ServerRecord;
    use std::collections::BTreeMap;
    use std::time::Duration;

    pub async fn fetch_server_snapshots(
        _servers: Vec<ServerRecord>,
        _timeout: Duration,
    ) -> BTreeMap<String, MatchmakingServerSnapshot> {
        BTreeMap::new()
    }
}

pub async fn fetch_server_snapshots(
    servers: Vec<ServerRecord>,
    timeout: Duration,
) -> BTreeMap<String, MatchmakingServerSnapshot> {
    implementation::fetch_server_snapshots(servers, timeout).await
}
