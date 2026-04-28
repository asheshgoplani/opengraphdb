use ogdb_cli::run;
use std::env;
use std::path::PathBuf;
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("resolve repository root")
}

fn temp_db_path(tag: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-{tag}-{}-{ts}.ogdb", process::id()));
    path
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-meta.json", path.display()));
}

#[test]
fn movielens_dataset_imports_with_startnode_endnode_shape() {
    let dataset = repo_root().join("datasets").join("movielens.json");
    assert!(
        dataset.exists(),
        "datasets/movielens.json missing — regression test requires the canonical fixture"
    );

    let db = temp_db_path("movielens-import");
    cleanup(&db);

    let init = run(&["init".to_string(), db.display().to_string()]);
    assert_eq!(init.exit_code, 0, "init failed: {}", init.stderr);

    let out = run(&[
        "import".to_string(),
        db.display().to_string(),
        dataset.display().to_string(),
        "--format".to_string(),
        "json".to_string(),
    ]);
    assert_eq!(
        out.exit_code, 0,
        "import failed: stdout={} stderr={}",
        out.stdout, out.stderr
    );
    assert!(
        out.stdout.contains("imported_nodes=8019"),
        "expected imported_nodes=8019, got: {}",
        out.stdout
    );
    assert!(
        out.stdout.contains("imported_edges=18525"),
        "expected imported_edges=18525, got: {}",
        out.stdout
    );

    cleanup(&db);
}
