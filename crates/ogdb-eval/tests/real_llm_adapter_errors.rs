//! RED-phase tests — rate-limit retry semantics + malformed response
//! error mapping. Both tests exercise the shared `post_with_retry`
//! policy that Phase 3 will implement inside AnthropicAdapter (the
//! same logic applies verbatim to OpenAI / Local because Phase 3
//! factors retry into the shared module).
//! .planning/real-llm-adapter/PLAN.md §6 rows 4 + 5.

#![cfg(feature = "llm-anthropic")]

use std::collections::BTreeMap;

use ogdb_eval::drivers::real_llm_adapter::anthropic::AnthropicAdapter;
use ogdb_eval::drivers::real_llm_adapter::RetryPolicy;
use ogdb_eval::drivers::skill_quality::{
    Difficulty, EvalCase, Expected, LlmAdapter, SkillQualityError,
};

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn sample_case() -> EvalCase {
    EvalCase {
        name: "errors-sample".into(),
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

/// Phase 3 must retry on 429 with exponential backoff. The `base_ms: 1`
/// keeps the test under 10 ms even at the worst-case retry count.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adapter_handles_rate_limit_429() {
    let server = MockServer::start().await;

    // First two attempts: 429. Third attempt: 200 with valid body.
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(429))
        .up_to_n_times(2)
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "content": [{ "type": "text", "text": "MATCH (p:Person)" }]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/messages", server.uri());
    let adapter = AnthropicAdapter::with_config(
        url,
        "test-key".to_string(),
        "claude-haiku-4-5".to_string(),
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
        .expect("adapter must succeed after retries");

    assert_eq!(
        resp.text, "MATCH (p:Person)",
        "third attempt's body must be surfaced"
    );
    let received = server
        .received_requests()
        .await
        .expect("wiremock records");
    assert_eq!(
        received.len(),
        3,
        "must retry twice (total 3 POSTs) before the 200 completes"
    );
}

/// When every attempt returns 429, the adapter exhausts retries and
/// returns `Err(Adapter("rate limit: 429"))`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adapter_gives_up_after_persistent_429() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server)
        .await;

    let url = format!("{}/v1/messages", server.uri());
    let adapter = AnthropicAdapter::with_config(
        url,
        "test-key".to_string(),
        "claude-haiku-4-5".to_string(),
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

/// Malformed JSON body ⇒ `Err(Adapter("json: …"))`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adapter_handles_malformed_response_body() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_string("not json at all"))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/messages", server.uri());
    let adapter = AnthropicAdapter::with_config(
        url,
        "test-key".to_string(),
        "claude-haiku-4-5".to_string(),
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

/// Valid JSON but wrong shape (no `content[0].text`) ⇒
/// `Err(Adapter("no text"))`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adapter_rejects_missing_text_field() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "foo": "bar"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/messages", server.uri());
    let adapter = AnthropicAdapter::with_config(
        url,
        "test-key".to_string(),
        "claude-haiku-4-5".to_string(),
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
        .expect_err("missing content.text must surface as Adapter error");

    match err {
        SkillQualityError::Adapter(msg) => assert_eq!(
            msg, "no text",
            "missing-field error must be exactly `no text`, got {msg:?}"
        ),
        other => panic!("expected Adapter error, got {other:?}"),
    }
}
