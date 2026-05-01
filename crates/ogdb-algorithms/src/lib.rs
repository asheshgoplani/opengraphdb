//! Pure-math graph-algorithm primitives extracted from `ogdb-core`.
//!
//! This crate owns four plain-data types
//! (`ShortestPathOptions`, `GraphPath`, `Subgraph`, `SubgraphEdge`) and three
//! pure-math community-detection kernels
//! (`label_propagation`, `louvain`, `leiden`). None of the kernels read a
//! `Database`, `Snapshot`, or `DbError` — each takes a precomputed
//! `adjacency: &[Vec<u64>]` + `visible_nodes: &[u64]` and returns
//! `Vec<(u64, u64)>`. See `.planning/ogdb-core-split-algorithms/PLAN.md`
//! for the full extraction rationale.

#![warn(missing_docs)]

use std::collections::{BTreeMap, BTreeSet, VecDeque};

/// Options for `ogdb_core::Database::shortest_path` (the consumer
/// lives in `ogdb-core`; this crate has no dep on it).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ShortestPathOptions {
    /// Cap on path length in edges. `None` means unbounded (BFS to exhaustion).
    pub max_hops: Option<u32>,
    /// If set, only edges of this `:TYPE` participate in the traversal.
    pub edge_type: Option<String>,
    /// Optional edge property used as the Dijkstra weight; otherwise unweighted BFS.
    pub weight_property: Option<String>,
}

/// Result of a shortest-path traversal: ordered node and edge ids plus
/// total weight (BFS hop-count when no `weight_property` was supplied).
#[derive(Debug, Clone, PartialEq)]
pub struct GraphPath {
    /// Ordered node ids traversed, including the start and end.
    pub node_ids: Vec<u64>,
    /// Edge ids traversed (`node_ids.len() - 1` entries).
    pub edge_ids: Vec<u64>,
    /// Sum of edge weights, or hop count when unweighted.
    pub total_weight: f64,
}

/// One edge inside a [`Subgraph`] result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubgraphEdge {
    /// Edge id.
    pub edge_id: u64,
    /// Source node id.
    pub src: u64,
    /// Destination node id.
    pub dst: u64,
    /// Edge `:TYPE`, if known.
    pub edge_type: Option<String>,
}

/// k-hop neighborhood result around a center node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subgraph {
    /// Center node id this subgraph was expanded from.
    pub center: u64,
    /// Maximum hop distance the traversal honored.
    pub max_hops: u32,
    /// All node ids reached within `max_hops` of `center`.
    pub nodes: Vec<u64>,
    /// All edges between `nodes`.
    pub edges: Vec<SubgraphEdge>,
}

