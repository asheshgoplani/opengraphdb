//! Shim regression: the four plain-data algorithm types must remain
//! nameable from the `ogdb_core::` root after the Phase-2 algorithm
//! split. `ogdb-cli` and `ogdb-e2e` import `ShortestPathOptions` via
//! `use ogdb_core::ShortestPathOptions;` — if this file stops
//! compiling, the shim in `crates/ogdb-core/src/lib.rs` is broken
//! and both downstream crates would fail to build.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-algorithms (`unresolved import
//! ogdb_algorithms`), and `ogdb_core::ShortestPathOptions` is still
//! the in-core original, not a re-export.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_algorithms::{GraphPath, ShortestPathOptions,
//! Subgraph, SubgraphEdge};` and the TypeId equalities below hold.

use std::any::TypeId;

#[test]
fn shortest_path_options_is_reexported_from_ogdb_algorithms() {
    // If this line fails to compile, `use ogdb_core::ShortestPathOptions;`
    // at ogdb-cli/src/lib.rs:5 and ogdb-e2e/tests/comprehensive_e2e.rs:7
    // break too.
    let _opts = ogdb_core::ShortestPathOptions::default();

    assert_eq!(
        TypeId::of::<ogdb_core::ShortestPathOptions>(),
        TypeId::of::<ogdb_algorithms::ShortestPathOptions>(),
        "ogdb_core::ShortestPathOptions must be a `pub use` re-export \
         of ogdb_algorithms::ShortestPathOptions, not a duplicate type. \
         See .planning/ogdb-core-split-algorithms/PLAN.md §7.",
    );
}

#[test]
fn graph_path_is_reexported_from_ogdb_algorithms() {
    assert_eq!(
        TypeId::of::<ogdb_core::GraphPath>(),
        TypeId::of::<ogdb_algorithms::GraphPath>(),
        "ogdb_core::GraphPath must be a `pub use` re-export.",
    );
    let p = ogdb_core::GraphPath {
        node_ids: vec![0, 1],
        edge_ids: vec![10],
        total_weight: 1.0,
    };
    assert_eq!(p.node_ids.len(), 2);
}

#[test]
fn subgraph_types_are_reexported_from_ogdb_algorithms() {
    assert_eq!(
        TypeId::of::<ogdb_core::Subgraph>(),
        TypeId::of::<ogdb_algorithms::Subgraph>(),
    );
    assert_eq!(
        TypeId::of::<ogdb_core::SubgraphEdge>(),
        TypeId::of::<ogdb_algorithms::SubgraphEdge>(),
    );

    // Constructor round-trip across the shim — proves field layout
    // survives the re-export.
    let edge = ogdb_core::SubgraphEdge {
        edge_id: 7,
        src: 0,
        dst: 1,
        edge_type: None,
    };
    let sg = ogdb_core::Subgraph {
        center: 0,
        max_hops: 1,
        nodes: vec![0, 1],
        edges: vec![edge.clone()],
    };
    assert_eq!(sg.edges[0], edge);
    assert_eq!(sg.center, 0);
}

#[test]
fn shortest_path_options_default_matches_inline_construction() {
    // `ogdb-cli`'s MCP shortest_path tool constructs
    // `ShortestPathOptions { max_hops: … , edge_type: None,
    // weight_property: None }` inline (src/lib.rs:3130). After the
    // shim, that still resolves because the struct is a re-export.
    let from_default = ogdb_core::ShortestPathOptions::default();
    let from_explicit = ogdb_core::ShortestPathOptions {
        max_hops: None,
        edge_type: None,
        weight_property: None,
    };
    assert_eq!(from_default, from_explicit);
}

#[test]
fn community_kernels_are_callable_via_ogdb_algorithms_root() {
    // Regression pin: the three kernels must be directly callable
    // from `ogdb_algorithms::` — `ogdb-core`'s `community_*_at`
    // wrappers depend on this exact path via
    // `use ogdb_algorithms::{label_propagation, louvain, leiden};`.
    //
    // We assert the callable path here (not just the type identity)
    // because kernels are free fns, not types, so `TypeId` does not
    // apply.
    let adjacency = vec![vec![1u64], vec![0u64]];
    let visible = vec![0u64, 1];
    let lp = ogdb_algorithms::label_propagation(&adjacency, &visible);
    let lv = ogdb_algorithms::louvain(&adjacency, &visible, 1.0);
    let ld = ogdb_algorithms::leiden(&adjacency, &visible, 1.0);
    assert_eq!(lp.len(), 2);
    assert_eq!(lv.len(), 2);
    assert_eq!(ld.len(), 2);
}
