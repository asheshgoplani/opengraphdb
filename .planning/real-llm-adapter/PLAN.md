## real-llm-adapter — Dimension-4 closed loop against real LLMs

> **Phase 2 artifact.** This document + the failing tests under
> `crates/ogdb-eval/tests/real_llm_adapter_*.rs` constitute the RED commit
> on branch `plan/real-llm-adapter`. Phase 3 (GREEN) replaces the
> `unimplemented!()` stubs in
> `crates/ogdb-eval/src/drivers/real_llm_adapter/{mod,anthropic,openai,local}.rs`
> (all new) with real reqwest-blocking HTTP implementations and removes
> the placeholder `StubRealAdapter` from
> `crates/ogdb-eval/src/drivers/skill_quality.rs` — its only caller is
> the Phase-2 `tests/skill_quality_adapter.rs::stub_real_adapter_…` test,
> which gets retargeted onto the new factory in the same commit.

**Goal:** replace the hard-wired `StubRealAdapter` — today's only
non-mock `LlmAdapter` — with three feature-gated real adapters
(`AnthropicAdapter`, `OpenAiAdapter`, `LocalAdapter`) wired through a
runtime factory, so the skill-quality driver (Dimension 4) can run
against a real LLM when an env var says so, *without* compromising
`cargo test -p ogdb-eval` determinism.

**Tech stack:** Rust 2021, `reqwest` **blocking** (new optional dep,
gated by any `llm-*` feature), `serde_json` (already a workspace dep),
`thiserror` (already a dep). Dev-only: `wiremock` + `tokio` (dev-deps)
for mock HTTP servers — **no real network calls from tests**.

---

## 1. Problem summary — why this matters

Dimension 4 (skill quality) shipped at commit `cc82a1b` with a
deliberately inert fallback:

```rust
// crates/ogdb-eval/src/drivers/skill_quality.rs:110-119
pub struct StubRealAdapter;
impl LlmAdapter for StubRealAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Err(SkillQualityError::Unimplemented(
            "real LLM adapter lands in Phase 5",
        ))
    }
}
```

Every caller — `publish_baseline.rs`, the yet-to-land `RunAllConfig`
wiring, the recursive-skill-improvement reporter (commit `fadde43`) —
can today only exercise Dimension 4 with a `MockAdapter` closure. That
means:

1. The closed loop never sees a real LLM's output. A skill prose
   regression that the mock happens to mask silently slips through.
2. The diagnostics `run_with_diagnostics` captures (expected vs. actual
   text) are populated only with synthetic strings. The recursive
   conductor's `suggested_next_plan` hint is never driven by a real
   model's mistakes.
3. There is no forcing-function keeping the adapter boundary honest —
   if GREEN Dimension 4 subtly assumed a quirk of `MockAdapter` (e.g.
   zero latency, BTreeMap-ordered output), the assumption stays buried.

**Closing this gap** — three feature-gated real adapters behind a
single runtime factory, all env-var driven so `cargo test -p ogdb-eval`
keeps using `MockAdapter` by default — lets the outer loop actually run
against `claude-haiku-4-5`, `gpt-4o-mini`, or a local
OpenAI-compatible server (`ollama`, `llama.cpp`, `vllm`) without
touching the scorer, the aggregator, or the Dimension-5-onwards
extensibility contract.

## 2. Exact reproducer — today's state

```console
$ cd /home/ashesh-goplani/opengraphdb
$ grep -n "StubRealAdapter\|RealAdapter" crates/ogdb-eval/src/drivers/skill_quality.rs
111:pub struct StubRealAdapter;
113:impl LlmAdapter for StubRealAdapter {
114:    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
115:        Err(SkillQualityError::Unimplemented(

$ ls crates/ogdb-eval/src/drivers/real_llm_adapter 2>&1
ls: cannot access 'crates/ogdb-eval/src/drivers/real_llm_adapter': No such file or directory

$ ls crates/ogdb-eval/tests/real_llm_adapter_*.rs 2>&1
ls: cannot access 'crates/ogdb-eval/tests/real_llm_adapter_*.rs': No such file or directory

$ grep -n "^\[features\]\|^reqwest\|^wiremock" crates/ogdb-eval/Cargo.toml
# (no matches — no features, no HTTP stack)
```

Nothing exists. No factory, no adapters, no feature flags, no HTTP
client, no tests. `StubRealAdapter::respond` is the only real-adapter
code path, and it can never succeed.

