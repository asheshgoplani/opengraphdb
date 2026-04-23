# skill-quality-dimension — Evaluator Harness Dimension 4

> **Phase 2 artifact.** This document + the failing tests under
> `crates/ogdb-eval/tests/skill_quality_*.rs` are the RED commit. Phase 3
> (GREEN) replaces the `unimplemented!()` stubs in
> `crates/ogdb-eval/src/drivers/skill_quality.rs` with the real
> loader/scorer/aggregator/driver implementation.

**Goal:** add the 4th evaluator dimension — *skill quality* — so the
closed-loop harness can measure how well an AI agent performs against each
of our shipped skills (`skills/evals/*.eval.yaml`) and feed those metrics
into `JsonlHistory` + `DiffEngine` alongside throughput, latency, and
AI-agent dimensions.

**Tech stack:** Rust 2021, `serde_json` (already a dep), a new `regex = "1"`
crate-local dep in Phase 3, `ogdb-eval` only. No new workspace members.

---

## 1. Problem summary — why this matters

OpenGraphDB ships **four first-class skills**
(`data-import`, `graph-explore`, `ogdb-cypher`, `schema-advisor`) plus a
parallel family of `.eval.yaml` suites that encode golden behaviour: per
case we have `input`, `context`, `expected.must_contain`,
`expected.must_not_contain`, `expected.pattern`, and a `scoring` weight
map. Today **nothing reads those files**. A skill prompt can silently
regress in the Markdown body without any test turning red.

The closed-loop evaluator already has three dimensions producing
`EvaluationRun`s (throughput, LDBC SNB, AI-agent). Adding **skill quality
as Dimension 4** gives us:

1. A gate that catches skill prose regressions the same way `diff_engine`
   catches a p99 latency blow-up.
2. A stream of per-skill / per-difficulty pass-rates that the `recursive
   skill improvement` follow-on can use to auto-trigger conductor replan
   sessions when a skill's pass-rate drops below baseline.
3. A pluggable `LlmAdapter` trait so the same harness runs against a local
   mock (deterministic CI) today and a real LLM (`claude-haiku-4-5`,
   `ollama`, whatever) tomorrow without touching the scorer or the
   aggregator.

## 2. Exact reproducer

```console
$ cd /home/ashesh-goplani/opengraphdb
$ grep -r "skill_quality" crates/ogdb-eval 2>&1
$ ls crates/ogdb-eval/tests/skill_quality*.rs 2>&1
ls: cannot access 'crates/ogdb-eval/tests/skill_quality*.rs': No such file or directory
$ cargo test -p ogdb-eval --test skill_quality_driver 2>&1 | tail -5
error: no test target named `skill_quality_driver` in package `ogdb-eval`
```

Nothing exists. No driver, no loader, no test, no module wiring. The four
`.eval.yaml` files have sat on disk as inert data since they shipped.

## 3. Data-flow trace

