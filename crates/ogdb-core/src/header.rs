//! On-disk database header: magic, version, page size, and adjacency/edge counters.

use crate::{DbError, HEADER_SIZE, MAGIC, MIN_PAGE_SIZE};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// On-disk database header metadata.
pub struct Header {
    pub format_version: u16,
    pub page_size: u32,
    pub next_node_id: u64,
    pub edge_count: u64,
}

impl Header {
    #[must_use]
    pub fn default_v1() -> Self {
        Self {
            format_version: 1,
            page_size: 4096,
            next_node_id: 0,
            edge_count: 0,
        }
    }

    #[must_use]
    pub fn encode(self) -> [u8; HEADER_SIZE] {
        let mut out = [0u8; HEADER_SIZE];
        out[..8].copy_from_slice(&MAGIC);
        out[8..10].copy_from_slice(&self.format_version.to_le_bytes());
        out[10..14].copy_from_slice(&self.page_size.to_le_bytes());
        out[14..22].copy_from_slice(&self.next_node_id.to_le_bytes());
        out[22..30].copy_from_slice(&self.edge_count.to_le_bytes());
        out
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, DbError> {
        if bytes.len() < HEADER_SIZE {
            return Err(DbError::Corrupt(
                "header shorter than expected size".to_string(),
            ));
        }
        let mut magic = [0u8; 8];
        magic.copy_from_slice(&bytes[..8]);
        if magic != MAGIC {
            return Err(DbError::Corrupt("invalid file magic".to_string()));
        }
        let mut version_bytes = [0u8; 2];
        version_bytes.copy_from_slice(&bytes[8..10]);
        let mut page_size_bytes = [0u8; 4];
        page_size_bytes.copy_from_slice(&bytes[10..14]);
        let mut next_node_id_bytes = [0u8; 8];
        next_node_id_bytes.copy_from_slice(&bytes[14..22]);
        let mut edge_count_bytes = [0u8; 8];
        edge_count_bytes.copy_from_slice(&bytes[22..30]);
        let format_version = u16::from_le_bytes(version_bytes);
        let page_size = u32::from_le_bytes(page_size_bytes);
        let next_node_id = u64::from_le_bytes(next_node_id_bytes);
        let edge_count = u64::from_le_bytes(edge_count_bytes);
        if format_version == 0 {
            return Err(DbError::Corrupt("invalid format version".to_string()));
        }
        if page_size < MIN_PAGE_SIZE || !page_size.is_power_of_two() {
            return Err(DbError::Corrupt(
                "invalid page size (must be power of two and >= 64)".to_string(),
            ));
        }
        Ok(Self {
            format_version,
            page_size,
            next_node_id,
            edge_count,
        })
    }
}