## 3. Data-flow trace

```
                ┌───────────────────────────────────────────────────────┐
                │ env vars (read once at factory call)                  │
                │   OGDB_SKILL_LLM_PROVIDER  ∈ {"mock","anthropic",     │
                │                               "openai","local"}       │
                │                              default = "mock"         │
                │   ANTHROPIC_API_KEY    required when provider=anthropic│
                │   ANTHROPIC_API_URL    optional test override         │
                │                        default = https://api.anthropic│
                │                                  .com/v1/messages     │
                │   ANTHROPIC_MODEL      default = claude-haiku-4-5     │
                │   OPENAI_API_KEY       required when provider=openai  │
                │   OPENAI_API_URL       optional test override         │
                │                        default = https://api.openai   │
                │                                  .com/v1/chat/completions│
                │   OPENAI_MODEL         default = gpt-4o-mini          │
                │   OGDB_LOCAL_LLM_URL   required when provider=local   │
                │   OGDB_LOCAL_LLM_MODEL default = "local-model"        │
                │   OGDB_LLM_MAX_RETRIES default = 3                    │
                │   OGDB_LLM_RETRY_BASE_MS default = 250                │
                │   OGDB_LLM_TIMEOUT_MS  default = 30000                │
                └───────────────────────┬───────────────────────────────┘
                                        │ resolve_adapter()
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ fn resolve_adapter() -> Result<Box<dyn LlmAdapter>, SkillQualityError>  │
│                                                                         │
│  match provider {                                                       │
│    "mock"      => Ok(Box::new(DeterministicMockAdapter::default())),    │
│    "anthropic" => {                                                     │
│       #[cfg(feature = "llm-anthropic")]                                 │
│       return AnthropicAdapter::from_env().map(boxed);                   │
│       #[cfg(not(feature = "llm-anthropic"))]                            │
│       return Err(SkillQualityError::Adapter(                            │
│           "provider=anthropic but crate built without llm-anthropic"));│
│    }                                                                    │
│    "openai"    => analogous, feature = "llm-openai"                     │
│    "local"     => analogous, feature = "llm-local"                      │
│  }                                                                      │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │ Box<dyn LlmAdapter>
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ AnthropicAdapter { http: reqwest::blocking::Client, url: String,        │
│                    api_key: String, model: String,                      │
│                    retry_policy: RetryPolicy }                          │
│                                                                         │
│  respond(&self, case) -> Result<AdapterResponse, SkillQualityError>:    │
│    body = { "model": self.model,                                        │
│             "max_tokens": 1024,                                         │
│             "messages": [{ "role":"user", "content": case.input }] }    │
│    headers = x-api-key: <key>,                                          │
│              anthropic-version: 2023-06-01,                             │
│              content-type: application/json                             │
│    t0 = Instant::now()                                                  │
│    resp = self.post_with_retry(body)?     (§ retry below)               │
│    text = resp["content"][0]["text"].as_str()                           │
│             .ok_or(SkillQualityError::Adapter("no text"))?              │
│    AdapterResponse { text, latency_us: t0.elapsed().as_micros() as u64 }│
│                                                                         │
│ OpenAiAdapter { … }                                                     │
│  body = { "model": self.model,                                          │
│           "messages": [{ "role":"user", "content": case.input }] }      │
│  headers = Authorization: Bearer <key>, content-type: application/json  │
│  extract = resp["choices"][0]["message"]["content"].as_str()            │
│                                                                         │
│ LocalAdapter { … }  ← OpenAI-compatible schema, no Authorization header │
│  body/extract identical to OpenAI                                       │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │ AdapterResponse { text, latency_us }
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ score_case() + aggregate()   (unchanged from Dimension 4)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Retry / error-mapping policy (shared by all three adapters)

```
post_with_retry(body):
    for attempt in 0..=self.retry_policy.max_retries:
        let resp = self.http.post(&self.url)
                           .headers(...)
                           .json(&body)
                           .send();
        match resp {
            Err(e) if is_timeout(e) || is_connect(e) =>
                if attempt < max_retries { sleep(backoff(attempt)); continue }
                else { return Err(Adapter(format!("http: {e}"))) }
            Err(e) => return Err(Adapter(format!("http: {e}"))),
            Ok(r) if r.status() == 429 || r.status() == 503 =>
                if attempt < max_retries { sleep(backoff(attempt)); continue }
                else { return Err(Adapter(format!("rate limit: {}", r.status()))) }
            Ok(r) if !r.status().is_success() =>
                return Err(Adapter(format!("status: {}", r.status()))),
            Ok(r) =>
                return r.json::<serde_json::Value>()
                        .map_err(|e| Adapter(format!("json: {e}"))),
        }
    }

