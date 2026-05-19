//! Database metrics, query profiling, and trace-collection types.

use crate::DbError;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OutDegreeStats {
    pub node_count: u64,
    pub edge_count: u64,
    pub zero_out_degree_nodes: u64,
    pub max_out_degree: u64,
    pub max_out_degree_node: Option<u64>,
    pub avg_out_degree: f64,
}

/// Detailed profile for one query execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryProfile {
    pub operation: String,
    pub duration_micros: u128,
    pub node_count_before: u64,
    pub edge_count_before: u64,
    pub node_count_after: u64,
    pub edge_count_after: u64,
    pub success: bool,
    pub parse_micros: u128,
    pub analyze_micros: u128,
    pub logical_plan_micros: u128,
    pub physical_plan_micros: u128,
    pub execute_micros: u128,
}

/// Operation result paired with a [`QueryProfile`].
#[derive(Debug)]
pub struct ProfiledQueryResult<T> {
    pub result: Result<T, DbError>,
    pub profile: QueryProfile,
}

impl<T> ProfiledQueryResult<T> {
    pub fn into_result(self) -> Result<(T, QueryProfile), DbError> {
        match self.result {
            Ok(value) => Ok((value, self.profile)),
            Err(err) => Err(err),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DbMetrics {
    pub format_version: u16,
    pub page_size: u32,
    pub page_count: u64,
    pub node_count: u64,
    pub edge_count: u64,
    pub wal_size_bytes: u64,
    pub adjacency_base_edge_count: u64,
    pub delta_buffer_edge_count: u64,
    pub compaction_count: u64,
    pub compaction_duration_us: u64,
    pub buffer_pool_hits: u64,
    pub buffer_pool_misses: u64,
}

/// Records visited node IDs during query execution for trace animation.
/// Attached to physical plan execution to capture real traversal order.
#[derive(Debug, Clone, Default)]
pub struct TraceCollector {
    /// Node IDs visited during execution, in traversal order (may contain duplicates).
    pub visited_node_ids: Vec<u64>,
    /// Edge references visited during expansion, in traversal order.
    pub visited_edge_ids: Vec<(u64, u64, u64)>, // (src, dst, edge_id)
}

impl TraceCollector {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_node(&mut self, node_id: u64) {
        self.visited_node_ids.push(node_id);
    }

    pub fn record_edge(&mut self, src: u64, dst: u64, edge_offset: u64) {
        self.visited_edge_ids.push((src, dst, edge_offset));
    }

    /// Deduplicate while preserving first-seen order.
    #[must_use]
    pub fn unique_node_ids(&self) -> Vec<u64> {
        let mut seen = std::collections::HashSet::new();
        self.visited_node_ids
            .iter()
            .filter(|id| seen.insert(**id))
            .copied()
            .collect()
    }
}

/// Summary statistics for a mutation query execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionSummary {
    /// Number of rows returned by the query.
    pub rows_returned: usize,
    /// Node count before execution.
    pub nodes_before: u64,
    /// Node count after execution.
    pub nodes_after: u64,
    /// Edge count before execution.
    pub edges_before: u64,
    /// Edge count after execution.
    pub edges_after: u64,
}

impl ExecutionSummary {
    /// Number of nodes created by the query.
    #[must_use]
    pub fn nodes_created(&self) -> u64 {
        self.nodes_after.saturating_sub(self.nodes_before)
    }

    /// Number of edges created by the query.
    #[must_use]
    pub fn edges_created(&self) -> u64 {
        self.edges_after.saturating_sub(self.edges_before)
    }
}
