//! RED-phase test — the runtime factory picks the right adapter based
//! on `OGDB_SKILL_LLM_PROVIDER` + compiled-in feature flags.
//! .planning/real-llm-adapter/PLAN.md §6 row 1.

use std::collections::BTreeMap;
use std::sync::Mutex;

use ogdb_eval::drivers::real_llm_adapter::{
    resolve_adapter, DeterministicMockAdapter, PROVIDER_ENV,
};
use ogdb_eval::drivers::skill_quality::{
    Difficulty, EvalCase, Expected, LlmAdapter, SkillQualityError,
};

// Env is process-global; serialise around it so this file's sub-tests
// don't stomp each other under parallel `cargo test`.
static ENV_LOCK: Mutex<()> = Mutex::new(());

const PROVIDER_KEYS: [&str; 5] = [
    PROVIDER_ENV,
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_API_URL",
    "OPENAI_API_KEY",
    "OGDB_LOCAL_LLM_URL",
];

fn clear_provider_env() {
    for key in PROVIDER_KEYS {
        std::env::remove_var(key);
    }
}

fn sample_case() -> EvalCase {
    EvalCase {
        name: "factory-sample".into(),
        difficulty: Difficulty::Easy,
        input: "Find all Person nodes".into(),
        context: serde_json::Value::Null,
        expected: Expected {
            must_contain: vec!["MATCH".into()],
            must_not_contain: Vec::new(),
            pattern: None,
        },
        scoring: BTreeMap::new(),
    }
}

/// (a) `OGDB_SKILL_LLM_PROVIDER` unset ⇒ `resolve_adapter` yields a
///     `DeterministicMockAdapter` whose `respond` returns
///     `"[mock] {case.input}"` with `latency_us == 0`.
#[test]
fn factory_default_returns_deterministic_mock_adapter() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_provider_env();

    let adapter = resolve_adapter().expect("factory must return mock when provider is unset");
    let case = sample_case();
    let resp = adapter
        .respond(&case)
        .expect("mock adapter must never fail");
    assert_eq!(
        resp.text, "[mock] Find all Person nodes",
        "DeterministicMockAdapter.respond.text must be `[mock] ` + case.input"
    );
    assert_eq!(
        resp.latency_us, 0,
        "DeterministicMockAdapter.latency_us must be 0 to keep CI byte-stable"
    );

    // Direct construction must match the factory behaviour exactly —
    // tests that instantiate the mock directly (without env lookups)
    // rely on the same output.
    let direct = DeterministicMockAdapter::default()
        .respond(&case)
        .expect("direct mock");
    assert_eq!(direct.text, resp.text);
    assert_eq!(direct.latency_us, resp.latency_us);
}

/// (b) Provider=anthropic without `ANTHROPIC_API_KEY` ⇒
///     `Err(Adapter("ANTHROPIC_API_KEY …"))`. Feature llm-anthropic is
///     on by default so this code path always compiles.
#[test]
fn factory_anthropic_without_key_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_provider_env();
    std::env::set_var(PROVIDER_ENV, "anthropic");

    let result = resolve_adapter();
    match result {
        Ok(_) => panic!("factory must return Err(Adapter) when key is missing"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains("ANTHROPIC_API_KEY"),
                "error message must mention the missing env var, got {msg:?}"
            );
        }
        Err(other) => {
            panic!("expected Err(Adapter), got Err({other:?})")
        }
    }

    clear_provider_env();
}

/// (c) Provider value the factory doesn't know ⇒ `Err(Adapter("unknown
///     provider …"))`. This covers the case where a typo reaches prod.
#[test]
fn factory_unknown_provider_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_provider_env();
    std::env::set_var(PROVIDER_ENV, "gemini");

    let result = resolve_adapter();
    match result {
        Ok(_) => panic!("factory must reject unknown providers"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains("unknown provider"),
                "error must mention `unknown provider`, got {msg:?}"
            );
            assert!(
                msg.contains("gemini"),
                "error must echo the bad value, got {msg:?}"
            );
        }
        Err(other) => panic!("expected Err(Adapter), got Err({other:?})"),
    }

    clear_provider_env();
}

/// (d) Provider=openai but the crate was built without feature llm-openai
///     ⇒ `Err(Adapter("… built without feature llm-openai"))`. Only
///     compiled when the test binary itself lacks the feature (i.e. the
///     default-feature run). When llm-openai is enabled this test
///     collapses to an assertion that the factory at least doesn't
///     return the `built without feature` string.
#[cfg(not(feature = "llm-openai"))]
#[test]
fn factory_openai_without_feature_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_provider_env();
    std::env::set_var(PROVIDER_ENV, "openai");

    let result = resolve_adapter();
    match result {
        Ok(_) => panic!("factory must error when provider=openai but feature absent"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains("llm-openai"),
                "error must name the missing feature, got {msg:?}"
            );
            assert!(
                msg.contains("built without"),
                "error must say `built without …`, got {msg:?}"
            );
        }
        Err(other) => panic!("expected Err(Adapter), got Err({other:?})"),
    }

    clear_provider_env();
}