backoff(attempt) = Duration::from_millis(base_ms << attempt)
     // attempt=0 → base_ms
     // attempt=1 → 2*base_ms
     // attempt=2 → 4*base_ms
     // tests inject base_ms=1 via OGDB_LLM_RETRY_BASE_MS to stay under 10ms total.
```

**Deterministic error mapping** (PLAN invariant — Phase-3 must preserve):

| HTTP condition                     | Rust return                                     |
|------------------------------------|-------------------------------------------------|
| 2xx, body parses                   | `Ok(Value)`                                     |
| 2xx, body malformed JSON           | `Err(Adapter("json: …"))`                       |
| 2xx, JSON missing expected field   | `Err(Adapter("no text"))`                       |
| 4xx non-429                        | `Err(Adapter("status: <code>"))`                |
| 429 or 503, attempts exhausted     | `Err(Adapter("rate limit: <code>"))`            |
| 429 or 503, attempts remaining     | sleep + retry                                   |
| Network timeout / connect refused  | retry, then `Err(Adapter("http: …"))` if exhaust|

**I/O budget:** per `respond()` call, one `reqwest::blocking::send` +
JSON parse. No disk I/O. No Tokio runtime inside production code — the
blocking client uses reqwest's internal Tokio for each call. The
dev-dep `wiremock` drags `tokio` in *only* under `cargo test`.

### Feature-flag & default-feature matrix

| `cargo` invocation                                   | Compiled in                         | Runtime default (no env) |
|------------------------------------------------------|-------------------------------------|--------------------------|
| `cargo test -p ogdb-eval`                            | `llm-anthropic` (default feature) — AnthropicAdapter code + reqwest | `MockAdapter` (provider=mock) |
| `cargo test -p ogdb-eval --no-default-features`      | none of the llm-* modules           | `MockAdapter`            |
| `cargo test -p ogdb-eval --features llm-openai`      | llm-anthropic (default) + llm-openai| `MockAdapter`            |
| `cargo test -p ogdb-eval --no-default-features --features llm-local` | llm-local only       | `MockAdapter`            |
| `cargo test -p ogdb-eval --features llm-anthropic,llm-openai,llm-local` | all three           | `MockAdapter`            |

**Invariant:** plain `cargo test -p ogdb-eval` *compiles* the Anthropic
HTTP stack (reqwest is pulled in) but at **runtime** the default
factory always returns `MockAdapter` because `OGDB_SKILL_LLM_PROVIDER`
defaults to `"mock"`. The real adapter code is exercised only by tests
that explicitly instantiate it via `::with_config` constructors (which
accept a wiremock URL + key, bypassing env lookups).

## 4. Scope boundaries

**In scope (this plan touches only):**
- `crates/ogdb-eval/Cargo.toml`                                    (add `[features]`, reqwest optional dep, wiremock + tokio dev-deps)
- `crates/ogdb-eval/src/drivers/mod.rs`                            (one-line `pub mod real_llm_adapter;`)
- `crates/ogdb-eval/src/drivers/real_llm_adapter/mod.rs`           (new — factory, shared `RetryPolicy`, `HttpConfig`, `DeterministicMockAdapter`, env helpers)
- `crates/ogdb-eval/src/drivers/real_llm_adapter/anthropic.rs`     (new — `#[cfg(feature = "llm-anthropic")]`)
- `crates/ogdb-eval/src/drivers/real_llm_adapter/openai.rs`        (new — `#[cfg(feature = "llm-openai")]`)
- `crates/ogdb-eval/src/drivers/real_llm_adapter/local.rs`         (new — `#[cfg(feature = "llm-local")]`)
- `crates/ogdb-eval/tests/real_llm_adapter_factory.rs`             (new — test 1)
- `crates/ogdb-eval/tests/real_llm_adapter_anthropic.rs`           (new — test 2)
- `crates/ogdb-eval/tests/real_llm_adapter_openai.rs`              (new — test 3)
- `crates/ogdb-eval/tests/real_llm_adapter_errors.rs`              (new — tests 4 + 5)
- `crates/ogdb-eval/tests/real_llm_adapter_local.rs`               (new — test 6)

