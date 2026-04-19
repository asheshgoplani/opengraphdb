use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("resolve repository root")
}

fn read_dataset(path: &Path) -> Value {
    let content = fs::read_to_string(path)
        .unwrap_or_else(|err| panic!("read dataset {} failed: {err}", path.display()));
    serde_json::from_str(&content)
        .unwrap_or_else(|err| panic!("parse dataset {} failed: {err}", path.display()))
}

fn nodes(dataset: &Value) -> &[Value] {
    dataset
        .get("nodes")
        .and_then(Value::as_array)
        .expect("dataset.nodes must be an array")
}

fn edges(dataset: &Value) -> &[Value] {
    dataset
        .get("edges")
        .and_then(Value::as_array)
        .expect("dataset.edges must be an array")
}

#[test]
fn datasets_fixture_canonical_names_smoke_test() {
    // Regression guard for fixture drift. Phase 07 replaced the phase-06 synthetic
    // datasets (movies.json/social.json/fraud.json) with the real-world quartet
    // (movielens/airroutes/got/wikidata). This test locks the contract that
    // scripts/seed-demo.sh already enforces, independent of dataset schema.
    let datasets_dir = repo_root().join("datasets");
    let canonical = ["movielens.json", "airroutes.json", "got.json", "wikidata.json"];
    let stale = ["movies.json", "social.json", "fraud.json"];

    for name in canonical {
        let path = datasets_dir.join(name);
        assert!(
            path.exists(),
            "canonical dataset missing: datasets/{name} — has scripts/seed-demo.sh been regenerated?"
        );
        let dataset = read_dataset(&path);
        assert!(
            !nodes(&dataset).is_empty(),
            "datasets/{name} must contain at least one node"
        );
        assert!(
            !edges(&dataset).is_empty(),
            "datasets/{name} must contain at least one edge"
        );
    }

    for name in stale {
        let path = datasets_dir.join(name);
        assert!(
            !path.exists(),
            "stale phase-06 fixture re-introduced: datasets/{name} — canonical names are {:?}",
            canonical
        );
    }
}
