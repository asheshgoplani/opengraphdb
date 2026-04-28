//! AI-agent driver tests (spec Dimension 6 / Part B).
//!
//! All four sub-drivers run in under 2s each so the suite fits the <60s
//! overall budget easily. Hybrid-retrieval + re-ranking rely on ogdb-core's
//! vector index (B.3 / B.6 in the spec).

use ogdb_eval::drivers::ai_agent;
use tempfile::TempDir;

#[test]
fn enrichment_roundtrip_reports_t_persist_percentiles() {
    let dir = TempDir::new().unwrap();
    let run = ai_agent::enrichment_roundtrip(dir.path(), 20, 10, 15).expect("enrichment_roundtrip");
    assert_eq!(run.suite, "ai_agent");
    assert_eq!(run.subsuite, "enrichment_roundtrip");
    for key in ["t_persist_p50_us", "t_persist_p95_us", "t_persist_p99_us"] {
        assert!(run.metrics.contains_key(key), "missing {key}");
    }
    assert!(run.metrics.get("docs_per_sec").unwrap().value > 0.0);
}

#[test]
fn hybrid_retrieval_reports_p95_and_queries() {
    let dir = TempDir::new().unwrap();
    let run = ai_agent::hybrid_retrieval(dir.path(), 200, 20).expect("hybrid_retrieval");
    assert_eq!(run.subsuite, "hybrid_retrieval");
    assert!(run.metrics.contains_key("p50_us"));
    assert!(run.metrics.contains_key("p95_us"));
    assert_eq!(
        run.metrics.get("queries").unwrap().value as u32,
        20,
        "queries count should match input"
    );
}

#[test]
fn concurrent_writes_reports_commits_per_sec_and_threads() {
    let dir = TempDir::new().unwrap();
    let run = ai_agent::concurrent_writes(dir.path(), 2, 100).expect("concurrent_writes");
    assert_eq!(run.subsuite, "concurrent_writes");
    assert_eq!(run.metrics.get("threads").unwrap().value as u32, 2);
    let cps = run.metrics.get("commits_per_sec").unwrap().value;
    assert!(cps > 0.0, "commits/s must be positive, got {cps}");
    assert!(run.metrics.contains_key("conflict_rate"));
}

#[test]
fn re_ranking_reports_candidates_and_p95() {
    let dir = TempDir::new().unwrap();
    let run = ai_agent::re_ranking(dir.path(), 200, 100).expect("re_ranking");
    assert_eq!(run.subsuite, "re_ranking");
    assert_eq!(run.metrics.get("candidates").unwrap().value as u32, 100);
    assert!(run.metrics.contains_key("p95_us"));
}
