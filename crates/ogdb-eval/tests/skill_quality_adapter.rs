//! RED-phase tests for the `LlmAdapter` trait + `MockAdapter`.
//! PLAN.md §6 row 8.

use std::collections::BTreeMap;

use ogdb_eval::drivers::skill_quality::{
    AdapterResponse, Difficulty, EvalCase, Expected, LlmAdapter, MockAdapter, SkillQualityError,
    StubRealAdapter,
};

fn sample_case() -> EvalCase {
    EvalCase {
        name: "deterministic-sample".to_string(),
        difficulty: Difficulty::Easy,
        input: "Find all Person nodes".to_string(),
        context: serde_json::Value::Null,
        expected: Expected {
            must_contain: vec!["MATCH".to_string()],
            must_not_contain: Vec::new(),
            pattern: None,
        },
        scoring: BTreeMap::new(),
    }
}

#[test]
fn mock_adapter_is_deterministic() {
    // Same adapter, same case, called twice — byte-identical response and
    // identical latency. This is the invariant that keeps CI stable.
    let adapter = MockAdapter(|case: &EvalCase| AdapterResponse {
        text: format!("MATCH response for {}", case.name),
        latency_us: 1_234,
    });
    let case = sample_case();

    let first = adapter.respond(&case).expect("first call");
    let second = adapter.respond(&case).expect("second call");

    assert_eq!(first, second, "MockAdapter must be deterministic");
    assert_eq!(first.text, "MATCH response for deterministic-sample");
    assert_eq!(first.latency_us, 1_234);
}

#[test]
fn stub_real_adapter_surfaces_unimplemented_error() {
    // The placeholder adapter for the real LLM must never silently
    // succeed — it returns `SkillQualityError::Unimplemented`. Phase 5
    // replaces this with real inference.
    let case = sample_case();
    match StubRealAdapter.respond(&case) {
        Err(SkillQualityError::Unimplemented(_)) => {}
        other => panic!("StubRealAdapter must return Unimplemented, got {other:?}"),
    }
}
