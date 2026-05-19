//! Write concurrency policy and database role types.

use serde::{Deserialize, Serialize};

/// Write concurrency policy used by [`SharedDatabase`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum WriteConcurrencyMode {
    /// Serialize all writers.
    SingleWriter,
    /// Allow concurrent writers with optimistic conflict retries.
    MultiWriter { max_retries: usize },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[non_exhaustive]
pub enum DbRole {
    Admin,
    ReadWrite,
    ReadOnly,
}
