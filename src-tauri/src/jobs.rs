use crate::contracts::JoinJobStatus;
use crate::error::AppError;
use crate::AppState;

pub fn upsert_job(state: &AppState, status: JoinJobStatus) -> Result<JoinJobStatus, AppError> {
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| AppError::new("Could not lock job registry"))?;
    jobs.insert(status.job_id.clone(), status.clone());
    Ok(status)
}

pub fn get_job(state: &AppState, job_id: &str) -> Result<JoinJobStatus, AppError> {
    let jobs = state
        .jobs
        .lock()
        .map_err(|_| AppError::new("Could not lock job registry"))?;
    jobs.get(job_id)
        .cloned()
        .ok_or_else(|| AppError::new(format!("No job found for id {job_id}")))
}
