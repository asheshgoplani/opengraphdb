//! Unit tests for `real_llm_adapter::mod` internals that the existing
//! factory test file doesn't exercise:
//!   · `RetryPolicy::from_env` (env-driven + fallback)
//!   · `RetryPolicy::defaults`
//!   · `DeterministicMockAdapter::default()`
//!   · `provider_from_env` for every `Provider` variant
//!   · Factory dispatch when `llm-openai` / `llm-local` features ARE
//!     compiled in (missing-key / missing-url error branches +
//!     happy-path branches that build a real adapter struct against a
//!     wiremock URL).
//!
//! Every test runs in-process — no network, no real API keys. Tests
//! that mutate the process environment hold `ENV_LOCK` for the duration.

use std::collections::BTreeMap;
use std::sync::Mutex;

use ogdb_eval::drivers::real_llm_adapter::{
    provider_from_env, resolve_adapter, DeterministicMockAdapter, Provider, RetryPolicy,
    DEFAULT_MAX_RETRIES, DEFAULT_RETRY_BASE_MS, MAX_RETRIES_ENV, PROVIDER_ENV, RETRY_BASE_MS_ENV,
};
use ogdb_eval::drivers::skill_quality::{
    Difficulty, EvalCase, Expected, LlmAdapter, SkillQualityError,
};

// All env-mutating tests in this file serialise around this lock so
// parallel `cargo test` runs don't stomp each other's env state.
static ENV_LOCK: Mutex<()> = Mutex::new(());

// Keep this in sync with the env vars the factory + adapters consult.
// We clear every key the test mutates *and* every key a sibling test's
// happy-path could leak — the goal is that each test starts from a
// known-empty env.
const ALL_KEYS: [&str; 11] = [
    PROVIDER_ENV,
    MAX_RETRIES_ENV,
    RETRY_BASE_MS_ENV,
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_API_URL",
    "ANTHROPIC_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_API_URL",
    "OPENAI_MODEL",
    "OGDB_LOCAL_LLM_URL",
    "OGDB_LOCAL_LLM_MODEL",
];

fn clear_all() {
    for key in ALL_KEYS {
        std::env::remove_var(key);
    }
}

fn sample_case() -> EvalCase {
    EvalCase {
        name: "internals-sample".into(),
        difficulty: Difficulty::Easy,
        input: "ping".into(),
        context: serde_json::Value::Null,
        expected: Expected {
            must_contain: Vec::new(),
            must_not_contain: Vec::new(),
            pattern: None,
        },
        scoring: BTreeMap::new(),
    }
}

// ---------------------------------------------------------------------------
// RetryPolicy
// ---------------------------------------------------------------------------

#[test]
fn retry_policy_defaults_match_constants() {
    let policy = RetryPolicy::defaults();
    assert_eq!(policy.max_retries, DEFAULT_MAX_RETRIES);
    assert_eq!(policy.base_ms, DEFAULT_RETRY_BASE_MS);
}

#[test]
fn retry_policy_from_env_falls_back_when_unset() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();

    let policy = RetryPolicy::from_env();
    assert_eq!(policy.max_retries, DEFAULT_MAX_RETRIES);
    assert_eq!(policy.base_ms, DEFAULT_RETRY_BASE_MS);
}

#[test]
fn retry_policy_from_env_falls_back_on_parse_error() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(MAX_RETRIES_ENV, "not-a-number");
    std::env::set_var(RETRY_BASE_MS_ENV, "also-not-a-number");

    let policy = RetryPolicy::from_env();
    assert_eq!(
        policy.max_retries, DEFAULT_MAX_RETRIES,
        "parse error must fall back to default"
    );
    assert_eq!(policy.base_ms, DEFAULT_RETRY_BASE_MS);

    clear_all();
}

#[test]
fn retry_policy_from_env_honors_valid_values() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(MAX_RETRIES_ENV, "7");
    std::env::set_var(RETRY_BASE_MS_ENV, "123");

    let policy = RetryPolicy::from_env();
    assert_eq!(policy.max_retries, 7);
    assert_eq!(policy.base_ms, 123);

    clear_all();
}

// ---------------------------------------------------------------------------
// DeterministicMockAdapter
// ---------------------------------------------------------------------------

#[test]
fn deterministic_mock_default_impl_constructs() {
    // The `impl Default for DeterministicMockAdapter` block is otherwise
    // uncovered — every other call site uses `DeterministicMockAdapter`
    // directly. Calling `::default()` here exercises that line.
    let adapter: DeterministicMockAdapter = Default::default();
    let case = sample_case();
    let resp = adapter.respond(&case).expect("mock must not fail");
    assert_eq!(resp.text, "[mock] ping");
    assert_eq!(resp.latency_us, 0);
}

// ---------------------------------------------------------------------------
// provider_from_env — every match-arm
// ---------------------------------------------------------------------------

#[test]
fn provider_from_env_defaults_to_mock_when_unset() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();

    assert_eq!(provider_from_env().expect("must parse"), Provider::Mock);
}

