//! Tests for the `LlmAdapter` trait + `MockAdapter`.
//! Retargeted in Phase 5 when `StubRealAdapter` was replaced by the real
//! adapter factory (`drivers::real_llm_adapter::resolve_adapter`).
//! PLAN.md §6 row 8 (skill-quality-dimension) + Phase-3 TODO in
//! `.planning/real-llm-adapter/PLAN.md` §7.

use std::collections::BTreeMap;
use std::sync::Mutex;

use ogdb_eval::drivers::real_llm_adapter::{resolve_adapter, PROVIDER_ENV};
use ogdb_eval::drivers::skill_quality::{
    AdapterResponse, Difficulty, EvalCase, Expected, LlmAdapter, MockAdapter, SkillQualityError,
};

static ENV_LOCK: Mutex<()> = Mutex::new(());

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
    // Retargeted in Phase 5: `StubRealAdapter` was removed when real
    // adapter implementations landed. The invariant is unchanged — asking
    // the factory for a real provider without the required env var
    // produces `Err(Adapter(_))`, never silent success.
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    for key in [PROVIDER_ENV, "ANTHROPIC_API_KEY"] {
        std::env::remove_var(key);
    }
    std::env::set_var(PROVIDER_ENV, "anthropic");

    let result = resolve_adapter();
    std::env::remove_var(PROVIDER_ENV);

    match result {
        Err(SkillQualityError::Adapter(_)) => {}
        Err(other) => panic!("expected Err(Adapter), got Err({other:?})"),
        Ok(_) => panic!("expected Err(Adapter), got Ok(_)"),
    }
}
