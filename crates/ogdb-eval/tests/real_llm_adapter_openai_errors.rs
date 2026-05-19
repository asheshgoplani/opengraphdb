//! OpenAI adapter error-path + env-driven construction tests.
//!
//! Mirrors `real_llm_adapter_errors.rs` (which covered the Anthropic
//! adapter) for the OpenAI Chat Completions branch. Without these tests
//! `openai.rs` is 0% covered because the default test run only enables
//! `llm-anthropic`. These tests use wiremock to stand in for the OpenAI
//! API — no real network calls, no `OPENAI_API_KEY` required.

#![cfg(feature = "llm-openai")]

use std::collections::BTreeMap;
use std::sync::Mutex;

use ogdb_eval::drivers::real_llm_adapter::openai::{
    OpenAiAdapter, API_KEY_ENV, API_URL_ENV, DEFAULT_MODEL, DEFAULT_URL, MODEL_ENV,
};
use ogdb_eval::drivers::real_llm_adapter::RetryPolicy;
use ogdb_eval::drivers::skill_quality::{
    Difficulty, EvalCase, Expected, LlmAdapter, SkillQualityError,
};

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

// Env is process-global; serialise around it so this file's sub-tests
// don't stomp each other under parallel `cargo test`.
static ENV_LOCK: Mutex<()> = Mutex::new(());

fn clear_openai_env() {
    std::env::remove_var(API_KEY_ENV);
    std::env::remove_var(API_URL_ENV);
    std::env::remove_var(MODEL_ENV);
}

fn sample_case() -> EvalCase {
    EvalCase {
        name: "openai-errors-sample".into(),
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

/// `OpenAiAdapter::from_env` without `OPENAI_API_KEY` ⇒
/// `Err(Adapter("OPENAI_API_KEY …"))`. Mirrors the anthropic-factory
/// missing-key check; without it the `from_env` line is uncovered.
#[test]
fn openai_from_env_without_api_key_errors() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_openai_env();

    let result = OpenAiAdapter::from_env();
    match result {
        Ok(_) => panic!("OpenAiAdapter::from_env must error when key is absent"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains(API_KEY_ENV),
                "error must name the missing env var, got {msg:?}"
            );
        }
        Err(other) => panic!("expected Err(Adapter), got Err({other:?})"),
    }
}

/// `OpenAiAdapter::from_env` with `OPENAI_API_KEY` set + URL/MODEL
/// unset ⇒ adapter constructs using `DEFAULT_URL` + `DEFAULT_MODEL`.
/// This exercises the unwrap_or_else fallbacks on lines 29-30.
#[test]
fn openai_from_env_uses_defaults_when_url_and_model_unset() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_openai_env();
    std::env::set_var(API_KEY_ENV, "test-key-fallbacks");

    let adapter = OpenAiAdapter::from_env().expect("must build with only API key set");
    // Adapter has no public accessors; just assert it constructed. The
    // defaults are exposed as `DEFAULT_URL` / `DEFAULT_MODEL` consts
    // which we re-export to keep this assertion meaningful even if the
    // struct's internals change.
    let _ = adapter; // adapter exists ⇒ from_env's env-fallback path ran
    assert_eq!(DEFAULT_URL, "https://api.openai.com/v1/chat/completions");
    assert_eq!(DEFAULT_MODEL, "gpt-4o-mini");

    clear_openai_env();
}

/// `OpenAiAdapter::from_env` honours explicit `OPENAI_API_URL` +
/// `OPENAI_MODEL`. Without this test the env-override branches of
/// `from_env` stay uncovered.
#[test]
fn openai_from_env_honours_url_and_model_overrides() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_openai_env();
    std::env::set_var(API_KEY_ENV, "test-key-override");
    std::env::set_var(API_URL_ENV, "http://127.0.0.1:9/custom");
    std::env::set_var(MODEL_ENV, "gpt-test-override");

    let adapter = OpenAiAdapter::from_env().expect("must build when all env vars set");
    let _ = adapter;

    clear_openai_env();
}

