#[derive(Debug, Clone, Default)]
pub struct SteamworksSubscriptionResult {
    pub subscribed_ids: Vec<String>,
    pub failed_ids: Vec<String>,
    pub warnings: Vec<String>,
}

#[cfg(feature = "steamworks")]
mod implementation {
    use super::SteamworksSubscriptionResult;
    use crate::error::AppError;
    use std::collections::BTreeMap;
    use std::collections::BTreeSet;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};
    use steamworks::{Client, ItemState, PublishedFileId};

    const DAYZ_APP_ID: u32 = 221100;
    const SUBSCRIBE_WAIT_TIMEOUT: Duration = Duration::from_secs(30);
    const CALLBACK_POLL_INTERVAL: Duration = Duration::from_millis(50);

    #[derive(Debug, Clone, Copy)]
    pub struct SteamworksAdapter;

    impl SteamworksAdapter {
        pub fn available() -> bool {
            true
        }

        pub fn subscribe_items(
            workshop_ids: &[String],
        ) -> Result<SteamworksSubscriptionResult, AppError> {
            if workshop_ids.is_empty() {
                return Ok(SteamworksSubscriptionResult::default());
            }

            let client = Client::init_app(DAYZ_APP_ID)
                .map_err(|error| AppError::new(format!("Steamworks init failed: {error}")))?;
            let ugc = client.ugc();
            let callback_results = Arc::new(Mutex::new(
                BTreeMap::<u64, Option<Result<(), String>>>::new(),
            ));
            let mut pending_ids = BTreeSet::new();
            let mut result = SteamworksSubscriptionResult::default();

            for workshop_id in workshop_ids {
                let published_file_id = workshop_id
                    .parse::<u64>()
                    .map(PublishedFileId)
                    .map_err(|_| AppError::new(format!("Invalid workshop id: {workshop_id}")))?;
                let state = ugc.item_state(published_file_id);

                if state.intersects(
                    ItemState::SUBSCRIBED
                        | ItemState::INSTALLED
                        | ItemState::DOWNLOADING
                        | ItemState::DOWNLOAD_PENDING,
                ) {
                    let _ = ugc.download_item(published_file_id, true);
                    result.subscribed_ids.push(workshop_id.clone());
                    continue;
                }

                pending_ids.insert(published_file_id.0);
                callback_results
                    .lock()
                    .map_err(|_| AppError::new("Steamworks callback state is poisoned"))?
                    .insert(published_file_id.0, None);

                let callback_results = Arc::clone(&callback_results);
                ugc.subscribe_item(published_file_id, move |subscribe_result| {
                    if let Ok(mut guard) = callback_results.lock() {
                        guard.insert(
                            published_file_id.0,
                            Some(subscribe_result.map_err(|error| error.to_string())),
                        );
                    }
                });
            }

            let deadline = Instant::now() + SUBSCRIBE_WAIT_TIMEOUT;
            while Instant::now() < deadline && !pending_ids.is_empty() {
                client.run_callbacks();
                let callback_snapshot = callback_results
                    .lock()
                    .map_err(|_| AppError::new("Steamworks callback state is poisoned"))?
                    .clone();
                let mut resolved_ids = Vec::new();

                for published_file_id in &pending_ids {
                    let item = PublishedFileId(*published_file_id);
                    let state = ugc.item_state(item);
                    if state.intersects(
                        ItemState::SUBSCRIBED
                            | ItemState::INSTALLED
                            | ItemState::DOWNLOADING
                            | ItemState::DOWNLOAD_PENDING,
                    ) {
                        let _ = ugc.download_item(item, true);
                        result.subscribed_ids.push(published_file_id.to_string());
                        resolved_ids.push(*published_file_id);
                        continue;
                    }

                    if let Some(Some(Err(error))) = callback_snapshot.get(published_file_id) {
                        result.failed_ids.push(published_file_id.to_string());
                        result.warnings.push(format!(
                            "Steamworks subscribe failed for {published_file_id}: {error}"
                        ));
                        resolved_ids.push(*published_file_id);
                    }
                }

                for published_file_id in resolved_ids {
                    pending_ids.remove(&published_file_id);
                }
                thread::sleep(CALLBACK_POLL_INTERVAL);
            }

            let callback_results = callback_results
                .lock()
                .map_err(|_| AppError::new("Steamworks callback state is poisoned"))?
                .clone();
            for published_file_id in pending_ids {
                let workshop_id = published_file_id.to_string();
                match callback_results.get(&published_file_id) {
                    Some(Some(Ok(()))) => {
                        let item = PublishedFileId(published_file_id);
                        let _ = ugc.download_item(item, true);
                        result.subscribed_ids.push(workshop_id);
                    }
                    Some(Some(Err(error))) => {
                        result.failed_ids.push(workshop_id.clone());
                        result.warnings.push(format!(
                            "Steamworks subscribe failed for {workshop_id}: {error}"
                        ));
                    }
                    _ => {
                        result.failed_ids.push(workshop_id.clone());
                        result.warnings.push(format!(
                            "Steamworks did not mark {workshop_id} as subscribed before timeout."
                        ));
                    }
                }
            }

            result.subscribed_ids.sort();
            result.subscribed_ids.dedup();
            result.failed_ids.sort();
            result.failed_ids.dedup();
            Ok(result)
        }
    }
}

#[cfg(not(feature = "steamworks"))]
mod implementation {
    use super::SteamworksSubscriptionResult;
    use crate::error::AppError;

    #[derive(Debug, Clone, Copy)]
    pub struct SteamworksAdapter;

    impl SteamworksAdapter {
        pub fn available() -> bool {
            false
        }

        pub fn subscribe_items(
            _workshop_ids: &[String],
        ) -> Result<SteamworksSubscriptionResult, AppError> {
            Err(AppError::new(
                "Steamworks support is not compiled into this build",
            ))
        }
    }
}

pub use implementation::SteamworksAdapter;