#[test]
fn provider_from_env_parses_each_known_value() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    for (raw, expected) in [
        ("mock", Provider::Mock),
        ("anthropic", Provider::Anthropic),
        ("openai", Provider::OpenAi),
        ("local", Provider::Local),
    ] {
        clear_all();
        std::env::set_var(PROVIDER_ENV, raw);
        assert_eq!(
            provider_from_env().expect("known value must parse"),
            expected,
            "provider {raw:?} must map to {expected:?}"
        );
    }

    clear_all();
}

#[test]
fn provider_from_env_rejects_unknown_value() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "GeMiNi");

    let err = provider_from_env().expect_err("unknown provider must surface error");
    match err {
        SkillQualityError::Adapter(msg) => {
            assert!(msg.contains("unknown provider"), "got {msg:?}");
            assert!(msg.contains("GeMiNi"), "must echo input case, got {msg:?}");
        }
        other => panic!("expected Adapter error, got {other:?}"),
    }

    clear_all();
}

// ---------------------------------------------------------------------------
// Factory dispatch — feature-gated happy + error paths
// ---------------------------------------------------------------------------

#[cfg(feature = "llm-openai")]
#[test]
fn factory_dispatches_to_openai_when_feature_enabled() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "openai");
    // Point at a deliberately unreachable URL — we only verify the
    // factory constructs the adapter struct. We never call `.respond()`,
    // so no HTTP traffic happens.
    std::env::set_var("OPENAI_API_KEY", "dummy-test-key");
    std::env::set_var("OPENAI_API_URL", "http://127.0.0.1:1/never-connects");
    std::env::set_var("OPENAI_MODEL", "gpt-test");

    let adapter = resolve_adapter()
        .expect("factory must return OpenAiAdapter when feature is on + key is present");
    drop(adapter);

    clear_all();
}

#[cfg(feature = "llm-openai")]
#[test]
fn factory_openai_without_api_key_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "openai");

    match resolve_adapter() {
        Ok(_) => panic!("missing OPENAI_API_KEY must error"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains("OPENAI_API_KEY"),
                "error must name the missing env var, got {msg:?}"
            );
        }
        Err(other) => panic!("expected Adapter error, got {other:?}"),
    }

    clear_all();
}

#[cfg(feature = "llm-local")]
#[test]
fn factory_dispatches_to_local_when_feature_enabled() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "local");
    std::env::set_var("OGDB_LOCAL_LLM_URL", "http://127.0.0.1:1/never-connects");
    std::env::set_var("OGDB_LOCAL_LLM_MODEL", "llama-test");

    let adapter = resolve_adapter()
        .expect("factory must return LocalAdapter when feature is on + URL is present");
    drop(adapter);

    clear_all();
}

#[cfg(feature = "llm-local")]
#[test]
fn factory_local_without_url_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "local");

    match resolve_adapter() {
        Ok(_) => panic!("missing OGDB_LOCAL_LLM_URL must error"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains("OGDB_LOCAL_LLM_URL"),
                "error must name the missing env var, got {msg:?}"
            );
        }
        Err(other) => panic!("expected Adapter error, got {other:?}"),
    }

    clear_all();
}

#[cfg(feature = "llm-anthropic")]
#[test]
fn factory_dispatches_to_anthropic_when_key_present() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "anthropic");
    std::env::set_var("ANTHROPIC_API_KEY", "dummy-test-key");
    std::env::set_var(
        "ANTHROPIC_API_URL",
        "http://127.0.0.1:1/never-connects",
    );
    std::env::set_var("ANTHROPIC_MODEL", "claude-test");

    let adapter = resolve_adapter()
        .expect("factory must return AnthropicAdapter when feature is on + key is present");
    drop(adapter);

    clear_all();
}

// When openai or local feature is NOT compiled in, factory dispatch on
// those providers must return the `built without feature …` error.
// The existing `factory_openai_without_feature_errors` test covers
// `not(feature = "llm-openai")`. Mirror it for `not(feature = "llm-local")`
// so we don't depend on the default-features run for that branch.
#[cfg(not(feature = "llm-local"))]
#[test]
fn factory_local_without_feature_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "local");

    match resolve_adapter() {
        Ok(_) => panic!("provider=local must error when feature is off"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(msg.contains("llm-local"), "got {msg:?}");
            assert!(msg.contains("built without"), "got {msg:?}");
        }
        Err(other) => panic!("expected Adapter error, got {other:?}"),
    }

    clear_all();
}

#[cfg(not(feature = "llm-anthropic"))]
#[test]
fn factory_anthropic_without_feature_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_all();
    std::env::set_var(PROVIDER_ENV, "anthropic");

    match resolve_adapter() {
        Ok(_) => panic!("provider=anthropic must error when feature is off"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(msg.contains("llm-anthropic"), "got {msg:?}");
            assert!(msg.contains("built without"), "got {msg:?}");
        }
        Err(other) => panic!("expected Adapter error, got {other:?}"),
    }

    clear_all();
}
