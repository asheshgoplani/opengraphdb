use std::collections::BTreeMap;
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
        "ogdb-temporal-versioning-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

fn props_with_value(value: i64) -> PropertyMap {
    let mut props = PropertyMap::new();
    props.insert("value".to_string(), PropertyValue::I64(value));
    props
}

fn extract_value(properties: Option<&PropertyMap>) -> Option<i64> {
    properties.and_then(|props| match props.get("value") {
        Some(PropertyValue::I64(value)) => Some(*value),
        _ => None,
    })
}

#[test]
fn temporal_compaction_preserves_at_time_queries() {
    let dir = test_dir("compaction-preserves");
    let db_path = dir.join("graph.ogdb");

    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
    let node_id = db.create_node().expect("create node");

    for i in 0..1000i64 {
        db.add_node_temporal_version(node_id, i * 1_000, props_with_value(i))
            .expect("append temporal version");
    }

    assert_eq!(db.node_temporal_version_count(node_id), 1000);

    let sample_timestamps: Vec<i64> = vec![
        500_100, 500_499, 500_500, 500_999, 501_000, 650_123, 800_000, 999_999, 1_500_000,
    ];
    let expected: BTreeMap<i64, Option<PropertyMap>> = sample_timestamps
        .iter()
        .map(|&timestamp| {
            (
                timestamp,
                db.node_properties_at_time(node_id, timestamp).cloned(),
            )
        })
        .collect();

    let floor = 500_500;
    let removed = db
        .compact_temporal_versions(floor)
        .expect("compact temporal versions");
    assert!(removed > 0);
    assert!(db.node_temporal_version_count(node_id) < 1000);

    for &timestamp in &sample_timestamps {
        if timestamp >= floor {
            assert_eq!(
                db.node_properties_at_time(node_id, timestamp).cloned(),
                expected.get(&timestamp).cloned().unwrap_or(None),
                "timestamp {timestamp} changed after compaction"
            );
        }
    }

    let boundary_below_floor = 500_100;
    assert_eq!(
        db.node_properties_at_time(node_id, boundary_below_floor)
            .cloned(),
        expected.get(&boundary_below_floor).cloned().unwrap_or(None),
        "retained boundary version should still answer below-floor timestamp"
    );

    drop(db);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn temporal_versions_persist_across_reopen() {
    let dir = test_dir("persist-reopen");
    let db_path = dir.join("graph.ogdb");

    {
        let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
        let node_id = db.create_node().expect("create node");

        for i in 0..5i64 {
            db.add_node_temporal_version(node_id, 1_000 + i * 1_000, props_with_value(i))
                .expect("append temporal version");
        }

        assert_eq!(db.node_temporal_version_count(node_id), 5);
        db.checkpoint().expect("checkpoint");
    }

    let reopened = Database::open(&db_path).expect("reopen db");
    assert_eq!(reopened.node_temporal_version_count(0), 5);
    assert_eq!(
        extract_value(reopened.node_properties_at_time(0, 1_500)),
        Some(0)
    );
    assert_eq!(
        extract_value(reopened.node_properties_at_time(0, 2_500)),
        Some(1)
    );
    assert_eq!(
        extract_value(reopened.node_properties_at_time(0, 5_500)),
        Some(4)
    );

    drop(reopened);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn temporal_compaction_removes_nothing_when_floor_below_all_versions() {
    let dir = test_dir("floor-below-all");
    let db_path = dir.join("graph.ogdb");

    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
    let node_id = db.create_node().expect("create node");

    for i in 0..5i64 {
        db.add_node_temporal_version(node_id, 1_000 + i * 1_000, props_with_value(i))
            .expect("append temporal version");
    }

    let before_count = db.node_temporal_version_count(node_id);
    let sample_timestamps: Vec<i64> = vec![1_000, 1_500, 2_500, 6_000];
    let expected: BTreeMap<i64, Option<PropertyMap>> = sample_timestamps
        .iter()
        .map(|&timestamp| {
            (
                timestamp,
                db.node_properties_at_time(node_id, timestamp).cloned(),
            )
        })
        .collect();

    let removed = db
        .compact_temporal_versions(0)
        .expect("compact temporal versions");

    assert_eq!(removed, 0);
    assert_eq!(db.node_temporal_version_count(node_id), before_count);

    for timestamp in sample_timestamps {
        assert_eq!(
            db.node_properties_at_time(node_id, timestamp).cloned(),
            expected.get(&timestamp).cloned().unwrap_or(None)
        );
    }

    drop(db);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn temporal_version_chain_empty_for_new_node() {
    let dir = test_dir("empty-chain");
    let db_path = dir.join("graph.ogdb");

    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
    let node_id = db.create_node().expect("create node");

    assert_eq!(db.node_temporal_version_count(node_id), 0);
    assert!(db.node_properties_at_time(node_id, 0).is_none());

    drop(db);
    let _ = fs::remove_dir_all(&dir);
}