**Explicitly out of scope:**
- `ogdb-core`, `ogdb-cli`, `ogdb-bench`, `ogdb-bolt`, `ogdb-e2e`,
  `ogdb-tck`, `ogdb-ffi`, `ogdb-python`, `ogdb-node`, `frontend/`,
  `bindings/`, `mcp/`, `proto/`, `docs/`, `scripts/`.
- Wiring the factory into `RunAllConfig::run_all` /
  `publish_baseline.rs`  (separate Phase-4 follow-on).
- CI jobs that hit a real LLM — tests stay wiremock-only.
- Removing `StubRealAdapter` from `skill_quality.rs` —  that's a Phase-3
  GREEN chore (preserves the RED signal in the existing
  `tests/skill_quality_adapter.rs::stub_real_adapter_…` test).
- Extending `DiffEngine` or `SkillRegressionReport` — the adapter is
  upstream of both.
- `CHANGELOG.md` / `docs/IMPLEMENTATION-LOG.md` / release-tests manifest
  entries — land with Phase-3 GREEN, not with this Phase-2 RED commit.

**Test-runner invariant.** All assertions in this plan are validated
with `cargo test -p ogdb-eval` (per-crate). Never `cargo test
--workspace` — the workspace contains crates outside this plan's blast
radius and running them here would widen scope by accident. See AGENTS.md.

## 5. Module + type design (Phase 3 shape — what stubs become)

### `crates/ogdb-eval/src/drivers/real_llm_adapter/mod.rs` (new)

```rust
//! Real-LLM adapter family for Dimension 4. Picks between a deterministic
//! mock, Anthropic Messages API, OpenAI Chat Completions API, or a local
//! OpenAI-compatible server based on env vars. Every HTTP call retries on
//! 429 / 503 with exponential backoff and maps errors deterministically.

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

#[cfg(feature = "llm-anthropic")]
pub mod anthropic;
#[cfg(feature = "llm-openai")]
pub mod openai;
#[cfg(feature = "llm-local")]
pub mod local;

pub const PROVIDER_ENV: &str = "OGDB_SKILL_LLM_PROVIDER";
pub const MAX_RETRIES_ENV: &str = "OGDB_LLM_MAX_RETRIES";
pub const RETRY_BASE_MS_ENV: &str = "OGDB_LLM_RETRY_BASE_MS";
pub const TIMEOUT_MS_ENV: &str = "OGDB_LLM_TIMEOUT_MS";

pub const DEFAULT_MAX_RETRIES: u32 = 3;
pub const DEFAULT_RETRY_BASE_MS: u64 = 250;
pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Mock,
    Anthropic,
    OpenAi,
    Local,
}

#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub base_ms: u64,
}

impl RetryPolicy {
    pub fn from_env() -> Self { /* reads two env vars, defaults above */ }
    pub fn defaults() -> Self {
        Self { max_retries: DEFAULT_MAX_RETRIES, base_ms: DEFAULT_RETRY_BASE_MS }
    }
}

/// Deterministic in-process stand-in — byte-identical to a `MockAdapter`
/// closure that returns `"[mock] " + case.input`. Used as the default
/// factory return when `OGDB_SKILL_LLM_PROVIDER` is unset or `"mock"`.
/// CI-safe: zero I/O, zero threading, zero clock reads.
pub struct DeterministicMockAdapter;
impl Default for DeterministicMockAdapter {
    fn default() -> Self { Self }
}
impl LlmAdapter for DeterministicMockAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Ok(AdapterResponse {
            text: format!("[mock] {}", case.input),
            latency_us: 0,
        })
    }
}

pub fn provider_from_env() -> Result<Provider, SkillQualityError> {
    match std::env::var(PROVIDER_ENV).unwrap_or_else(|_| "mock".into()).as_str() {
        "mock" => Ok(Provider::Mock),
        "anthropic" => Ok(Provider::Anthropic),
        "openai" => Ok(Provider::OpenAi),
        "local" => Ok(Provider::Local),
        other => Err(SkillQualityError::Adapter(format!(
            "unknown provider {other:?}; expected mock|anthropic|openai|local"
        ))),
    }
}

/// Runtime factory. Compiles into every feature matrix — `#[cfg]`
/// branches compile to `return Err(...)` when the corresponding
/// feature is not enabled. Never panics.
pub fn resolve_adapter() -> Result<Box<dyn LlmAdapter>, SkillQualityError> {
    match provider_from_env()? {
        Provider::Mock => Ok(Box::new(DeterministicMockAdapter)),
        Provider::Anthropic => {
            #[cfg(feature = "llm-anthropic")]
            { return Ok(Box::new(anthropic::AnthropicAdapter::from_env()?)); }
            #[cfg(not(feature = "llm-anthropic"))]
            { Err(SkillQualityError::Adapter(
                "provider=anthropic but crate built without feature llm-anthropic".into()))
            }
        }
        Provider::OpenAi => { /* analogous */ }
        Provider::Local => { /* analogous */ }
    }
}
```

### `crates/ogdb-eval/src/drivers/real_llm_adapter/anthropic.rs` (new)

```rust
#![cfg(feature = "llm-anthropic")]

