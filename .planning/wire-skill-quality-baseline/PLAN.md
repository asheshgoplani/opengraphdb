# wire-skill-quality-baseline — publish_baseline emits dimension-4 skill_quality runs

> **Phase 2 artifact.** This document + the failing tests at
> `crates/ogdb-eval/tests/baseline_includes_skill_quality.rs` constitute
> the RED commit on branch `plan/wire-skill-quality-baseline`. Phases 3–5
> (GREEN) add the skill_quality step to `publish_baseline.rs`, wire the
> `LlmAdapter` factory behind a `resolve_or_fallback` helper, and record
> degraded-suite status in `EvaluationRun::environment`. Phases 6–8 are
> coverage + docs.

**Goal:** every v0.4 release cut produced by
`cargo test -p ogdb-eval --release --test publish_baseline` must emit
**one extra `EvaluationRun`** with `suite = "skill_quality"` alongside
the existing 14 runs, covering all four skill eval specs in
`skills/evals/*.eval.yaml`. The run defaults to `MockAdapter` (zero
network) in CI, honours `OGDB_SKILL_LLM_PROVIDER` for real-provider
runs, and never fails the release even if the LLM returns errors —
failures get recorded as `environment["suite_status"]="degraded"` and
the harness continues. The auto-summary markdown gains a
`skill_quality` section.

**Tech stack:** Rust 2021, `ogdb-eval` crate only. `ogdb-core`,
adapters, bindings, and transport code are untouched.

---

## 1. Problem summary — 14-run baseline has no dimension-4 signal

Today `publish_baseline.rs` emits exactly 14 runs covering six suites
(`ai_agent`, `graphalytics`, `ldbc_snb`, `resources`, `scaling`,
`throughput`). Run it against HEAD:

```bash
cd ~/opengraphdb
OGDB_EVAL_BASELINE_JSON=/tmp/baseline.json \
  cargo test -p ogdb-eval --release --test publish_baseline -- --nocapture
jq '[.[] | .suite] | unique' /tmp/baseline.json
```

Actual output:
```json
["ai_agent", "graphalytics", "ldbc_snb", "resources", "scaling", "throughput"]
```

**`skill_quality` is absent.** The dimension-4 driver at
`crates/ogdb-eval/src/drivers/skill_quality.rs:342` (`pub fn run`) has
never been invoked from the release harness, and none of the four spec
files under `skills/evals/` have ever been scored at release time. Any
regression in skill-response quality will ship silently.

### 1.1 Why this is a release-readiness gap

- `.planning/skill-quality-dimension/PLAN.md` § "release integration"
  says dimension-4 must be part of every baseline cut so the diff
  engine at `crates/ogdb-eval/src/lib.rs:197+`
  (`DiffEngine::skill_quality_diff`) has a prior to compare against.
- Without a baseline entry, the first time skill quality gets scored
  at release, the diff engine has no pair and no regression can fire.
- The factory at
  `crates/ogdb-eval/src/drivers/real_llm_adapter/mod.rs:107`
  (`resolve_adapter`) already defaults to the deterministic
  `DeterministicMockAdapter` when `OGDB_SKILL_LLM_PROVIDER` is unset
  — CI requires zero glue to run mock-mode.

## 2. Exact reproducer

**Running `publish_baseline` today emits 14 runs, none are
`skill_quality`.** The command in §1 demonstrates this. After this
plan lands, the same command must emit 15 runs where exactly one has
`suite == "skill_quality"`, and the auto-summary markdown must gain a
`## skill_quality` section.

## 3. Data-flow trace (mock mode → release baseline JSON)

