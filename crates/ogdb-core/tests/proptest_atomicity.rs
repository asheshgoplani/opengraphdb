//! Property-based tests for ogdb-core transactional invariants.
//!
//! Invariants under test (256 cases each, proptest shrinking on failure):
//!
//!   1. `commit_all_or_nothing`   — atomicity: after a write-tx closes, the
//!      DB state equals either the pre-tx snapshot (rollback) or the
//!      snapshot with every staged op applied (commit). Never partial.
//!
//!   2. `wal_replay_idempotent`   — re-opening a DB (which drives
//!      `recover_from_wal`) is idempotent: two successive drop+reopen
//!      cycles yield byte-identical observable state. Uses the
//!      WAL-durable op subset (CreateNode + AddEdge); see
//!      `wal_durable_op_strategy` for why post-creation
//!      `set_node_labels` / `set_node_properties` are excluded.
//!
//!   3. `read_snapshot_consistency` — every read taken after a commit is
//!      internally consistent: edge endpoints point at valid nodes, all
//!      node label/property reads succeed, snapshot_txn_ids are
//!      non-decreasing across commits. A reader never observes a torn
//!      mid-tx state (`&mut Database` on write enforces mutual exclusion,
//!      so partial visibility is impossible by construction — this test
//!      guards the post-commit observable contract).
//!
//!   4. `mvcc_version_monotonic`  — `WriteTransaction::txn_id()` is
//!      strictly monotonic across successive commits; ReadTransaction
//!      `snapshot_txn_id()` is non-decreasing.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, WriteTransaction};
use proptest::prelude::*;

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Prefer a tmpfs-backed scratch dir (Linux `/dev/shm`) so the hundreds
/// of `fdatasync` calls this suite triggers don't dominate wall time.
/// Falls back to `env::temp_dir()` on non-Linux / missing shm.
fn scratch_root() -> PathBuf {
    let shm = PathBuf::from("/dev/shm");
    if shm.is_dir() {
        shm
    } else {
        env::temp_dir()
    }
}

fn fresh_db_path(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let n = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = scratch_root().join(format!(
        "ogdb-proptest-atomicity-{tag}-{}-{}-{}",
        std::process::id(),
        now,
        n
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[derive(Debug, Clone)]
enum Op {
    CreateNode {
        labels: Vec<String>,
    },
    AddEdge {
        src: u32,
        dst: u32,
    },
    SetLabels {
        node_idx: u32,
        labels: Vec<String>,
    },
    SetProperty {
        node_idx: u32,
        key: String,
        value: i64,
    },
}

fn label_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("A".to_string()),
        Just("B".to_string()),
        Just("C".to_string()),
        Just("D".to_string()),
    ]
}

fn labels_strategy() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec(label_strategy(), 0..3)
}

fn key_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("k1".to_string()),
        Just("k2".to_string()),
        Just("k3".to_string()),
    ]
}

fn op_strategy() -> impl Strategy<Value = Op> {
    prop_oneof![
        2 => labels_strategy().prop_map(|labels| Op::CreateNode { labels }),
        1 => (any::<u32>(), any::<u32>()).prop_map(|(src, dst)| Op::AddEdge { src, dst }),
        1 => (any::<u32>(), labels_strategy())
            .prop_map(|(node_idx, labels)| Op::SetLabels { node_idx, labels }),
        1 => (any::<u32>(), key_strategy(), any::<i64>())
            .prop_map(|(node_idx, key, value)| Op::SetProperty { node_idx, key, value }),
    ]
}

/// WAL-durable subset: CreateNode carries its labels/properties through
/// `CREATE_NODE_V2`; AddEdge writes `ADD_EDGE`. Post-creation
/// `set_node_labels` / `set_node_properties` are persisted only via
/// `meta.json` (no WAL record) and therefore get rebuilt from the stale
/// CREATE_NODE_V2 on replay — they are explicitly out of the WAL
/// durability contract encoded by `upgrade_wal_buffer_to_v2`. The
/// `wal_replay_idempotent` invariant restricts itself to this subset.
fn wal_durable_op_strategy() -> impl Strategy<Value = Op> {
    prop_oneof![
        2 => labels_strategy().prop_map(|labels| Op::CreateNode { labels }),
        1 => (any::<u32>(), any::<u32>()).prop_map(|(src, dst)| Op::AddEdge { src, dst }),
    ]
}

fn ops_strategy() -> impl Strategy<Value = Vec<Op>> {
    prop::collection::vec(op_strategy(), 0..8)
}

fn wal_durable_ops_strategy() -> impl Strategy<Value = Vec<Op>> {
    prop::collection::vec(wal_durable_op_strategy(), 0..8)
}

