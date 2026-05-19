//! Storage and core database error types.
//!
//! Query parse/planning/execution failures are represented by `QueryError`
//! (defined elsewhere in the crate).

use std::error::Error;
use std::fmt::{Display, Formatter};
use std::path::PathBuf;

/// Errors returned by storage and core database operations.
///
/// Query parse/planning/execution failures are represented by [`QueryError`].
///
/// `#[non_exhaustive]` per eval/rust-quality §6.2 so adding a new variant
/// is not a breaking change for downstream consumers.
#[derive(Debug)]
#[non_exhaustive]
pub enum DbError {
    Io(std::io::Error),
    Corrupt(String),
    AlreadyExists(PathBuf),
    InvalidArgument(String),
    Timeout(String),
    Conflict(String),
    PageOutOfBounds { page_id: u64, page_count: u64 },
}

impl Display for DbError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "io error: {e}"),
            Self::Corrupt(msg) => write!(f, "corrupt database: {msg}"),
            Self::AlreadyExists(path) => write!(f, "database already exists: {}", path.display()),
            Self::InvalidArgument(msg) => write!(f, "invalid argument: {msg}"),
            Self::Timeout(msg) => write!(f, "timeout: {msg}"),
            Self::Conflict(msg) => write!(f, "write conflict: {msg}"),
            Self::PageOutOfBounds {
                page_id,
                page_count,
            } => write!(
                f,
                "page out of bounds: page_id={page_id}, page_count={page_count}"
            ),
        }
    }
}

impl Error for DbError {}

impl From<std::io::Error> for DbError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}