```
┌─────────────────────────────────────────────────────────────────┐
│ cargo test --release --test publish_baseline                    │
│   OGDB_EVAL_BASELINE_JSON=/tmp/baseline.json (gate, required)   │
│   OGDB_EVAL_BASELINE_MD  =/tmp/auto-summary.md  (optional)      │
│   OGDB_SKILL_LLM_PROVIDER=<unset>                (mock default) │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ publish_full_suite_baseline()                                   │
│   crates/ogdb-eval/tests/publish_baseline.rs:22                 │
│   - builds workdir sibling of JSON out                          │
│   - runs RunAllConfig::full()     → 12 runs                     │
│   - graphalytics BFS + PageRank   →  2 runs                     │
│   - criterion_ingest              →  0 runs at HEAD             │
│                                                                 │
│   NEW: skill_quality step           → 1 run                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ resolve_adapter_or_fallback()            (NEW, in publish_…)    │
│  1. real_llm_adapter::resolve_adapter()  → Result<Box<dyn …>>   │
│  2. Ok(adapter)  → use it                                       │
│     Err(e)       → warn + Box::new(DeterministicMockAdapter)    │
│                    also records "factory-failed" flag so the    │
│                    run gets tagged degraded if scoring proceeds │
│                    on mock instead of the requested provider    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ skill_quality::run(&specs_dir, &*adapter)                       │
│   crates/ogdb-eval/src/drivers/skill_quality.rs:342             │
│                                                                 │
│ specs_dir resolution (NEW, in publish_…):                       │
│   env!("CARGO_MANIFEST_DIR") = crates/ogdb-eval                 │
│   specs_dir = manifest.join("../../skills/evals")               │
│     → 4 spec files, 40+ cases                                   │
│                                                                 │
│ Inside run():                                                   │
│   load_specs_from_dir(specs_dir)                                │
│   for spec in specs:                                            │
│     for case in spec.cases:                                     │
│       adapter.respond(case)  ← may return Err                   │
│                                                                 │
│ If Err bubbles up, the NEW wrapper catches it:                  │
│   Ok(run)  → push run unchanged                                 │
│   Err(e)   → log warning, synthesize a degraded skeleton run    │
│              (suite=skill_quality, metric pass_rate=0.0),       │
│              push it anyway so the count stays stable           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Mark suite_status in EvaluationRun                              │
│   run.environment.insert(                                       │
│     "suite_status".into(),                                      │
│     if factory_or_respond_failed { "degraded" } else { "ok" }   │
│   );                                                            │
│   (environment is BTreeMap<String,String> — already serde'd)    │
│   Rationale: avoid schema migration; the field is visible in    │
│   the JSON output for downstream tooling.                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ runs.push(skill_quality_run)                                    │
│ serde_json::to_string_pretty(&runs) → JSON array of 15 runs     │
│ std::fs::write(json_out, …)                                     │
│ if md_out.is_some(): write_benchmarks_md(&runs, md_out)         │
│   (unchanged — the existing loop already prints every run's     │
│    suite header, so skill_quality auto-shows once pushed)       │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight.** `write_benchmarks_md` at
`crates/ogdb-eval/src/drivers/cli_runner.rs:195–228` iterates every
run and prints `(suite, subsuite, metric, value, unit)` rows. Pushing
a `suite="skill_quality"` run is **sufficient** to get a `skill_quality`
section in the auto-summary — no markdown-writer change required.

### 3.1 Errors are never fatal

Three error surfaces exist inside the new step:

| # | Surface | Action | Status tag |
|---|---------|--------|------------|
| 1 | `resolve_adapter()` returns `Err` | log, fall back to `DeterministicMockAdapter` | `degraded` |
| 2 | `load_specs_from_dir` returns `Err` | log, skip skill_quality entirely (no run pushed) | _(n/a)_ |
| 3 | `adapter.respond()` returns `Err` inside `run()` | log, push skeleton run with pass_rate=0.0 | `degraded` |

Only #2 skips the run — if the specs dir is genuinely missing,
producing a zero-case run is worse than omitting it, because the
aggregator would emit `NaN` percentiles.

## 4. Failing tests (RED) — committed in this branch

All tests live at `crates/ogdb-eval/tests/baseline_includes_skill_quality.rs`
on `plan/wire-skill-quality-baseline`. They MUST fail against HEAD
`e09aa4d` (the UNWIND merge commit this branch forked from), and MUST
pass after Phases 3–5 (GREEN). None of them set
`OGDB_EVAL_BASELINE_JSON` — they call **a newly-exposed helper**,
`append_skill_quality_run`, directly, so they run in debug mode in
≤2 s each.

| # | Test name | Assertion |
|---|-----------|-----------|
| 1 | `mock_mode_adds_one_skill_quality_run` | Call `append_skill_quality_run(&mut runs)` with `OGDB_SKILL_LLM_PROVIDER` unset. `runs.len()` grows by exactly 1. The new run has `suite == "skill_quality"`. |
| 2 | `skill_quality_run_has_one_pass_rate_per_skill` | Same call, then assert the appended run's `metrics` contains exactly four skill-prefixed `pass_rate_*` keys matching `["pass_rate_data_import","pass_rate_graph_explore","pass_rate_ogdb_cypher","pass_rate_schema_advisor"]`. |
| 3 | `llm_adapter_failure_does_not_panic` | Use a `FailingAdapter` shim (test-only struct that always returns `Err(SkillQualityError::Adapter(...))`) via a new `append_skill_quality_run_with_adapter` entrypoint. Assert the function returns `Ok`, `runs.len()` grows by exactly 1, and the appended run has `environment["suite_status"] == "degraded"`. |
| 4 | `auto_summary_lists_skill_quality_section` | Build a `Vec<EvaluationRun>` containing at minimum one `skill_quality` run via `append_skill_quality_run`, write to a tempdir via `write_benchmarks_md`, read back, assert the markdown body contains the substring `"\| skill_quality \|"` at least once. |

Why these four cover the behaviour:

- **#1** locks in that the release harness emits the missing suite.
- **#2** locks in fan-out: one metric per skill in `skills/evals/`.
  If someone adds a fifth spec, this test turns red deliberately so
  the authors update the assertion — a forced review gate.
- **#3** locks in the "LLM flake ≠ release block" guarantee, which is
  the whole reason this plan is separate from the GREEN of
  real_llm_adapter.
- **#4** locks in the auto-summary coverage. Currently there's no
  rendering of skill_quality; this flips to green as a side effect
  of writing the first run with `suite="skill_quality"` — but locking
  it down means nobody can later "simplify" `write_benchmarks_md` to
  only handle a whitelist of suites.

### 4.1 Why the helper is worth extracting

`publish_baseline.rs` is already a `#[test]`. Calling a gated release
test from another test fights the env-var gate and requires
spawning a child `cargo` process. Extracting
`append_skill_quality_run(runs: &mut Vec<EvaluationRun>)` (Phase 3)
into `crates/ogdb-eval/src/drivers/cli_runner.rs` as a public helper
costs ~20 lines and keeps the RED tests pure, fast, and hermetic.
The release-mode harness then calls the same helper, so test #1
really does exercise the code path that runs at release time.