```
┌───────────────────────────────────────────────────────────────────────┐
│ skills/evals/*.eval.yaml   (JSON-in-yaml-extension — 4 files today)   │
└────────────────────┬──────────────────────────────────────────────────┘
                     │ load_specs(dir)  → Vec<SkillSpec>
                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ SkillSpec { skill, version, description, cases: Vec<EvalCase> }       │
│ EvalCase  { name, difficulty, input, context, expected, scoring }     │
└────────────────────┬──────────────────────────────────────────────────┘
                     │ for case in spec.cases { adapter.respond(case) }
                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ trait LlmAdapter        ← pluggable:                                  │
│   fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, …>;   │
│                                                                       │
│   MockAdapter<F>        — takes `Fn(&EvalCase) -> AdapterResponse`,   │
│                          deterministic + zero I/O (used by every test) │
│   StubRealAdapter       — returns Unimplemented (Phase 5 fills in)    │
└────────────────────┬──────────────────────────────────────────────────┘
                     │ AdapterResponse { text, latency_us }
                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ pure fn score_case(case, resp) -> CaseResult                          │
│ ─ must_contain:      every item is a substring of resp.text           │
│ ─ must_not_contain:  none of the items appear in resp.text            │
│ ─ pattern:           regex::Regex::new(pat).is_match(&resp.text)      │
│ ─ score:             sum(weight for each scoring-dict key whose name  │
│                      matches a substring heuristic in resp.text)      │
│                      / sum(all weights)  ∈ [0.0, 1.0]                 │
│ ─ passed: must_contain ∧ ¬must_not_contain ∧ pattern                  │
└────────────────────┬──────────────────────────────────────────────────┘
                     │ Vec<CaseResult>
                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ aggregate(results) -> EvaluationRun                                   │
│   suite    = "skill_quality"                                          │
│   subsuite = "all"            (single-subsuite for now)               │
│   dataset  = "skills-v<max-spec-version>"                             │
│   metrics  = {                                                        │
│     "pass_rate":             higher_is_better=true  unit="ratio"      │
│     "avg_score":             higher_is_better=true  unit="ratio"      │
│     "total_cases":           higher_is_better=false unit="count"      │
│     "cases_failed":          higher_is_better=false unit="count"      │
│     "pass_rate_easy":        higher_is_better=true  unit="ratio"      │
│     "pass_rate_medium":      higher_is_better=true  unit="ratio"      │
│     "pass_rate_hard":        higher_is_better=true  unit="ratio"      │
│     "pass_rate_<skill>":     one per skill (slug-normalised)          │
│     "latency_p50_us":        higher_is_better=false unit="us"         │
│     "latency_p95_us":        higher_is_better=false unit="us"         │
│     "latency_p99_us":        higher_is_better=false unit="us"         │
│   }                                                                   │
└────────────────────┬──────────────────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ JsonlHistory::append(run, path)   (existing)                          │
│ DiffEngine::diff(baseline, current)                                   │
│   — `pass_rate` and every `pass_rate_*` fall into the `quality_pct`   │
│     threshold bucket via `category_threshold` because the metric name │
│     contains "rate" / "quality" sibling: **extend** the category      │
│     matcher in Phase 3 so `pass_rate` lands in `quality_pct` (today   │
│     it would be classified as `throughput_pct` because               │
│     higher_is_better=true). See §7 "Phase-3 TODO list" item 4.        │
└────────────────────┬──────────────────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ publish_baseline.rs / RunAllConfig::{quick,full}                      │
│   — Phase 3 wires `skill_quality::run(&specs_dir, &MockAdapter::…)`   │
│     into `run_all()` so the baseline JSON carries a 4th run.          │
└───────────────────────────────────────────────────────────────────────┘
```

**Hot-path I/O budget:** the only I/O in `run(specs_dir, adapter)` is the
one-shot directory walk + `serde_json::from_str` per spec file. Scoring,
aggregation, and percentile math are pure. With a `MockAdapter` tests
stay well under 1 s — target <100 ms for the full 5-test suite.

## 4. Scope boundaries

**In scope (this plan touches only):**
- `crates/ogdb-eval/src/drivers/skill_quality.rs`  (new)
- `crates/ogdb-eval/src/drivers/mod.rs`             (one-line re-export)
- `crates/ogdb-eval/tests/skill_quality_loader.rs`  (new)
- `crates/ogdb-eval/tests/skill_quality_scorer.rs`  (new)
- `crates/ogdb-eval/tests/skill_quality_aggregator.rs` (new)
- `crates/ogdb-eval/tests/skill_quality_adapter.rs` (new)
- `crates/ogdb-eval/tests/skill_quality_driver.rs`  (new)
- `crates/ogdb-eval/Cargo.toml`                     (Phase 3: add `regex = "1"`)
- `skills/evals/*.eval.yaml`                        (read-only in this plan)

**Explicitly out of scope:**
- `ogdb-core`, `ogdb-cli`, `ogdb-bench`, any other crate.
- Wiring into `RunAllConfig::run_all` (Phase 4 follow-on).
- A real LLM adapter (Phase 5 follow-on). `StubRealAdapter` lives in the
  module but returns `Unimplemented` and is never called from tests.
- Extending `DiffEngine::category_threshold` to map `pass_rate` into the
  `quality_pct` bucket (Phase 3 follow-on — tracked below).
- `docs/IMPLEMENTATION-LOG.md` / `CHANGELOG.md` entries (Phase 3 when the
  behaviour actually ships GREEN).

## 5. Module + type design (Phase 3 shape — what the stubs will become)

