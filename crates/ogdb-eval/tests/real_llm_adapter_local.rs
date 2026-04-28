//! RED-phase test — `LocalAdapter` reads `OGDB_LOCAL_LLM_URL` from env,
//! hits that URL with an OpenAI-compatible request, and **does not**
//! include an `Authorization` header (local servers don't require one).
//! .planning/real-llm-adapter/PLAN.md §6 row 6.
//!
//! Invoke with:
//!   cargo test -p ogdb-eval --no-default-features --features llm-local \
//!       --test real_llm_adapter_local

#![cfg(feature = "llm-local")]

use std::collections::BTreeMap;
use std::sync::Mutex;

use ogdb_eval::drivers::real_llm_adapter::local::{LocalAdapter, MODEL_ENV, URL_ENV};
use ogdb_eval::drivers::real_llm_adapter::{resolve_adapter, PROVIDER_ENV};
#[allow(unused_imports)]
use ogdb_eval::drivers::skill_quality::LlmAdapter;
use ogdb_eval::drivers::skill_quality::{Difficulty, EvalCase, Expected, SkillQualityError};

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

// Env is process-global; serialise around it so this file's sub-tests
// don't stomp each other under parallel `cargo test`.
static ENV_LOCK: Mutex<()> = Mutex::new(());

fn clear_env() {
    std::env::remove_var(PROVIDER_ENV);
    std::env::remove_var(URL_ENV);
    std::env::remove_var(MODEL_ENV);
}

fn sample_case() -> EvalCase {
    EvalCase {
        name: "local-sample".into(),
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
async fn local_adapter_honors_url_env() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_env();

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
    std::env::set_var(PROVIDER_ENV, "local");
    std::env::set_var(URL_ENV, &url);
    std::env::set_var(MODEL_ENV, "llama-3-8b");

    let adapter = resolve_adapter().expect("factory must return LocalAdapter");

    let case = sample_case();
    let resp = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await
        .expect("join")
        .expect("respond must succeed against the mock server");

    assert_eq!(
        resp.text, "MATCH (p:Person)",
        "adapter must extract choices[0].message.content"
    );

    let received: Vec<Request> = server.received_requests().await.expect("wiremock records");
    assert_eq!(received.len(), 1, "exactly one POST");

    // Local servers do NOT require auth — the adapter must omit the
    // Authorization header so the downstream server (e.g. ollama)
    // doesn't reject the request.
    let has_auth = received[0]
        .headers
        .iter()
        .any(|(name, _v)| name.as_str().eq_ignore_ascii_case("authorization"));
    assert!(
        !has_auth,
        "LocalAdapter must not send an Authorization header (saw one)"
    );

    // Body must carry the configured model + the OpenAI-compatible shape.
    let body: serde_json::Value =
        serde_json::from_slice(&received[0].body).expect("request body must be JSON");
    assert_eq!(body["model"], "llama-3-8b", "model must come from env");
    let messages = body["messages"].as_array().expect("messages array");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"], "Find all Person nodes");

    clear_env();
}

/// `LocalAdapter::from_env` without `OGDB_LOCAL_LLM_URL` set ⇒
/// `Err(Adapter("OGDB_LOCAL_LLM_URL …"))`. Keeps the factory honest —
/// silent defaults would be a footgun for a user who forgot to start
/// their local server.
#[test]
fn local_adapter_requires_url_env() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    clear_env();

    let result = LocalAdapter::from_env();
    match result {
        Ok(_) => panic!("LocalAdapter::from_env must error when URL env is absent"),
        Err(SkillQualityError::Adapter(msg)) => {
            assert!(
                msg.contains("OGDB_LOCAL_LLM_URL"),
                "error must mention the missing env var, got {msg:?}"
            );
        }
        Err(other) => panic!("expected Err(Adapter), got Err({other:?})"),
    }
}