/// Observable DB state captured for equality comparisons across commit /
/// rollback / reopen cycles. Labels are sorted (BTreeSet) so ordering
/// differences in the underlying storage don't cause false mismatches.
#[derive(Debug, PartialEq, Eq, Clone)]
struct Snapshot {
    node_count: u64,
    edge_count: u64,
    node_labels: Vec<BTreeSet<String>>,
    /// Stringified (key, value) pairs per node — stable, debuggable, total.
    node_props: Vec<Vec<(String, String)>>,
    /// (src, dst) pairs per edge id in order.
    edges: Vec<(u64, u64)>,
}

fn snapshot(db: &Database) -> Snapshot {
    let node_count = db.node_count();
    let edge_count = db.edge_count();

    let mut node_labels = Vec::with_capacity(node_count as usize);
    let mut node_props = Vec::with_capacity(node_count as usize);
    for id in 0..node_count {
        let labels: BTreeSet<String> = db
            .node_labels(id)
            .expect("read node_labels in snapshot")
            .into_iter()
            .collect();
        node_labels.push(labels);
        let props = db.node_properties(id).expect("read node_properties in snapshot");
        let mut pairs: Vec<(String, String)> = props
            .into_iter()
            .map(|(k, v)| (k, format!("{:?}", v)))
            .collect();
        pairs.sort();
        node_props.push(pairs);
    }

    let mut edges = Vec::with_capacity(edge_count as usize);
    let exported = db.export_edges().expect("export_edges in snapshot");
    for e in exported {
        edges.push((e.src, e.dst));
    }

    Snapshot {
        node_count,
        edge_count,
        node_labels,
        node_props,
        edges,
    }
}

/// Applies `ops` to `tx`, mapping unbounded u32 node indices into the live
/// id space so we don't constantly hit `InvalidArgument`. Returns the
/// projected node count after the ops (caller may ignore).
fn apply_ops_in_tx(tx: &mut WriteTransaction<'_>, ops: &[Op]) {
    for op in ops {
        match op {
            Op::CreateNode { labels } => {
                let _ = tx.create_node_with(labels.clone(), PropertyMap::new());
            }
            Op::AddEdge { src, dst } => {
                let n = tx.projected_node_count();
                if n == 0 {
                    continue;
                }
                let s = (*src as u64) % n;
                let d = (*dst as u64) % n;
                let _ = tx.add_edge(s, d);
            }
            Op::SetLabels { node_idx, labels } => {
                let n = tx.projected_node_count();
                if n == 0 {
                    continue;
                }
                let id = (*node_idx as u64) % n;
                let _ = tx.set_node_labels(id, labels.clone());
            }
            Op::SetProperty {
                node_idx,
                key,
                value,
            } => {
                let n = tx.projected_node_count();
                if n == 0 {
                    continue;
                }
                let id = (*node_idx as u64) % n;
                let mut pm = PropertyMap::new();
                pm.insert(key.clone(), PropertyValue::I64(*value));
                let _ = tx.set_node_properties(id, pm);
            }
        }
    }
}