## 5. Implementation sketch (Phases 3–5 GREEN) — ~50 lines total

### 5.1 New public helper in `cli_runner.rs` (Phase 3)

Add next to `write_benchmarks_md` at
`crates/ogdb-eval/src/drivers/cli_runner.rs:195`:

```rust
use crate::drivers::real_llm_adapter::{resolve_adapter, DeterministicMockAdapter};
use crate::drivers::skill_quality::{self, LlmAdapter};
use std::path::Path;

/// Append one `skill_quality` EvaluationRun to `runs`, using the
/// factory-selected adapter (mock by default). Tolerant of adapter
/// failures — the run is still pushed, tagged `suite_status=degraded`.
/// Returns `Ok(())` unless the specs directory itself is missing.
pub fn append_skill_quality_run(
    runs: &mut Vec<EvaluationRun>,
) -> Result<(), RunAllError> {
    // skills/evals is two levels up from crates/ogdb-eval
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let specs_dir = manifest.join("..").join("..").join("skills").join("evals");
    if !specs_dir.is_dir() {
        eprintln!(
            "skill_quality: specs dir not found at {} — skipping",
            specs_dir.display()
        );
        return Ok(()); // not a hard error; keeps release resilient
    }

    let (adapter, factory_degraded) = match resolve_adapter() {
        Ok(a) => (a, false),
        Err(e) => {
            eprintln!("skill_quality: adapter factory failed ({e}); falling back to mock");
            (Box::new(DeterministicMockAdapter) as Box<dyn LlmAdapter>, true)
        }
    };

    append_skill_quality_run_with_adapter(runs, adapter.as_ref(), factory_degraded)
}

/// Test seam — takes an explicit adapter so RED tests can inject a
/// FailingAdapter without touching env vars.
pub fn append_skill_quality_run_with_adapter(
    runs: &mut Vec<EvaluationRun>,
    adapter: &dyn LlmAdapter,
    factory_degraded: bool,
) -> Result<(), RunAllError> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let specs_dir = manifest.join("..").join("..").join("skills").join("evals");

    let (mut run, degraded) = match skill_quality::run(&specs_dir, adapter) {
        Ok(r) => (r, factory_degraded),
        Err(e) => {
            eprintln!("skill_quality: driver failed ({e}); emitting degraded skeleton");
            let skeleton = degraded_skill_quality_skeleton();
            (skeleton, true)
        }
    };
    run.environment.insert(
        "suite_status".into(),
        if degraded { "degraded".into() } else { "ok".into() },
    );
    runs.push(run);
    Ok(())
}

fn degraded_skill_quality_skeleton() -> EvaluationRun {
    use crate::drivers::common::{evaluation_run_skeleton, metric};
    let mut run = evaluation_run_skeleton("skill_quality", "all", "skills-degraded");
    run.metrics.insert("pass_rate".into(), metric(0.0, "ratio", true));
    run.metrics.insert("total_cases".into(), metric(0.0, "count", false));
    run
}
```

### 5.2 Wire helper into the release harness (Phase 4)

Modify `crates/ogdb-eval/tests/publish_baseline.rs` — insert one call
between the criterion-ingest block (`:78`) and the JSON serialisation
(`:81`):

