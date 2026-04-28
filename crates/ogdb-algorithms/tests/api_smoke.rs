//! RED-phase API smoke test for the extracted ogdb-algorithms crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_algorithms::{ShortestPathOptions, GraphPath, Subgraph,
//! SubgraphEdge, label_propagation, louvain, leiden}` are not yet
//! defined (src/lib.rs is intentionally empty).
//!
//! GREEN state (Phases 3–5 of the 8-phase workflow, see
//! `.planning/ogdb-core-split-algorithms/PLAN.md` §6): every test
//! passes because the items have been moved out of
//! crates/ogdb-core/src/lib.rs into crates/ogdb-algorithms/src/lib.rs.

use ogdb_algorithms::{
    label_propagation, leiden, louvain, GraphPath, ShortestPathOptions, Subgraph, SubgraphEdge,
};

#[test]
fn shortest_path_options_is_plain_data_with_default() {
    // Derive surface must survive the move: Debug + Clone + PartialEq
    // + Eq + Default are load-bearing for `ogdb-cli` and `ogdb-e2e`
    // constructors + assertions.
    let opts = ShortestPathOptions::default();
    assert_eq!(opts.max_hops, None);
    assert_eq!(opts.edge_type, None);
    assert_eq!(opts.weight_property, None);

    let custom = ShortestPathOptions {
        max_hops: Some(5),
        edge_type: Some("KNOWS".to_string()),
        weight_property: Some("w".to_string()),
    };
    assert_ne!(opts, custom);
    assert_eq!(custom.clone(), custom);
}

#[test]
fn graph_path_round_trips_cloned_fields() {
    // Pinning: shortest_path_with_options_at returns Option<GraphPath>
    // and reconstruct_graph_path assembles it. Every field is pub.
    let p = GraphPath {
        node_ids: vec![0, 1, 2],
        edge_ids: vec![10, 20],
        total_weight: 3.5,
    };
    let q = p.clone();
    assert_eq!(p, q);
    assert_eq!(p.node_ids.len(), p.edge_ids.len() + 1);
}

#[test]
fn subgraph_and_subgraph_edge_are_plain_data() {
    // `extract_subgraph_at` returns Subgraph populated with
    // SubgraphEdge values. Every field is pub + Eq.
    let e = SubgraphEdge {
        edge_id: 42,
        src: 1,
        dst: 2,
        edge_type: Some("KNOWS".into()),
    };
    let sg = Subgraph {
        center: 1,
        max_hops: 2,
        nodes: vec![1, 2],
        edges: vec![e.clone()],
    };
    assert_eq!(sg.edges[0], e);
    assert_eq!(sg.nodes.len(), 2);
}

#[test]
fn label_propagation_converges_on_a_single_clique() {
    // 4-node clique → every node must end up in the same community.
    let adjacency = vec![
        vec![1, 2, 3], // 0
        vec![0, 2, 3], // 1
        vec![0, 1, 3], // 2
        vec![0, 1, 2], // 3
    ];
    let visible = vec![0u64, 1, 2, 3];
    let result = label_propagation(&adjacency, &visible);
    assert_eq!(result.len(), 4);
    let first_label = result[0].1;
    for (_, label) in &result {
        assert_eq!(
            *label, first_label,
            "all clique members must converge to one community",
        );
    }
}

#[test]
fn label_propagation_respects_disjoint_components() {
    // Two disconnected 2-node components → two distinct labels.
    let adjacency = vec![
        vec![1], // 0 ↔ 1
        vec![0],
        vec![3], // 2 ↔ 3
        vec![2],
    ];
    let visible = vec![0u64, 1, 2, 3];
    let result = label_propagation(&adjacency, &visible);
    let label_of = |node: u64| result.iter().find(|(n, _)| *n == node).unwrap().1;
    assert_eq!(
        label_of(0),
        label_of(1),
        "connected pair must share a label"
    );
    assert_eq!(
        label_of(2),
        label_of(3),
        "connected pair must share a label"
    );
    assert_ne!(label_of(0), label_of(2), "disjoint components must differ");
}

#[test]
fn louvain_assigns_everyone_a_community() {
    // 3-node triangle at resolution=1.0 — standard Louvain.
    let adjacency = vec![vec![1, 2], vec![0, 2], vec![0, 1]];
    let visible = vec![0u64, 1, 2];
    let result = louvain(&adjacency, &visible, 1.0);
    assert_eq!(result.len(), 3);
    // Every triangle node must land in the same community because the
    // modularity gain of merging is strictly positive.
    let first = result[0].1;
    assert!(result.iter().all(|(_, c)| *c == first));
}

#[test]
fn louvain_handles_empty_graph_as_self_communities() {
    // Regression pin: `community_louvain_at` returns (node_id, node_id)
    // when m2 <= 0.0 (no visible edges). That invariant is load-bearing
    // for callers that expect every visible node to appear in the
    // result even on an empty graph.
    let adjacency: Vec<Vec<u64>> = vec![Vec::new(); 3];
    let visible = vec![0u64, 1, 2];
    let result = louvain(&adjacency, &visible, 1.0);
    assert_eq!(result.len(), 3);
    for (node_id, community_id) in result {
        assert_eq!(node_id, community_id, "isolated node is its own community");
    }
}

#[test]
fn leiden_splits_louvain_cluster_when_disconnected() {
    // Craft a graph where two triangles are disjoint (no cross-edges).
    // Louvain should already separate them (no modularity gain from
    // merging disconnected groups), and Leiden must agree — its
    // connectivity refinement is idempotent on already-connected
    // components. The critical invariant: Leiden MUST NOT merge
    // disconnected triangles into one community.
    let adjacency = vec![
        vec![1, 2],
        vec![0, 2],
        vec![0, 1], // triangle A
        vec![4, 5],
        vec![3, 5],
        vec![3, 4], // triangle B
    ];
    let visible = (0u64..6).collect::<Vec<_>>();
    let result = leiden(&adjacency, &visible, 1.0);
    assert_eq!(result.len(), 6);
    let community_of = |node: u64| result.iter().find(|(n, _)| *n == node).unwrap().1;
    assert_eq!(community_of(0), community_of(1));
    assert_eq!(community_of(1), community_of(2));
    assert_eq!(community_of(3), community_of(4));
    assert_eq!(community_of(4), community_of(5));
    assert_ne!(
        community_of(0),
        community_of(3),
        "disconnected triangles must never share a Leiden community",
    );
}

#[test]
fn leiden_respects_resolution_parameter_type() {
    // Compile-level pin: the kernel's `resolution: f64` parameter must
    // accept finite positive values. Regressing to `f32` or an enum
    // would break `build_community_hierarchy_at`'s resolution sweep.
    let adjacency = vec![vec![1], vec![0]];
    let visible = vec![0u64, 1];
    let r0 = leiden(&adjacency, &visible, 0.5);
    let r1 = leiden(&adjacency, &visible, 1.0);
    let r2 = leiden(&adjacency, &visible, 2.0);
    for r in [r0, r1, r2] {
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].1, r[1].1, "connected pair always one community");
    }
}