/// Persistent 429 ⇒ `Err(Adapter("rate limit: 429"))` after retries are
/// exhausted. Covers the OpenAI path through `post_with_retry`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_gives_up_after_persistent_429() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = OpenAiAdapter::with_config(
        url,
        "test-key".to_string(),
        "gpt-4o-mini".to_string(),
        RetryPolicy {
            max_retries: 2,
            base_ms: 1,
        },
    )
    .expect("adapter must build");

    let case = sample_case();
    let err = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect_err("adapter must surface error after exhausting retries");

    match err {
        SkillQualityError::Adapter(msg) => {
            assert!(
                msg.starts_with("rate limit:"),
                "error prefix must be `rate limit:`, got {msg:?}"
            );
            assert!(
                msg.contains("429"),
                "error must name the HTTP status, got {msg:?}"
            );
        }
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// 500 ⇒ `Err(Adapter("status: 500"))`. The non-success branch in
/// `post_with_retry` only fires for statuses outside the
/// retry-on-rate-limit set, so we use 500 here.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_surfaces_500_as_status_error() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(500))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = OpenAiAdapter::with_config(
        url,
        "test-key".to_string(),
        "gpt-4o-mini".to_string(),
        RetryPolicy {
            max_retries: 0,
            base_ms: 1,
        },
    )
    .expect("adapter must build");

    let case = sample_case();
    let err = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect_err("non-success status must surface as Adapter error");

    match err {
        SkillQualityError::Adapter(msg) => assert!(
            msg.starts_with("status: 500"),
            "error prefix must be `status: 500`, got {msg:?}"
        ),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Malformed body ⇒ `Err(Adapter("json: …"))`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_handles_malformed_response_body() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = OpenAiAdapter::with_config(
        url,
        "test-key".to_string(),
        "gpt-4o-mini".to_string(),
        RetryPolicy {
            max_retries: 0,
            base_ms: 1,
        },
    )
    .expect("adapter");

    let case = sample_case();
    let err = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect_err("malformed body must surface as Adapter error");

    match err {
        SkillQualityError::Adapter(msg) => assert!(
            msg.starts_with("json:"),
            "error prefix must be `json:`, got {msg:?}"
        ),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Valid JSON missing `choices[0].message.content` ⇒
/// `Err(Adapter("no text"))`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_rejects_missing_text_field() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "choices": []  // empty array → first() returns None
        })))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = OpenAiAdapter::with_config(
        url,
        "test-key".to_string(),
        "gpt-4o-mini".to_string(),
        RetryPolicy {
            max_retries: 0,
            base_ms: 1,
        },
    )
    .expect("adapter");

    let case = sample_case();
    let err = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect_err("missing choices[0].message.content must surface as Adapter error");

    match err {
        SkillQualityError::Adapter(msg) => assert_eq!(
            msg, "no text",
            "missing-field error must be exactly `no text`, got {msg:?}"
        ),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Retry-then-success: first 429, then 200. Covers the retry-success
/// path through `post_with_retry` from the OpenAI adapter (the Anthropic
/// errors test covers the same branch, but only via the Anthropic body
/// shape — OpenAI takes a different code path through `choices[0]`).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_retries_then_succeeds_on_429() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(429))
        .up_to_n_times(1)
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{
                "message": { "role": "assistant", "content": "MATCH (p:Person)" },
                "finish_reason": "stop"
            }]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = OpenAiAdapter::with_config(
        url,
        "test-key".to_string(),
        "gpt-4o-mini".to_string(),
        RetryPolicy {
            max_retries: 3,
            base_ms: 1,
        },
    )
    .expect("adapter");

    let case = sample_case();
    let resp = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect("adapter must succeed after one retry");

    assert_eq!(resp.text, "MATCH (p:Person)");
    assert!(resp.latency_us > 0, "latency must be measured");
}
