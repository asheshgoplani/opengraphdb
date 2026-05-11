//! Compression configuration types for the page-storage tiering scheme.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum CompressionAlgorithm {
    None,
    Lz4,
    Zstd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompressionSetting {
    pub algorithm: CompressionAlgorithm,
    pub level: i32,
}

impl CompressionSetting {
    fn lz4(level: i32) -> Self {
        Self {
            algorithm: CompressionAlgorithm::Lz4,
            level,
        }
    }

    fn zstd(level: i32) -> Self {
        Self {
            algorithm: CompressionAlgorithm::Zstd,
            level,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompressionConfig {
    pub hot_warm: CompressionSetting,
    pub cold: CompressionSetting,
}

impl Default for CompressionConfig {
    fn default() -> Self {
        Self {
            hot_warm: CompressionSetting::lz4(1),
            cold: CompressionSetting::zstd(3),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CompressionTier {
    HotWarm,
    Cold,
}
