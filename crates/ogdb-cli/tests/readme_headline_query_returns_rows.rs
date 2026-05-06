//! Phase A C-2 regression gate: the README's flagship Cypher query against the
//! seeded demo db must return at least one row.
//!
//! Pre-fix: README claimed `MATCH (p:Person)-[:ACTED_IN]->(m:Movie) ...` but
//! `datasets/movielens.json` only carries Movie + Genre nodes with IN_GENRE
//! edges — no Person, no ACTED_IN. The headline returned zero rows.
//!
//! This test extracts whatever Cypher is wrapped in the FIRST
//! ```bash
//! ogdb query ~/.ogdb/demo.ogdb \
//!   "..."
//! ```
//! block of README.md, imports the canonical movielens fixture into a tempdir
//! db (same fixture `ogdb demo` seeds), runs the extracted query through the
//! `ogdb` binary, and asserts row_count > 0. Catches re-introduction of any
//! headline query that drifts from the fixture's actual schema.
//!
//! See `.claude/release-tests.yaml` entry `readme-headline-query-returns-rows`.

use std::path::PathBuf;
use std::process::Command;

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// Pulls the first `ogdb query ~/.ogdb/demo.ogdb \ "..."` block out of README.md.
/// Returns the inner Cypher with surrounding quotes stripped.
fn extract_readme_headline_query(readme: &str) -> String {
    let needle = "ogdb query ~/.ogdb/demo.ogdb";
    let start = readme
        .find(needle)
        .expect("README.md must contain `ogdb query ~/.ogdb/demo.ogdb` headline");
    let after = &readme[start + needle.len()..];
    // Skip the line continuation backslash and any whitespace / newlines.
    let q_start = after
        .find('"')
        .expect("README headline `ogdb query` must wrap its Cypher in double quotes");
    let after_q = &after[q_start + 1..];
    let q_end = after_q
        .find('"')
        .expect("README headline `ogdb query` must close its double-quoted Cypher");
    after_q[..q_end].to_string()
}

#[test]
fn readme_headline_query_returns_at_least_one_row() {
    let root = workspace_root();
    let readme_path = root.join("README.md");
    let readme = std::fs::read_to_string(&readme_path)
        .unwrap_or_else(|e| panic!("read {}: {e}", readme_path.display()));
    let query = extract_readme_headline_query(&readme);
    assert!(
        query.to_uppercase().contains("MATCH"),
        "extracted README headline query must be a Cypher MATCH; got {query:?}"
    );

    let dir = tempfile::tempdir().expect("tempdir");
    let db_path: PathBuf = dir.path().join("demo.ogdb");

    // Init the db (matches install.sh's bootstrap_demo).
    let init = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(["init", &db_path.display().to_string()])
        .output()
        .expect("spawn ogdb init");
    assert!(
        init.status.success(),
        "ogdb init failed: status={:?} stderr={}",
        init.status,
        String::from_utf8_lossy(&init.stderr)
    );

    // Seed the same fixture `ogdb demo` ships (datasets/movielens.json).
    let fixture = root.join("datasets").join("movielens.json");
    let import = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args([
            "import",
            &db_path.display().to_string(),
            &fixture.display().to_string(),
        ])
        .output()
        .expect("spawn ogdb import");
    assert!(
        import.status.success(),
        "ogdb import {} failed: status={:?} stderr={}",
        fixture.display(),
        import.status,
        String::from_utf8_lossy(&import.stderr)
    );

    // Run the headline query the README publishes verbatim.
    let q = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(["query", &db_path.display().to_string(), &query])
        .output()
        .expect("spawn ogdb query");
    assert!(
        q.status.success(),
        "ogdb query exited non-zero: status={:?} stderr={}",
        q.status,
        String::from_utf8_lossy(&q.stderr)
    );

    let stdout = String::from_utf8_lossy(&q.stdout);
    let row_count_line = stdout
        .lines()
        .find(|l| l.starts_with("row_count="))
        .unwrap_or_else(|| panic!("ogdb query stdout missing row_count= line; got:\n{stdout}"));
    let n: u64 = row_count_line
        .trim_start_matches("row_count=")
        .parse()
        .unwrap_or_else(|e| panic!("parse `{row_count_line}`: {e}"));
    assert!(
        n >= 1,
        "README headline query against seeded demo db returned 0 rows — \
         the README claim is unfulfillable. Query: {query:?}\nFull stdout:\n{stdout}"
    );
}