```rust
// crates/ogdb-eval/src/drivers/skill_quality.rs

use crate::drivers::common::{evaluation_run_skeleton, metric, percentiles};
use crate::EvaluationRun;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum SkillQualityError {
    #[error("io: {0}")]    Io(#[from] std::io::Error),
    #[error("parse: {0}")] Parse(#[from] serde_json::Error),
    #[error("invalid spec: {0}")] Invalid(&'static str),
    #[error("adapter: {0}")] Adapter(String),
    #[error("unimplemented: {0}")] Unimplemented(&'static str),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SkillSpec {
    pub skill: String,
    pub version: String,
    #[serde(default)] pub description: String,
    pub cases: Vec<EvalCase>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvalCase {
    pub name: String,
    pub difficulty: Difficulty,
    pub input: String,
    #[serde(default)] pub context: serde_json::Value,
    pub expected: Expected,
    #[serde(default)] pub scoring: std::collections::BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty { Easy, Medium, Hard }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Expected {
    #[serde(default)] pub must_contain: Vec<String>,
    #[serde(default)] pub must_not_contain: Vec<String>,
    #[serde(default)] pub pattern: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AdapterResponse { pub text: String, pub latency_us: u64 }

pub trait LlmAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError>;
}

pub struct MockAdapter<F: Fn(&EvalCase) -> AdapterResponse>(pub F);
impl<F: Fn(&EvalCase) -> AdapterResponse> LlmAdapter for MockAdapter<F> {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Ok((self.0)(case))
    }
}

pub struct StubRealAdapter;
impl LlmAdapter for StubRealAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Err(SkillQualityError::Unimplemented("real LLM adapter lands in Phase 5"))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CaseResult {
    pub skill: String,
    pub case_name: String,
    pub difficulty: Difficulty,
    pub passed: bool,
    pub score: f64,
    pub latency_us: u64,
}

// All pure functions — no I/O, no threading:
pub fn load_specs_from_dir(dir: &Path) -> Result<Vec<SkillSpec>, SkillQualityError>;
pub fn parse_spec(json: &str) -> Result<SkillSpec, SkillQualityError>;
pub fn score_case(case: &EvalCase, resp: &AdapterResponse, skill: &str) -> CaseResult;
pub fn aggregate(results: &[CaseResult]) -> EvaluationRun;

// Public entry point:
pub fn run(specs_dir: &Path, adapter: &dyn LlmAdapter)
    -> Result<EvaluationRun, SkillQualityError>;
```

Every public function above exists as an `unimplemented!()` stub in the
Phase 2 commit. Tests call them and panic at runtime — standard RED.

## 6. Failing test inventory

All 8 tests required by the spec plus one extra real-file smoke test live
in these five files. Every test must panic with an `unimplemented!` or
assertion-fail message in the RED commit.

| File | Test | What it proves |
|------|------|----------------|
| `skill_quality_loader.rs` | `loader_parses_yaml_shipped_spec`      | `parse_spec` accepts the shipped `ogdb-cypher.eval.yaml` body, surfaces `skill`, `version`, and all 13 cases.  |
| `skill_quality_loader.rs` | `loader_rejects_missing_cases`         | `parse_spec` rejects a spec with no `cases` array (`SkillQualityError::Invalid`).  |
| `skill_quality_scorer.rs` | `scorer_accepts_matching_response`     | `score_case` returns `passed=true, score=1.0` when every `must_contain` substring, `pattern`, and all scoring keys hit.  |
| `skill_quality_scorer.rs` | `scorer_rejects_must_not_contain_violation` | `score_case` returns `passed=false` when a single `must_not_contain` entry is present in response text, regardless of `must_contain` hits.  |
| `skill_quality_aggregator.rs` | `pass_rate_math_is_ratio_of_passed_to_total` | `aggregate` emits `pass_rate = passed / total` with `higher_is_better=true`.  |
| `skill_quality_aggregator.rs` | `per_difficulty_breakdown_emitted`    | `aggregate` emits `pass_rate_easy`, `pass_rate_medium`, `pass_rate_hard` — each equals the per-bucket passed/total, or `0.0` when that bucket is empty.  |
| `skill_quality_aggregator.rs` | `response_latency_percentiles_emitted` | `aggregate` emits `latency_p50_us ≤ latency_p95_us ≤ latency_p99_us` derived from `CaseResult.latency_us` via `common::percentiles`.  |
| `skill_quality_adapter.rs` | `mock_adapter_is_deterministic`        | Two invocations of a `MockAdapter` closure with the same input return byte-identical `AdapterResponse` and identical `latency_us`.  |
| `skill_quality_driver.rs` | `integration_with_evaluation_run_schema` | `run(specs_dir, &MockAdapter)` round-trips through `EvaluationRun::to_json` → `from_json` unchanged (suite = `skill_quality`, `schema_version` = `SCHEMA_VERSION`).  |

### RED-signal requirement

Each test must fail for the right reason. Stubs return
`unimplemented!("…")` — panic text surfaced in the assertion chain is
recognisable and *not* a tautology like `assert!(true)`. Every assertion
names an actual property of the future GREEN behaviour.

## 7. Phase roadmap (this plan covers Phase 2 only)

