//! Local-LLM adapter error-path + with_config construction tests.
//!
//! `real_llm_adapter_local.rs` covers the happy path + missing-URL
//! check, but the body-extraction error branches and the retry policy
//! through `post_with_retry` were uncovered. These tests use wiremock
//! so they never touch a real ollama / llama.cpp server.

#![cfg(feature = "llm-local")]

use std::collections::BTreeMap;

use ogdb_eval::drivers::real_llm_adapter::local::LocalAdapter;
use ogdb_eval::drivers::real_llm_adapter::RetryPolicy;
use ogdb_eval::drivers::skill_quality::{
    Difficulty, EvalCase, Expected, LlmAdapter, SkillQualityError,
};

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn sample_case() -> EvalCase {
    EvalCase {
        name: "local-errors-sample".into(),
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

/// Direct `with_config` + happy-path response. The existing
/// `real_llm_adapter_local.rs::local_adapter_honors_url_env` test only
/// exercises the `from_env` + factory route; this one covers the
/// `with_config` constructor without env mutation, so concurrent tests
/// don't race on the env lock.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_with_config_happy_path() {
    let server = MockServer::start().await;

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
    let adapter =
        LocalAdapter::with_config(url, "llama-test".to_string(), RetryPolicy::defaults())
            .expect("LocalAdapter::with_config must build");

    let case = sample_case();
    let resp = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect("respond must succeed");

    assert_eq!(resp.text, "MATCH (p:Person)");
    assert!(resp.latency_us > 0, "latency must be measured");
}

/// Persistent 429 ⇒ `Err(Adapter("rate limit: 429"))`. Same retry policy
/// as the OpenAI / Anthropic adapters — verifies the local code path
/// reaches `post_with_retry` correctly.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_gives_up_after_persistent_429() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = LocalAdapter::with_config(
        url,
        "llama-test".to_string(),
        RetryPolicy {
            max_retries: 2,
            base_ms: 1,
        },
    )
    .expect("adapter");

    let case = sample_case();
    let err = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect_err("must surface error after retries");

    match err {
        SkillQualityError::Adapter(msg) => {
            assert!(
                msg.starts_with("rate limit:"),
                "got {msg:?}"
            );
            assert!(msg.contains("429"), "got {msg:?}");
        }
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Non-success HTTP status (503 has its own retry branch; use 500 to
/// hit the catch-all non-success branch).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_surfaces_500_as_status_error() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(500))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = LocalAdapter::with_config(
        url,
        "llama-test".to_string(),
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
        .expect_err("500 must surface as Adapter error");

    match err {
        SkillQualityError::Adapter(msg) => assert!(
            msg.starts_with("status: 500"),
            "got {msg:?}"
        ),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Malformed body.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_handles_malformed_response_body() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = LocalAdapter::with_config(
        url,
        "llama-test".to_string(),
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
        SkillQualityError::Adapter(msg) => assert!(msg.starts_with("json:"), "got {msg:?}"),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Missing `choices[0].message.content` ⇒ `Err(Adapter("no text"))`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_rejects_missing_text_field() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{
                "message": { "role": "assistant" }
                // no content field
            }]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/chat/completions", server.uri());
    let adapter = LocalAdapter::with_config(
        url,
        "llama-test".to_string(),
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
        .expect_err("missing content must surface as Adapter error");

    match err {
        SkillQualityError::Adapter(msg) => assert_eq!(msg, "no text", "got {msg:?}"),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}

/// Retry-then-success: first 503 (retried like 429), then 200.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_retries_then_succeeds_on_503() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(503))
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
    let adapter = LocalAdapter::with_config(
        url,
        "llama-test".to_string(),
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
}