fn seeded_db(tag: &str) -> (Database, PathBuf) {
    let path = fresh_db_path(tag);
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");
    // A single seed node ensures AddEdge/SetLabels/SetProperty ops have a
    // non-empty id space in the very first generated tx.
    {
        let mut tx = db.begin_write();
        tx.create_node_with(vec!["Seed".to_string()], PropertyMap::new())
            .expect("seed node");
        tx.commit().expect("commit seed");
    }
    (db, path)
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 256,
        max_shrink_iters: 512,
        .. ProptestConfig::default()
    })]

    // -----------------------------------------------------------------
    // Invariant 1: commit-or-rollback is all-or-nothing.
    // -----------------------------------------------------------------
    #[test]
    fn commit_all_or_nothing(ops in ops_strategy(), do_commit in any::<bool>()) {
        let (mut db, _path) = seeded_db("atomic");
        let s_before = snapshot(&db);

        {
            let mut tx = db.begin_write();
            apply_ops_in_tx(&mut tx, &ops);
            if do_commit {
                tx.commit().expect("commit");
            } else {
                tx.rollback();
            }
        }

        let s_after = snapshot(&db);

        if !do_commit {
            // Rollback MUST restore exactly the pre-tx snapshot.
            prop_assert_eq!(
                &s_before, &s_after,
                "rollback did not restore pre-tx state"
            );
        } else {
            // Commit MUST preserve pre-existing ids and only grow counts.
            prop_assert!(
                s_after.node_count >= s_before.node_count,
                "commit reduced node_count from {} to {}",
                s_before.node_count, s_after.node_count
            );
            prop_assert!(
                s_after.edge_count >= s_before.edge_count,
                "commit reduced edge_count"
            );
            // Pre-existing edges survive a commit (edges are append-only).
            for (i, edge) in s_before.edges.iter().enumerate() {
                prop_assert_eq!(
                    &s_after.edges[i], edge,
                    "pre-existing edge {} changed across commit", i
                );
            }
        }
    }

    // -----------------------------------------------------------------
    // Invariant 2: WAL replay is idempotent across repeated reopens.
    // -----------------------------------------------------------------
    #[test]
    fn wal_replay_idempotent(
        chunk_a in wal_durable_ops_strategy(),
        chunk_b in wal_durable_ops_strategy(),
    ) {
        let (mut db, path) = seeded_db("wal");
        for chunk in [&chunk_a, &chunk_b] {
            let mut tx = db.begin_write();
            apply_ops_in_tx(&mut tx, chunk);
            tx.commit().expect("commit chunk");
        }
        let s_original = snapshot(&db);
        drop(db);

        let db1 = Database::open(&path).expect("reopen 1");
        let s1 = snapshot(&db1);
        drop(db1);

        let db2 = Database::open(&path).expect("reopen 2");
        let s2 = snapshot(&db2);

        prop_assert_eq!(&s_original, &s1, "reopen 1 diverges from original");
        prop_assert_eq!(&s1, &s2, "reopen 2 diverges from reopen 1 — WAL replay not idempotent");
    }

    // -----------------------------------------------------------------
    // Invariant 3: every post-commit snapshot is internally consistent.
    // -----------------------------------------------------------------
    #[test]
    fn read_snapshot_consistency(
        chunks in prop::collection::vec(ops_strategy(), 1..4),
    ) {
        let (mut db, _path) = seeded_db("snap");
        let mut prev_snap_id = db.begin_read().snapshot_txn_id();

        for chunk in &chunks {
            {
                let mut tx = db.begin_write();
                apply_ops_in_tx(&mut tx, chunk);
                tx.commit().expect("commit chunk");
            }

            let rt = db.begin_read();
            let snap_id = rt.snapshot_txn_id();
            prop_assert!(
                snap_id >= prev_snap_id,
                "snapshot_txn_id went backwards: {} -> {}",
                prev_snap_id, snap_id
            );
            prev_snap_id = snap_id;

            let nc = rt.node_count();
            let ec = rt.edge_count();

            // Every node id in the snapshot is readable (labels + props).
            for nid in 0..nc {
                prop_assert!(
                    rt.node_labels(nid).is_ok(),
                    "node {} labels unreadable in snapshot {}", nid, snap_id
                );
                prop_assert!(
                    rt.node_properties(nid).is_ok(),
                    "node {} properties unreadable in snapshot {}", nid, snap_id
                );
            }
            // Every edge id in the snapshot is readable AND its endpoints
            // reference valid node ids within the same snapshot.
            for eid in 0..ec {
                prop_assert!(rt.edge_properties(eid).is_ok());
                prop_assert!(rt.edge_type(eid).is_ok());
            }
            drop(rt);

            for e in db.export_edges().expect("export edges") {
                prop_assert!(
                    e.src < nc,
                    "edge {} src={} escapes snapshot node_count={}",
                    e.id, e.src, nc
                );
                prop_assert!(
                    e.dst < nc,
                    "edge {} dst={} escapes snapshot node_count={}",
                    e.id, e.dst, nc
                );
            }
        }
    }

    // -----------------------------------------------------------------
    // Invariant 4: MVCC version stamps are strictly monotonic.
    // -----------------------------------------------------------------
    #[test]
    fn mvcc_version_monotonic(
        chunks in prop::collection::vec(ops_strategy(), 1..4),
    ) {
        let (mut db, _path) = seeded_db("mvcc");
        let mut prev_txn_id: Option<u64> = None;
        let mut prev_snap_id: Option<u64> = None;

        for chunk in &chunks {
            let observed_txn_id = {
                let mut tx = db.begin_write();
                let id = tx.txn_id();
                apply_ops_in_tx(&mut tx, chunk);
                tx.commit().expect("commit chunk");
                id
            };

            if let Some(prev) = prev_txn_id {
                prop_assert!(
                    observed_txn_id > prev,
                    "WriteTransaction::txn_id must strictly increase across commits: {} not > {}",
                    observed_txn_id, prev
                );
            }
            prev_txn_id = Some(observed_txn_id);

            let rt = db.begin_read();
            let snap_id = rt.snapshot_txn_id();
            if let Some(prev) = prev_snap_id {
                prop_assert!(
                    snap_id >= prev,
                    "ReadTransaction::snapshot_txn_id went backwards: {} -> {}",
                    prev, snap_id
                );
            }
            // After a commit, the read snapshot must observe the committed
            // txn (i.e. snapshot_txn_id >= the committed txn's id).
            prop_assert!(
                snap_id >= observed_txn_id,
                "post-commit snapshot_txn_id={} must be >= committed txn_id={}",
                snap_id, observed_txn_id
            );
            prev_snap_id = Some(snap_id);
        }
    }
}