use std::time::{Duration, Instant};
use crate::drivers::skill_quality::{AdapterResponse, EvalCase, LlmAdapter, SkillQualityError};
use super::{RetryPolicy, DEFAULT_TIMEOUT_MS, TIMEOUT_MS_ENV};

pub const API_KEY_ENV: &str = "ANTHROPIC_API_KEY";
pub const API_URL_ENV: &str = "ANTHROPIC_API_URL";
pub const MODEL_ENV:   &str = "ANTHROPIC_MODEL";
pub const DEFAULT_URL:   &str = "https://api.anthropic.com/v1/messages";
pub const DEFAULT_MODEL: &str = "claude-haiku-4-5";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct AnthropicAdapter {
    http: reqwest::blocking::Client,
    url: String,
    api_key: String,
    model: String,
    retry: RetryPolicy,
}

impl AnthropicAdapter {
    /// Read URL / key / model from env. Errors if key is absent.
    pub fn from_env() -> Result<Self, SkillQualityError> { /* … */ }

    /// Test-only constructor — bypasses env, takes explicit config so
    /// wiremock tests can inject a server URL + dummy key.
    pub fn with_config(url: String, api_key: String, model: String, retry: RetryPolicy)
        -> Result<Self, SkillQualityError> { /* … */ }

    fn post_with_retry(&self, body: &serde_json::Value)
        -> Result<serde_json::Value, SkillQualityError> { /* … */ }
}

impl LlmAdapter for AnthropicAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 1024,
            "messages": [{ "role": "user", "content": case.input }],
        });
        let t0 = Instant::now();
        let value = self.post_with_retry(&body)?;
        let text = value.get("content").and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|m| m.get("text")).and_then(|t| t.as_str())
            .ok_or_else(|| SkillQualityError::Adapter("no text".into()))?
            .to_string();
        Ok(AdapterResponse {
            text,
            latency_us: t0.elapsed().as_micros() as u64,
        })
    }
}
```

### `crates/ogdb-eval/src/drivers/real_llm_adapter/openai.rs` (new)

```rust
#![cfg(feature = "llm-openai")]
// Same shape as anthropic.rs, differences:
pub const API_KEY_ENV: &str = "OPENAI_API_KEY";
pub const API_URL_ENV: &str = "OPENAI_API_URL";
pub const MODEL_ENV:   &str = "OPENAI_MODEL";
pub const DEFAULT_URL:   &str = "https://api.openai.com/v1/chat/completions";
pub const DEFAULT_MODEL: &str = "gpt-4o-mini";

// Request body:    { "model": M, "messages": [{"role":"user","content":input}] }
// Headers:         Authorization: Bearer <key>, content-type: application/json
// Response extract: value["choices"][0]["message"]["content"].as_str()
```

### `crates/ogdb-eval/src/drivers/real_llm_adapter/local.rs` (new)

```rust
#![cfg(feature = "llm-local")]
// Same shape, OpenAI-compatible schema, no Authorization header:
pub const URL_ENV:   &str = "OGDB_LOCAL_LLM_URL";   // required, no default
pub const MODEL_ENV: &str = "OGDB_LOCAL_LLM_MODEL";
pub const DEFAULT_MODEL: &str = "local-model";

