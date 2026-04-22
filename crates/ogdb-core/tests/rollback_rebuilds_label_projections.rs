//! Regression test for audit finding 3.1: `rollback_txn` must rebuild the
//! in-memory `label_projections` cache after `undo_set_node_labels`.
//!
//! Before the fix, a rolled-back label change left
//! `label_projections` pointing at the post-change labels (while
//! `meta.label_membership` had been correctly reverted). Label-index scans
//! that consult `label_projections` would then return the pre-rollback
//! labels until some unrelated write triggered an incidental rebuild.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-rollback-label-projections-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

#[test]
fn rollback_of_set_labels_refreshes_label_index_scan() {
    let dir = test_dir("scan-after-rollback");
    let db_path = dir.join("graph.ogdb");

    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    // Phase 1: create a node with labels {A, B} and commit.
    let node_id = {
        let mut tx = db.begin_write();
        let n = tx
            .create_node_with(vec!["A".to_string(), "B".to_string()], PropertyMap::new())
            .expect("create node with A,B");
        tx.commit().expect("commit baseline tx");
        n
    };

    // Phase 2: re-label to {X, Y} inside a write txn, then roll back.
    {
        let mut tx = db.begin_write();
        tx.set_node_labels(node_id, vec!["X".to_string(), "Y".to_string()])
            .expect("set labels to X,Y");
        tx.rollback();
    }

    // Phase 3: an index-backed label scan for the rolled-back label "X" must
    // NOT see the rolled-back node. Before the fix, `label_projections` still
    // held the "X"/"Y" projection entries.
    let x_nodes = db.find_nodes_by_label("X");
    assert!(
        !x_nodes.contains(&node_id),
        "index scan for rolled-back label 'X' must not return node {node_id}; \
         got={x_nodes:?}. This means label_projections was not rebuilt in rollback_txn."
    );

    let y_nodes = db.find_nodes_by_label("Y");
    assert!(
        !y_nodes.contains(&node_id),
        "index scan for rolled-back label 'Y' must not return node {node_id}; got={y_nodes:?}"
    );

    // Phase 4: index-backed label scan for the original labels must still
    // return the node — rollback restored them in meta.label_membership AND
    // now also in label_projections.
    let a_nodes = db.find_nodes_by_label("A");
    assert!(
        a_nodes.contains(&node_id),
        "index scan for original label 'A' must return node {node_id} after rollback; got={a_nodes:?}"
    );
    let b_nodes = db.find_nodes_by_label("B");
    assert!(
        b_nodes.contains(&node_id),
        "index scan for original label 'B' must return node {node_id} after rollback; got={b_nodes:?}"
    );

    // node_labels (which reads meta directly, not the projection cache)
    // must agree.
    let labels_after_rollback: std::collections::BTreeSet<String> = db
        .node_labels(node_id)
        .expect("node_labels after rollback")
        .into_iter()
        .collect();
    let expected: std::collections::BTreeSet<String> =
        ["A".to_string(), "B".to_string()].into_iter().collect();
    assert_eq!(
        labels_after_rollback, expected,
        "node_labels must reflect rolled-back state"
    );
}