/// Asynchronous label-propagation community detection.
///
/// Runs up to 20 rounds of majority voting: each visible node adopts the
/// most common community label among its neighbors, tie-breaking on the
/// smallest community id. Converges when one full pass produces no
/// changes.
///
/// * `adjacency` — `adjacency[node_id]` = list of neighbor ids
///   (undirected, deduplicated). `adjacency.len()` is the total node-id
///   space; nodes outside `visible_nodes` may still appear as neighbor
///   entries and are read for their current labels.
/// * `visible_nodes` — ids to assign labels to.
///
/// Returns `Vec<(node_id, community_id)>` in `visible_nodes` order.
pub fn label_propagation(adjacency: &[Vec<u64>], visible_nodes: &[u64]) -> Vec<(u64, u64)> {
    let mut labels = (0..adjacency.len() as u64).collect::<Vec<_>>();

    for _ in 0..20 {
        let mut changed = false;
        for node_id in visible_nodes {
            let node_idx = *node_id as usize;
            if adjacency[node_idx].is_empty() {
                continue;
            }
            let mut counts = BTreeMap::<u64, u64>::new();
            for neighbor in &adjacency[node_idx] {
                *counts.entry(labels[*neighbor as usize]).or_insert(0) += 1;
            }
            let mut best_label = labels[node_idx];
            let mut best_count = 0u64;
            for (candidate_label, count) in counts {
                if count > best_count || (count == best_count && candidate_label < best_label) {
                    best_label = candidate_label;
                    best_count = count;
                }
            }
            if best_label != labels[node_idx] {
                labels[node_idx] = best_label;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    visible_nodes
        .iter()
        .map(|node_id| (*node_id, labels[*node_id as usize]))
        .collect()
}

/// Louvain modularity-optimising community detection with a tunable
/// resolution parameter.
///
/// * `resolution` = 1.0 reproduces plain-Louvain behavior
///   (gain = k_i_in − total·deg/m2).
/// * `resolution` ≠ 1.0 scales the null-model term
///   (gain = k_i_in − resolution·total·deg/m2), matching the Louvain
///   phase of Leiden.
///
/// Runs up to 20 rounds. Returns `Vec<(node_id, community_id)>` in
/// `visible_nodes` order. Returns `(node_id, node_id)` self-communities
/// when `m2 <= 0.0`.
pub fn louvain(adjacency: &[Vec<u64>], visible_nodes: &[u64], resolution: f64) -> Vec<(u64, u64)> {
    if visible_nodes.is_empty() {
        return Vec::new();
    }

    let degrees = adjacency
        .iter()
        .map(|entries| entries.len() as f64)
        .collect::<Vec<_>>();
    let m2 = degrees.iter().sum::<f64>();
    if m2 <= 0.0 {
        return visible_nodes
            .iter()
            .map(|node_id| (*node_id, *node_id))
            .collect();
    }

    let mut communities = (0..adjacency.len() as u64).collect::<Vec<_>>();
    let mut community_totals = BTreeMap::<u64, f64>::new();
    for node_id in visible_nodes {
        community_totals.insert(*node_id, degrees[*node_id as usize]);
    }

    for _ in 0..20 {
        let mut changed = false;
        for node_id in visible_nodes {
            let idx = *node_id as usize;
            let degree = degrees[idx];
            if degree == 0.0 {
                continue;
            }

            let current_community = communities[idx];
            if let Some(total) = community_totals.get_mut(&current_community) {
                *total -= degree;
            }

            let mut in_weights = BTreeMap::<u64, f64>::new();
            for neighbor in &adjacency[idx] {
                let comm = communities[*neighbor as usize];
                *in_weights.entry(comm).or_insert(0.0) += 1.0;
            }

            let mut best_community = current_community;
            let mut best_gain = 0.0f64;
            for (community, k_i_in) in in_weights {
                let total = *community_totals.get(&community).unwrap_or(&0.0);
                let gain = k_i_in - resolution * (total * degree / m2);
                if gain > best_gain
                    || ((gain - best_gain).abs() < f64::EPSILON && community < best_community)
                {
                    best_gain = gain;
                    best_community = community;
                }
            }

            communities[idx] = best_community;
            *community_totals.entry(best_community).or_insert(0.0) += degree;
            if best_community != current_community {
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    visible_nodes
        .iter()
        .map(|node_id| (*node_id, communities[*node_id as usize]))
        .collect()
}

/// Leiden community detection: a Louvain modularity pass followed by a
/// connectivity-refinement pass that splits disconnected sub-clusters
/// within each Louvain community via BFS. The refined split assigns a
/// fresh community id to the second (and subsequent) connected
/// component of every Louvain group.
pub fn leiden(adjacency: &[Vec<u64>], visible_nodes: &[u64], resolution: f64) -> Vec<(u64, u64)> {
    if visible_nodes.is_empty() {
        return Vec::new();
    }

    let degrees: Vec<f64> = adjacency
        .iter()
        .map(|entries| entries.len() as f64)
        .collect();
    let m2 = degrees.iter().sum::<f64>();
    if m2 <= 0.0 {
        return visible_nodes.iter().map(|n| (*n, *n)).collect();
    }

    // Phase 1: Louvain modularity pass (shared kernel, resolution-aware).
    let louvain_result = louvain(adjacency, visible_nodes, resolution);
    let mut communities: Vec<u64> = (0..adjacency.len() as u64).collect();
    for (node_id, community_id) in &louvain_result {
        communities[*node_id as usize] = *community_id;
    }

    // Phase 2: Leiden refinement — split disconnected subclusters within each community.
    let mut community_members = BTreeMap::<u64, Vec<u64>>::new();
    for node_id in visible_nodes {
        community_members
            .entry(communities[*node_id as usize])
            .or_default()
            .push(*node_id);
    }

    let mut next_community_id = visible_nodes.iter().max().copied().unwrap_or(0) + 1;

    for member_nodes in community_members.values() {
        if member_nodes.len() <= 1 {
            continue;
        }
        let member_set: BTreeSet<u64> = member_nodes.iter().copied().collect();
        let mut visited = BTreeSet::<u64>::new();
        let mut component_id = 0u64;

        for start_node in member_nodes {
            if visited.contains(start_node) {
                continue;
            }
            let mut queue = VecDeque::new();
            queue.push_back(*start_node);
            visited.insert(*start_node);
            let mut component_nodes = Vec::new();

            while let Some(current) = queue.pop_front() {
                component_nodes.push(current);
                for neighbor in &adjacency[current as usize] {
                    if member_set.contains(neighbor) && !visited.contains(neighbor) {
                        visited.insert(*neighbor);
                        queue.push_back(*neighbor);
                    }
                }
            }

            if component_id > 0 {
                let new_id = next_community_id;
                next_community_id += 1;
                for node_id in &component_nodes {
                    communities[*node_id as usize] = new_id;
                }
            }
            component_id += 1;
        }
    }

    visible_nodes
        .iter()
        .map(|node_id| (*node_id, communities[*node_id as usize]))
        .collect()
}
