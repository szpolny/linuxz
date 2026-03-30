use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub struct AppError(pub String);

impl AppError {
  pub fn new(message: impl Into<String>) -> Self {
    Self(message.into())
  }
}

impl Display for AppError {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    f.write_str(&self.0)
  }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
  fn from(value: std::io::Error) -> Self {
    Self::new(value.to_string())
  }
}

impl From<rusqlite::Error> for AppError {
  fn from(value: rusqlite::Error) -> Self {
    Self::new(value.to_string())
  }
}

impl From<reqwest::Error> for AppError {
  fn from(value: reqwest::Error) -> Self {
    Self::new(value.to_string())
  }
}

impl From<serde_json::Error> for AppError {
  fn from(value: serde_json::Error) -> Self {
    Self::new(value.to_string())
  }
}
