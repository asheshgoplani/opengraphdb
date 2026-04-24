//! RED-phase test — AnthropicAdapter serialises the correct request
//! body + headers and extracts text from the Messages API response shape.
//! .planning/real-llm-adapter/PLAN.md §6 row 2.

#![cfg(feature = "llm-anthropic")]

use std::collections::BTreeMap;

use ogdb_eval::drivers::real_llm_adapter::anthropic::{AnthropicAdapter, ANTHROPIC_VERSION};
use ogdb_eval::drivers::real_llm_adapter::RetryPolicy;
use ogdb_eval::drivers::skill_quality::{Difficulty, EvalCase, Expected, LlmAdapter};

use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

fn sample_case() -> EvalCase {
    EvalCase {
        name: "anthropic-sample".into(),
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

/// Phase-3 must:
///   · POST /v1/messages
///   · headers: x-api-key, anthropic-version=2023-06-01, content-type=application/json
///   · body: { model, max_tokens: 1024, messages: [{role:"user", content:<input>}] }
///   · parse `content[0].text` out of the response
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn anthropic_formats_correct_request_body() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "test-key"))
        .and(header("anthropic-version", ANTHROPIC_VERSION))
        .and(header("content-type", "application/json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "model": "claude-haiku-4-5",
            "content": [
                { "type": "text", "text": "MATCH (p:Person) RETURN p" }
            ],
            "stop_reason": "end_turn"
        })))
        .expect(1)
        .mount(&server)
        .await;

    // Also mount a request-inspector so we can assert on the body shape
    // after the adapter call returns. wiremock's API exposes
    // `server.received_requests().await`.
    let url = format!("{}/v1/messages", server.uri());

    let adapter = AnthropicAdapter::with_config(
        url,
        "test-key".to_string(),
        "claude-haiku-4-5".to_string(),
        RetryPolicy::defaults(),
    )
    .expect("adapter must build with explicit config");

    let case = sample_case();
    let resp = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect("respond must succeed against a 200 response");

    assert_eq!(
        resp.text, "MATCH (p:Person) RETURN p",
        "adapter must extract content[0].text"
    );
    assert!(resp.latency_us > 0, "latency must be measured, not synthesised");

    // Verify the actual request body: model, max_tokens, messages[0].role,
    // messages[0].content. wiremock records every match in order.
    let received: Vec<Request> = server
        .received_requests()
        .await
        .expect("wiremock must record requests");
    assert_eq!(
        received.len(),
        1,
        "exactly one request must reach the mock server"
    );
    let body: serde_json::Value = serde_json::from_slice(&received[0].body)
        .expect("request body must be JSON");
    assert_eq!(body["model"], "claude-haiku-4-5");
    assert_eq!(body["max_tokens"], 1024);
    let messages = body["messages"].as_array().expect("messages array");
    assert_eq!(messages.len(), 1, "single user message");
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"], "Find all Person nodes");
}
