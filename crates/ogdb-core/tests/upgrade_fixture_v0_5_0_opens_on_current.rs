//! EVAL-DOCS-COMPLETENESS-CYCLE15 Finding 10 (HIGH): `documentation/COMPATIBILITY.md`
//! L44 promised "Future releases add a v0.5.0 fixture beside it" — but when v0.5.0
//! shipped (`git tag` confirms), the matching upgrade-test gate was never added.
//! This test fulfills that promise.
//!
//! It mirrors `upgrade_fixture_v0_4_0_opens_on_current.rs` against a v0.5.0 fixture
//! (`tests/fixtures/v0_5_0/`) and asserts the current binary opens it without a
//! migration error and reads back the expected schema/contents.
//!
//! **No-op upgrade note.** The five `*_FORMAT_VERSION` constants in
//! `crates/ogdb-core/src/lib.rs` are still `1` across the v0.4.0 → v0.5.0 → v0.5.1
//! window — no on-disk format change occurred. The v0.5.0 fixture files are
//! therefore byte-identical to the v0.4.0 baseline. This test is intentional
//! redundancy: it locks in the policy that v0.5.* readers can open files written
//! by v0.5.0, independent of whatever the v0.4.0 baseline test asserts. If a
//! future format-version bump lands in v0.5.x or v0.6.0, regenerate this fixture
//! against a real v0.5.0 binary (see `regenerate_v0_5_0_fixture` below) so the
//! gate becomes a true cross-version test.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue};

/// Schema asserted by both regenerate + open tests. Matches the v0.4.0 baseline
/// because v0.5.0 introduced no schema or format changes.
const FIXTURE_NODE_COUNT: u64 = 5;
const FIXTURE_DOC_LABEL: &str = "Doc";
const FIXTURE_NAME_PROP: &str = "name";
const FIXTURE_NAMES: [&str; 5] = ["alpha", "bravo", "charlie", "delta", "echo"];

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/v0_5_0")
}

fn fixture_db_path() -> PathBuf {
    fixture_dir().join("graph.ogdb")
}

fn temp_copy_of_fixture() -> PathBuf {
    let src = fixture_dir();
    assert!(
        src.exists(),
        "v0.5.0 fixture not checked in — expected {}. \
         Run `OGDB_REGENERATE_V050_FIXTURE=1 cargo test -p ogdb-core \
         --test upgrade_fixture_v0_5_0_opens_on_current regenerate -- \
         --ignored --nocapture` first.",
        src.display()
    );

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dst = env::temp_dir().join(format!(
        "ogdb-upgrade-fixture-v050-{}-{}",
        std::process::id(),
        now
    ));
    fs::create_dir_all(&dst).expect("create temp dir");

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
fn current_binary_opens_v0_5_0_fixture() {
    let db_path = temp_copy_of_fixture();

    let db = Database::open(&db_path).expect(
        "current binary must open the v0.5.0 fixture without migration error — \
         a format-version bump without a migration broke this gate \
         (EVAL-DOCS-COMPLETENESS-CYCLE15 F10)",
    );

    assert_eq!(
        db.node_count(),
        FIXTURE_NODE_COUNT,
        "fixture node count drift: file format change?"
    );

    for (node_id, expected_name) in FIXTURE_NAMES.iter().enumerate() {
        let id = node_id as u64;
        let labels: BTreeSet<String> = db.node_labels(id).unwrap_or_default().into_iter().collect();
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
/// (e.g., after a format-version bump). Set `OGDB_REGENERATE_V050_FIXTURE=1`
/// to allow.
#[test]
#[ignore]
fn regenerate_v0_5_0_fixture() {
    if env::var("OGDB_REGENERATE_V050_FIXTURE").ok().as_deref() != Some("1") {
        eprintln!(
            "skipping regenerate_v0_5_0_fixture: set \
             OGDB_REGENERATE_V050_FIXTURE=1 to rebaseline"
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

    eprintln!("regenerated v0.5.0 fixture at {}", dir.display());
}