```rust
// Dimension-4: skill quality. Mock adapter by default — set
// OGDB_SKILL_LLM_PROVIDER=anthropic|openai|local to exercise real
// adapters. LLM failures are recorded, not propagated, so a flaky
// external API cannot block a v0.4 release cut.
if let Err(e) = cli_runner::append_skill_quality_run(&mut runs) {
    eprintln!("  skill_quality step FAILED: {e}");
}
eprintln!("  runs now total: {}", runs.len());
```

`use` line at top of file (merge with the existing `cli_runner`
import):
```rust
use ogdb_eval::drivers::cli_runner::{self, run_all, write_benchmarks_md, RunAllConfig};
```

### 5.3 No schema migration (Phase 5)

`EvaluationRun::environment` is already
`BTreeMap<String, String>` at
`crates/ogdb-eval/src/lib.rs:36`, serde-default, safe for
backward-compat reads. `suite_status=degraded` goes there. **No
change to `EvaluationRun` struct**, no schema-version bump.

## 6. Scope

- **Touched files:**
  - `crates/ogdb-eval/tests/publish_baseline.rs` (+3 lines)
  - `crates/ogdb-eval/src/drivers/cli_runner.rs` (+50 lines: two
    `pub fn`s + one helper)
  - `crates/ogdb-eval/tests/baseline_includes_skill_quality.rs`
    (new file, ~120 lines)
- **NOT touched:**
  - `ogdb-core`, bindings, HTTP server, CLI, storage.
  - `crates/ogdb-eval/src/drivers/skill_quality.rs` (driver already
    complete — we only consume its public `run`).
  - `crates/ogdb-eval/src/drivers/real_llm_adapter/*` (factory already
    works — we only consume `resolve_adapter`).
  - `crates/ogdb-eval/src/lib.rs::EvaluationRun` (schema unchanged).
- **No new feature flags.** The existing
  `ogdb-eval/Cargo.toml::default = ["llm-anthropic"]` already brings
  in the factory; we just call `resolve_adapter()` which defaults to
  `DeterministicMockAdapter` when `OGDB_SKILL_LLM_PROVIDER` is unset.
- **Per-crate tests only.** `cargo test -p ogdb-eval` is the single
  verification command — no workspace-wide sweeps.

## 7. 8-phase TDD breakdown

| Phase | Deliverable | Verification |
|-------|-------------|--------------|
| 1 | Context reading + data-flow trace (this doc §3) | PR review |
| 2 | RED — this PLAN.md + failing tests committed | `cargo test -p ogdb-eval --test baseline_includes_skill_quality` → all 4 red |
| 3 | GREEN — `append_skill_quality_run*` in `cli_runner.rs` | Tests #1, #2, #3, #4 green |
| 4 | GREEN — call site in `publish_baseline.rs` | Release harness smoke: `OGDB_EVAL_BASELINE_JSON=/tmp/b.json cargo test -p ogdb-eval --release --test publish_baseline`; `jq 'length' /tmp/b.json` → 15; `jq '[.[] | .suite] | unique' /tmp/b.json` includes `"skill_quality"` |
| 5 | Confirm auto-summary section | Same smoke + `OGDB_EVAL_BASELINE_MD=/tmp/a.md`; `grep '\| skill_quality \|' /tmp/a.md` → ≥1 match |
| 6 | Real-LLM smoke (manual) | `OGDB_SKILL_LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=… cargo test -p ogdb-eval --release --test publish_baseline` → run has `suite_status=ok` and realistic `pass_rate` |
| 7 | `CHANGELOG.md` entry under `## [Unreleased]` | `scripts/changelog-check.sh` passes |
| 8 | `docs/IMPLEMENTATION-LOG.md` entry | `scripts/workflow-check.sh` passes |

## 8. Open questions (resolved)

- **Q1.** User prompt mentions `OGDB_LLM_PROVIDER`; code uses
  `OGDB_SKILL_LLM_PROVIDER`. **Resolution:** follow the code. The real
  factory consults `OGDB_SKILL_LLM_PROVIDER`. Document in CHANGELOG.
- **Q2.** Should `suite_status` be a first-class field on
  `EvaluationRun`? **Resolution:** no — use `environment` map. Scope
  explicitly forbids schema changes and `environment` is the documented
  escape hatch at `lib.rs:36`.
- **Q3.** What if `skills/evals/` is missing at release time?
  **Resolution:** log + no-op (skip the run). Missing specs is a
  workspace-corruption situation, not a degraded-LLM situation; a
  zero-case skill_quality run would produce NaN metrics and pollute
  the baseline.
- **Q4.** Why not add a new `suite_status` column to the auto-summary
  table? **Resolution:** not in scope. The JSON baseline is the source
  of truth; the markdown is a summary. If operators want status
  visibility they can `jq '.[] | select(.environment.suite_status ==
  "degraded")' baseline.json`.