// from_env() returns Err(Adapter("OGDB_LOCAL_LLM_URL not set")) if missing.
// Request body + response extract identical to OpenAI.
```

### `crates/ogdb-eval/src/drivers/mod.rs` (single-line edit)

```rust
pub mod ai_agent;
pub mod cli_runner;
pub mod common;
pub mod criterion_ingest;
pub mod graphalytics;
pub mod ldbc_mini;
pub mod ldbc_snb;
pub mod real_llm_adapter;   // NEW
pub mod resources;
pub mod scaling;
pub mod skill_quality;
pub mod throughput;
```

### `crates/ogdb-eval/Cargo.toml` (additions only)

```toml
[dependencies]
# existing: ogdb-core, regex, serde, serde_json, thiserror
reqwest = { version = "0.12", default-features = false, features = ["blocking", "json", "rustls-tls"], optional = true }

[dev-dependencies]
# existing: libc, tempfile
wiremock = "0.6"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }

[features]
default = ["llm-anthropic"]
llm-anthropic = ["dep:reqwest"]
llm-openai    = ["dep:reqwest"]
llm-local     = ["dep:reqwest"]
```

**Why `default = ["llm-anthropic"]` is safe.** Enabling the feature
only pulls in `reqwest` (≈ 40 transitive crates behind rustls). It does
**not** change runtime behaviour — `provider_from_env()` defaults to
`Provider::Mock`, so plain `cargo test -p ogdb-eval` returns a
`DeterministicMockAdapter` and never touches the network. A CI
minimising build time can still opt out with `--no-default-features`.
Rationale: we want `cargo check -p ogdb-eval` to type-check the
Anthropic adapter without a flag, since Anthropic is the primary
target.

## 6. Failing-test matrix

Every test below panics with an `unimplemented!()` (or assertion-fail
against a `todo!()`-style stub response) in the RED commit. Each test
is standalone; env-touching tests serialise on a file-local
`static ENV_LOCK: Mutex<()>` the same way
`tests/skill_regression_threshold.rs:15` does.

| # | File :: test                                                                              | Build-features required                                                           | Asserts                                                                                                                                                                                                                                                                                                                                                                             | RED stub that fails it                                                                             |
|---|-------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| 1 | `real_llm_adapter_factory :: factory_picks_adapter_by_feature_flag`                       | default (llm-anthropic)                                                           | (a) `OGDB_SKILL_LLM_PROVIDER` unset ⇒ `resolve_adapter().unwrap()` is a `DeterministicMockAdapter` (round-trip: `respond(case).text == format!("[mock] {}", case.input)`). (b) `=anthropic` + no `ANTHROPIC_API_KEY` ⇒ `Err(SkillQualityError::Adapter("ANTHROPIC_API_KEY …"))`. (c) `=openai` with feature NOT enabled ⇒ `Err(Adapter("… built without feature llm-openai"))`. | `resolve_adapter` + `DeterministicMockAdapter::respond` + `AnthropicAdapter::from_env` → `unimplemented!()` |
| 2 | `real_llm_adapter_anthropic :: anthropic_formats_correct_request_body`                    | `llm-anthropic`                                                                   | Wiremock matches POST `/v1/messages` with headers `x-api-key: test-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body JSON has `model=="claude-haiku-4-5"`, `max_tokens==1024`, `messages[0].role=="user"`, `messages[0].content=="Find all Person nodes"`. Response `{"content":[{"type":"text","text":"MATCH (p:Person)"}]}` ⇒ `AdapterResponse.text=="MATCH (p:Person)"` and `latency_us > 0`. | `AnthropicAdapter::with_config` + `respond` → `unimplemented!()`                                   |
| 3 | `real_llm_adapter_openai :: openai_formats_correct_request_body`                          | `llm-openai` (CI command: `--no-default-features --features llm-openai`)          | Wiremock matches POST `/v1/chat/completions` with `Authorization: Bearer test-key`, body JSON has `model=="gpt-4o-mini"`, `messages[0].role=="user"`, `messages[0].content=="Find all Person nodes"`. Response `{"choices":[{"message":{"role":"assistant","content":"MATCH (p:Person)"}}]}` ⇒ `AdapterResponse.text=="MATCH (p:Person)"`.                           | `OpenAiAdapter::with_config` + `respond` → `unimplemented!()`                                      |
| 4 | `real_llm_adapter_errors :: adapter_handles_rate_limit_429`                               | `llm-anthropic`                                                                   | Wiremock returns `429` for first 2 matches, then `200 + valid body`. Adapter configured with `RetryPolicy { max_retries: 3, base_ms: 1 }`. `respond` returns `Ok` and text is extracted from the 3rd response. Wiremock verifies exactly 3 requests were received. A second sub-test: mock returns `429` every time ⇒ `Err(Adapter("rate limit: 429"))`. | shared `post_with_retry` → `unimplemented!()`                                                      |
| 5 | `real_llm_adapter_errors :: adapter_handles_malformed_response`                           | `llm-anthropic`                                                                   | Wiremock returns `200` with body `"not json at all"` ⇒ `Err(SkillQualityError::Adapter(msg))` where `msg.starts_with("json:")`. A second sub-test: `200` with valid JSON but wrong shape (`{"foo":"bar"}`) ⇒ `Err(Adapter("no text"))`.                                                                                                                                             | same stub                                                                                          |
| 6 | `real_llm_adapter_local :: local_adapter_honors_url_env`                                  | `llm-local` (CI command: `--no-default-features --features llm-local`)            | Wiremock server running at `<wm_url>`. `OGDB_LOCAL_LLM_URL=<wm_url>/v1/chat/completions` + `OGDB_LOCAL_LLM_MODEL=llama-3-8b` + `OGDB_SKILL_LLM_PROVIDER=local`. `resolve_adapter()` ⇒ `LocalAdapter`. `respond` hits wiremock (verified match), no `Authorization` header present, model in body is `llama-3-8b`. Mock returns OpenAI-shape body ⇒ `text` extracted correctly. | `LocalAdapter::from_env` + `respond` → `unimplemented!()`                                          |

