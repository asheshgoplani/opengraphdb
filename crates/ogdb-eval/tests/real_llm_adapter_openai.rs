//! RED-phase test — OpenAiAdapter serialises the correct Chat
//! Completions body + Authorization header and extracts
//! `choices[0].message.content` from the response.
//! .planning/real-llm-adapter/PLAN.md §6 row 3.
//!
//! Invoke with:
//!   cargo test -p ogdb-eval --no-default-features --features llm-openai \
//!       --test real_llm_adapter_openai

#![cfg(feature = "llm-openai")]

use std::collections::BTreeMap;

use ogdb_eval::drivers::real_llm_adapter::openai::OpenAiAdapter;
use ogdb_eval::drivers::real_llm_adapter::RetryPolicy;
use ogdb_eval::drivers::skill_quality::{Difficulty, EvalCase, Expected, LlmAdapter};

use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

fn sample_case() -> EvalCase {
    EvalCase {
        name: "openai-sample".into(),
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn openai_formats_correct_request_body() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("authorization", "Bearer test-key"))
        .and(header("content-type", "application/json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": "gpt-4o-mini",
            "choices": [{
                "index": 0,
                "message": { "role": "assistant", "content": "MATCH (p:Person) RETURN p" },
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
        RetryPolicy::defaults(),
    )
    .expect("adapter must build with explicit config");

    let case = sample_case();
    let resp = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect("respond must succeed");

    assert_eq!(
        resp.text, "MATCH (p:Person) RETURN p",
        "adapter must extract choices[0].message.content"
    );

    let received: Vec<Request> = server
        .received_requests()
        .await
        .expect("wiremock records requests");
    assert_eq!(received.len(), 1, "exactly one request");
    let body: serde_json::Value =
        serde_json::from_slice(&received[0].body).expect("request body must be JSON");
    assert_eq!(body["model"], "gpt-4o-mini");
    let messages = body["messages"].as_array().expect("messages array");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"], "Find all Person nodes");
}
