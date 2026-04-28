//! Regression test for audit finding 2.1: the WAL v2 CREATE_NODE record
//! carries labels + properties so a hard power loss that destroys the
//! `meta.json` / `-props-meta.json` sidecars (kernel page cache was never
//! flushed) still recovers the committed labels and properties on reopen.
//!
//! Before the fix, the deferred-sync commit path wrote the sidecars without
//! fsync and the WAL record only carried `node_id` — so recovery would
//! restore the node's existence but lose its labels/properties on a hard
//! power loss that took the sidecars with it.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-wal-v2-sidecar-loss-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

fn meta_sidecar(db_path: &std::path::Path) -> PathBuf {
    let mut p = db_path.as_os_str().to_os_string();
    p.push("-meta.json");
    PathBuf::from(p)
}

fn props_meta_sidecar(db_path: &std::path::Path) -> PathBuf {
    let mut p = db_path.as_os_str().to_os_string();
    p.push("-props-meta.json");
    PathBuf::from(p)
}

fn props_store_file(db_path: &std::path::Path) -> PathBuf {
    let mut p = db_path.as_os_str().to_os_string();
    p.push("-props.ogdb");
    PathBuf::from(p)
}

#[test]
fn hard_power_loss_destroys_sidecars_but_wal_v2_recovers_labels_and_props() {
    let dir = test_dir("hard-power-loss");
    let db_path = dir.join("graph.ogdb");

    // Phase 1: open fresh DB, commit nodes with labels + properties.
    {
        let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
        let mut tx = db.begin_write();
        for i in 0..5u64 {
            let mut props = PropertyMap::new();
            props.insert("seq".to_string(), PropertyValue::I64(i as i64));
            props.insert(
                "name".to_string(),
                PropertyValue::String(format!("node-{i}")),
            );
            let _ = tx
                .create_node_with(vec!["Foo".to_string(), "Bar".to_string()], props)
                .expect("create node with labels + props");
        }
        let _summary = tx.commit().expect("commit tx");
        // `db` drops here — file handles close. Sidecars wrote to kernel page
        // cache but not fsynced. The WAL was fsynced (single durability
        // barrier) and now carries v2 CREATE_NODE records with labels+props.
    }

    // Phase 2: simulate hard power loss by TRUNCATING the sidecars. This
    // models "kernel page cache was lost before writeback" — the on-disk
    // meta.json and -props-meta.json are now empty / damaged.
    // Audit finding 2.1 models "kernel page cache was lost before writeback
    // for the sidecars". The node_property_store DATA file (`-props.ogdb`)
    // does call `write_page_to_disk` → `sync_data` per page under deferred
    // sync, so its pages *may* survive a hard power loss; the vulnerable
    // files are `meta.json` (labels + catalogs) and `-props-meta.json`
    // (property-store row-page map). Truncate only those two.
    let meta = meta_sidecar(&db_path);
    let props_meta = props_meta_sidecar(&db_path);
    let _props_store = props_store_file(&db_path);
    if meta.exists() {
        fs::write(&meta, b"").expect("truncate meta.json");
    }
    if props_meta.exists() {
        fs::write(&props_meta, b"").expect("truncate props-meta.json");
    }

    // Phase 3: reopen. WAL replay must restore existence (WAL v1 + v2) AND
    // labels + properties (WAL v2 only). Before the fix, node_count would
    // still be 5 (WAL v1 carried node_id) but labels would be empty and
    // properties would be empty.
    let db = Database::open(&db_path).expect("reopen must succeed after sidecar loss");
    assert_eq!(
        db.node_count(),
        5,
        "WAL-authoritative node_count survives sidecar truncation"
    );

    for i in 0..5u64 {
        let labels: BTreeSet<String> = db
            .node_labels(i)
            .expect("node_labels after recovery")
            .into_iter()
            .collect();
        let expected_labels: BTreeSet<String> =
            ["Bar".to_string(), "Foo".to_string()].into_iter().collect();
        assert_eq!(
            labels, expected_labels,
            "WAL v2 recovery must restore labels for node {i}; got {labels:?}. \
             This is the core audit finding 2.1 fix — a hard power loss that \
             destroys the meta.json sidecar must not lose the committed labels."
        );

        let props = db
            .node_properties(i)
            .expect("node_properties after recovery");
        assert_eq!(
            props.get("seq"),
            Some(&PropertyValue::I64(i as i64)),
            "WAL v2 recovery must restore 'seq' property for node {i}"
        );
        assert_eq!(
            props.get("name"),
            Some(&PropertyValue::String(format!("node-{i}"))),
            "WAL v2 recovery must restore 'name' property for node {i}"
        );
    }
}