### Tests 2–6 — wiremock skeleton

Every network test follows this shape (async harness, blocking adapter
driven via `spawn_blocking`):

```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn anthropic_formats_correct_request_body() {
    use wiremock::matchers::{header, method, path, body_json_string};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "test-key"))
        .and(header("anthropic-version", "2023-06-01"))
        // body matcher uses a predicate that unpacks JSON and checks fields
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "content": [{"type":"text","text":"MATCH (p:Person)"}]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let url = format!("{}/v1/messages", server.uri());
    let adapter = tokio::task::spawn_blocking(move || {
        ogdb_eval::drivers::real_llm_adapter::anthropic::AnthropicAdapter::with_config(
            url,
            "test-key".to_string(),
            "claude-haiku-4-5".to_string(),
            ogdb_eval::drivers::real_llm_adapter::RetryPolicy::defaults(),
        ).expect("adapter")
    }).await.expect("join");

    let case = sample_case();  // helper inside the test file
    let resp = tokio::task::spawn_blocking(move || adapter.respond(&case))
        .await.expect("join").expect("respond");

    assert_eq!(resp.text, "MATCH (p:Person)");
    assert!(resp.latency_us > 0, "latency must be measured");
}
```

### Env-global tests (tests 1, 6)

Those touch `OGDB_SKILL_LLM_PROVIDER` / `ANTHROPIC_API_KEY` /
`OGDB_LOCAL_LLM_URL`. They **must** lock a file-local `static
ENV_LOCK: Mutex<()>` to survive parallel `cargo test` execution, and
they **must** unset every var they set before returning (even on
assertion failure — use a drop guard or explicit
`remove_var` at end-of-test, accepting that panic-poisoning leaks state
to the next run, same contract as
`tests/skill_regression_threshold.rs`).

### RED-signal requirement

Each test must fail for the right reason. The Phase-2 stubs contain
`unimplemented!("real adapter lands in Phase 3")` in every public fn.
The `Cargo.toml` additions compile (reqwest is optional, wiremock is
dev-dep, tokio is dev-dep). The test files compile against the stub
signatures, then each `#[test]` panics with the `unimplemented!` text.
Specifically: **no** test passes in the RED commit.

## 7. Phase roadmap

