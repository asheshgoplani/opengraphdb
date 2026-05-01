//! EVAL-PERF-RELEASE Finding 12 (HIGH): there was no upgrade test
//! verifying that the current binary can open a database written by a
//! previous binary. The five `*_FORMAT_VERSION` constants in
//! `crates/ogdb-core/src/lib.rs:155–159` could be silently bumped without
//! any test catching the resulting file-format break.
//!
//! This test ships a **checked-in v0.4.0 fixture database** (see
//! `tests/fixtures/v0_4_0_baseline/`) and asserts the current binary opens
//! it and reads back the expected schema/contents. Once v0.5 lands, this
//! test will fail if any format-version constant bumps without an
//! accompanying migration — exactly the gate the eval asked for.
//!
//! The fixture was generated against ogdb-core 0.4.0 by the helper
//! `regenerate_v0_4_0_fixture` test (run with
//! `OGDB_REGENERATE_V040_FIXTURE=1 cargo test -p ogdb-core --test
//! upgrade_fixture_v0_4_0_opens_on_current regenerate -- --ignored
//! --nocapture`). The fixture contents are deterministic.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue};

/// Schema asserted by both regenerate + open tests. Both must agree.
const FIXTURE_NODE_COUNT: u64 = 5;
const FIXTURE_DOC_LABEL: &str = "Doc";
const FIXTURE_NAME_PROP: &str = "name";
const FIXTURE_NAMES: [&str; 5] = ["alpha", "bravo", "charlie", "delta", "echo"];

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/v0_4_0_baseline")
}

fn fixture_db_path() -> PathBuf {
    fixture_dir().join("graph.ogdb")
}

fn temp_copy_of_fixture() -> PathBuf {
    let src = fixture_dir();
    assert!(
        src.exists(),
        "v0.4.0 fixture not checked in — expected {}. \
         Run `OGDB_REGENERATE_V040_FIXTURE=1 cargo test -p ogdb-core \
         --test upgrade_fixture_v0_4_0_opens_on_current regenerate -- \
         --ignored --nocapture` first.",
        src.display()
    );

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dst = env::temp_dir().join(format!(
        "ogdb-upgrade-fixture-{}-{}",
        std::process::id(),
        now
    ));
    fs::create_dir_all(&dst).expect("create temp dir");

    // Copy every file in the fixture dir (database file + sidecars).
    for entry in fs::read_dir(&src).expect("read fixture dir") {
        let entry = entry.expect("fixture dir entry");
        let p = entry.path();
        if p.is_file() {
            fs::copy(&p, dst.join(entry.file_name())).expect("copy fixture file");
        }
    }
    dst.join("graph.ogdb")
}

#[test]
fn current_binary_opens_v0_4_0_baseline_fixture() {
    let db_path = temp_copy_of_fixture();

    let db = Database::open(&db_path).expect(
        "current binary must open the v0.4.0 baseline fixture — \
         a format-version bump without a migration broke this gate \
         (eval Finding 12)",
    );

    assert_eq!(
        db.node_count(),
        FIXTURE_NODE_COUNT,
        "fixture node count drift: file format change?"
    );

    // Read each node back; confirm label + property survived.
    for (node_id, expected_name) in FIXTURE_NAMES.iter().enumerate() {
        let id = node_id as u64;
        let labels: BTreeSet<String> = db
            .node_labels(id)
            .unwrap_or_default()
            .into_iter()
            .collect();
        assert!(
            labels.contains(FIXTURE_DOC_LABEL),
            "fixture node {} missing label '{}': labels={:?}",
            id,
            FIXTURE_DOC_LABEL,
            labels
        );
        let props = db.node_properties(id).expect("read props");
        match props.get(FIXTURE_NAME_PROP) {
            Some(PropertyValue::String(name)) => {
                assert_eq!(name, expected_name, "fixture node {} name mismatch", id);
            }
            other => panic!(
                "fixture node {} property '{}' = {:?}, expected String({:?})",
                id, FIXTURE_NAME_PROP, other, expected_name
            ),
        }
    }
}

/// Helper that regenerates the checked-in fixture against the current
/// binary. Ignored by default — run only when intentionally rebaselining
/// (e.g., on the first time this test is added). Set
/// `OGDB_REGENERATE_V040_FIXTURE=1` to allow.
#[test]
#[ignore]
fn regenerate_v0_4_0_fixture() {
    if env::var("OGDB_REGENERATE_V040_FIXTURE").ok().as_deref() != Some("1") {
        eprintln!(
            "skipping regenerate_v0_4_0_fixture: set \
             OGDB_REGENERATE_V040_FIXTURE=1 to rebaseline"
        );
        return;
    }

    let dir = fixture_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).expect("clear old fixture dir");
    }
    fs::create_dir_all(&dir).expect("create fixture dir");
    let db_path = fixture_db_path();

    let mut db = Database::init(&db_path, Header::default_v1()).expect("init fixture db");
    let mut tx = db.begin_write();
    for name in FIXTURE_NAMES.iter() {
        tx.create_node_with(
            vec![FIXTURE_DOC_LABEL.to_string()],
            PropertyMap::from([(
                FIXTURE_NAME_PROP.to_string(),
                PropertyValue::String((*name).to_string()),
            )]),
        )
        .expect("create fixture node");
    }
    tx.commit().expect("commit fixture txn");
    drop(db);

    eprintln!("regenerated v0.4.0 fixture at {}", dir.display());
}