| Phase | Description | Branch / commit |
|-------|-------------|-----------------|
| **1** | *(done upstream — evaluator harness baseline, 3 dimensions live.)* | `main` already has `EvaluationRun`, `DiffEngine`, `JsonlHistory`, `throughput`, `ldbc_snb`, `ai_agent`. |
| **2 — this commit** | `.planning/skill-quality-dimension/PLAN.md` + 5 failing test files + `skill_quality.rs` stub module wired into `drivers/mod.rs`. | `plan/skill-quality-dimension` |
| **3** | Replace stubs with GREEN impl; add `regex = "1"` to `ogdb-eval/Cargo.toml`; extend `category_threshold` in `lib.rs` so `pass_rate*` maps to `quality_pct`; update `docs/IMPLEMENTATION-LOG.md` + `CHANGELOG.md`. | `feat/skill-quality-dimension` |
| **4** | Wire `skill_quality::run` into `RunAllConfig::quick` and `publish_baseline.rs`; regenerate baseline JSON + `BENCHMARKS.md` table. | same branch or follow-on |
| **5** | `RealAdapter` backed by a local LLM (`claude-haiku-4-5` via API, or ollama). Gated behind an env var so CI stays deterministic. | `feat/skill-quality-real-adapter` |
| **6 — recursive skill improvement** | Conductor auto-triggers a replan session whenever `DiffEngine` emits a `Regression` on `pass_rate_*`. | separate plan |

### Phase-3 TODO list (deferred — do NOT do in Phase 2)

1. Implement every `unimplemented!()` stub in `skill_quality.rs`.
2. Add `regex = "1"` to `[dependencies]` in `crates/ogdb-eval/Cargo.toml`.
3. Compile-guard the regex `Regex::new` call behind `?` so a malformed
   pattern surfaces as `SkillQualityError::Invalid("bad regex")`.
4. In `crates/ogdb-eval/src/lib.rs::category_threshold`, extend the name
   classifier so any metric whose name contains `"pass_rate"` falls into
   `quality_pct` even though `higher_is_better=true`.
5. Add `skill_quality` as a field in `RunAllConfig::quick` (Phase 4).
6. Append one `## [Unreleased]` entry to `CHANGELOG.md` and one row to
   `docs/IMPLEMENTATION-LOG.md`.

## 8. Verification commands (RED signal in Phase 2)

```bash
cd /home/ashesh-goplani/opengraphdb
# Compiles (stub module + deserde structs are valid):
cargo build -p ogdb-eval --tests

# Each test panics with "unimplemented" — that is the expected RED:
cargo test -p ogdb-eval --test skill_quality_loader     -- --nocapture
cargo test -p ogdb-eval --test skill_quality_scorer     -- --nocapture
cargo test -p ogdb-eval --test skill_quality_aggregator -- --nocapture
cargo test -p ogdb-eval --test skill_quality_adapter    -- --nocapture
cargo test -p ogdb-eval --test skill_quality_driver     -- --nocapture
```

> ⚠️ **DO NOT** run `cargo test --workspace` — other crates in the workspace
> tie into peer tmux sessions. Per-crate `cargo test -p ogdb-eval` only.

## 9. Risks, non-goals, open questions

- **Regex engine choice.** The `pattern` field in shipped specs uses POSIX
  ERE syntax. Rust `regex` crate rejects look-around. Scanned the 34
  patterns across the 4 eval files — none use `(?=`, `(?!`, or
  back-references. Safe.
- **Difficulty enum coverage.** Only `easy | medium | hard` appear in any
  shipped spec. Locking the enum to those three and failing the
  deserializer on an unknown value keeps the scorer honest. If a future
  spec adds `expert`, that's a compile-time failure we want.
- **Case context heterogeneity.** `context` is an open `serde_json::Value`
  because schemas differ (`data-import` uses a `data` string,
  `ogdb-cypher` uses a nested `schema` object, `graph-explore` uses `{}`).
  Passing it through to the adapter unchanged is correct.
- **Scoring heuristic.** Phase 3 maps scoring-dict keys to simple
  substring checks on the response text (e.g. key `uses_merge_not_create`
  → looks for `MERGE` and absence of `CREATE`). This is deliberately
  shallow — it's measuring the *skill prose*, not the LLM. Phase 5 can
  replace the heuristic with a proper rubric-graded adapter.
- **Non-goal:** no semantic equivalence check between generated Cypher
  and a reference query — that's Dimension 5 (query-correctness) and out
  of scope here.

---

**Definition of done for Phase 2:** branch `plan/skill-quality-dimension`
has this `PLAN.md` + the 5 `skill_quality_*.rs` RED test files + the
`drivers/skill_quality.rs` stub + `drivers/mod.rs` updated. Each of the 8
required tests panics with an `unimplemented!` message when run. Nothing
outside `crates/ogdb-eval/` is touched.