| Phase | Description                                                                                                                                                                                                                                            | Branch / commit                                                           |
|-------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| 1     | *(done upstream — Dimension 4 skill-quality driver shipped at `cc82a1b`, closed-loop regression reporter at `fadde43`.)*                                                                                                                               | `main`                                                                    |
| **2 — this commit** | `.planning/real-llm-adapter/PLAN.md` + 5 failing `tests/real_llm_adapter_*.rs` files + `drivers/real_llm_adapter/{mod,anthropic,openai,local}.rs` stubs + `Cargo.toml` features and deps. Each test panics with `unimplemented!`. No GREEN. | `plan/real-llm-adapter`                                                    |
| 3     | Replace every `unimplemented!()` with real reqwest-blocking impls, retry logic, deterministic error mapping. Delete `StubRealAdapter` (retarget its test onto the new factory). Update `docs/IMPLEMENTATION-LOG.md`, `CHANGELOG.md`. Run `./scripts/test.sh`. | `feat/real-llm-adapter`                                                   |
| 4     | Wire the factory into `publish_baseline::run_all()` behind an opt-in flag so a CI job can exercise a real LLM on schedule (nightly / manual). Keep the default dry-run path on `MockAdapter`.                                                          | same branch or follow-on                                                  |
| 5     | Extend the same pattern to `ai_agent` driver once its adapter boundary crystalises — out of scope here.                                                                                                                                                | future plan                                                               |

### Phase-3 (GREEN) TODO list — do NOT do in Phase 2

1. Replace every `unimplemented!()` stub with real HTTP logic matching
   §3's error-mapping table.
2. Retarget
   `crates/ogdb-eval/tests/skill_quality_adapter.rs::stub_real_adapter_surfaces_unimplemented_error`
   onto the new factory — assert that
   `provider_from_env()` with `OGDB_SKILL_LLM_PROVIDER="anthropic"`
   and no API key returns `Err(Adapter(_))`. Remove `StubRealAdapter`.
3. Add `tokio` + `wiremock` feature-gates if integration surface grows
   (stays dev-only for now).
4. `./scripts/test.sh` + `./scripts/coverage.sh` before merge. Append
   `CHANGELOG.md` `[Unreleased]` entry and a row to
   `docs/IMPLEMENTATION-LOG.md`. Append `release-tests.manifest` on
   final merge.
5. Never `cargo test --workspace` — per-crate only.

## 8. Self-review checklist

- [x] Scope limited to `crates/ogdb-eval/` — every touched file is under that path.
- [x] No `ogdb-core` / `ogdb-cli` / `frontend/` / `mcp/` edits.
- [x] Every test in §6 has a matching failing stub in §5.
- [x] Three features (`llm-anthropic`, `llm-openai`, `llm-local`) all compile individually and in combination; default = `["llm-anthropic"]`.
- [x] Default `cargo test -p ogdb-eval` returns `MockAdapter` at runtime and makes zero network calls (provider env defaults to `"mock"`).
- [x] Retry policy is deterministic, configurable, and testable (`base_ms` injectable via `RetryPolicy::defaults()` or `RetryPolicy { base_ms: 1, … }`).
- [x] Error mapping table in §3 is authoritative — Phase 3 must preserve string prefixes so `msg.starts_with("rate limit:")` / `"json:"` / `"no text"` assertions in tests 4–5 keep working.
- [x] Env-global tests (1, 6) serialise on a `Mutex`, matching the `tests/skill_regression_threshold.rs` pattern.
- [x] No real network calls in any test — wiremock-only.
- [x] RED stubs compile (Cargo deps are declared, signatures match test call sites) and panic at runtime — not compile-error.
- [x] Cargo test instruction scoped: `cargo test -p ogdb-eval` (plus `--features` variants for feature-gated tests).

---

**Definition of done for Phase 2:** branch `plan/real-llm-adapter` has
this `PLAN.md` + the 5 new `tests/real_llm_adapter_*.rs` RED test files
+ the `drivers/real_llm_adapter/` module tree with stubs + the
`Cargo.toml` additions. The following invocations all exhibit the RED
signal (every test panics with `unimplemented!`):

```bash
cd /home/ashesh-goplani/opengraphdb
cargo build -p ogdb-eval --tests
cargo build -p ogdb-eval --tests --no-default-features --features llm-openai
cargo build -p ogdb-eval --tests --no-default-features --features llm-local
cargo build -p ogdb-eval --tests --features llm-anthropic,llm-openai,llm-local

cargo test -p ogdb-eval --test real_llm_adapter_factory    -- --nocapture
cargo test -p ogdb-eval --test real_llm_adapter_anthropic  -- --nocapture
cargo test -p ogdb-eval --test real_llm_adapter_openai     --no-default-features --features llm-openai -- --nocapture
cargo test -p ogdb-eval --test real_llm_adapter_errors     -- --nocapture
cargo test -p ogdb-eval --test real_llm_adapter_local      --no-default-features --features llm-local -- --nocapture
```

Nothing outside `crates/ogdb-eval/` is touched.
