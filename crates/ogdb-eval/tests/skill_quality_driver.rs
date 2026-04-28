//! RED-phase integration test for the top-level `skill_quality::run` entry.
//! PLAN.md §6 row 9. Exercises the full loader → adapter → scorer →
//! aggregator → EvaluationRun pipeline with a deterministic MockAdapter,
//! then round-trips the resulting run through `EvaluationRun::to_json` →
//! `from_json` to prove the shape matches the evaluator schema.

use std::fs;

use ogdb_eval::drivers::skill_quality::{run, AdapterResponse, EvalCase, MockAdapter};
use ogdb_eval::{EvaluationRun, SCHEMA_VERSION};
use tempfile::TempDir;

const MINI_SPEC: &str = r#"{
  "skill": "ogdb-cypher",
  "version": "0.1.0",
  "description": "mini integration fixture",
  "cases": [
    {
      "name": "basic-node-query",
      "difficulty": "easy",
      "input": "Find all Person nodes",
      "context": {},
      "expected": {
        "must_contain": ["MATCH", "Person"],
        "must_not_contain": ["Movie"],
        "pattern": "MATCH"
      },
      "scoring": { "correct_syntax": 1 }
    }
  ]
}"#;

#[test]
fn integration_with_evaluation_run_schema() {
    let tmp = TempDir::new().expect("tempdir");
    let spec_path = tmp.path().join("ogdb-cypher.eval.yaml");
    fs::write(&spec_path, MINI_SPEC).expect("write spec fixture");

    let adapter = MockAdapter(|_case: &EvalCase| AdapterResponse {
        text: "MATCH (p:Person) RETURN p".to_string(),
        latency_us: 900,
    });

    let run_result: EvaluationRun = run(tmp.path(), &adapter).expect("run skill_quality");

    // Shape must match the evaluator-harness schema so the existing
    // JsonlHistory + DiffEngine pipeline consumes it unmodified.
    assert_eq!(run_result.schema_version, SCHEMA_VERSION);
    assert_eq!(run_result.suite, "skill_quality");
    assert!(
        !run_result.dataset.is_empty(),
        "dataset label required — encodes which skill-eval version shipped"
    );

    // The run MUST carry the Dimension-4 headline metric.
    let pass_rate = run_result
        .metrics
        .get("pass_rate")
        .expect("pass_rate metric must be present");
    assert!(pass_rate.higher_is_better);

    // Round-trip through the schema's own serde pair — if this survives,
    // `publish_baseline.rs` can append the run to baseline JSON with no
    // further glue.
    let serialised = run_result.to_json().expect("serialise");
    let round_tripped = EvaluationRun::from_json(&serialised).expect("deserialise");
    assert_eq!(
        round_tripped, run_result,
        "EvaluationRun round-trip must be lossless"
    );
}
