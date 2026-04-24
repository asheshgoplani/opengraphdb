# recursive-skill-improvement — closed-loop skill regression detection

> **Phase 2 artifact.** This document + the failing tests under
> `crates/ogdb-eval/tests/skill_regression_*.rs` constitute the RED commit
> on branch `plan/recursive-skill-improvement`. Phase 3 (GREEN) replaces
> the `unimplemented!()` stubs in `crates/ogdb-eval/src/skill_regression.rs`
> (new) and the `run_with_diagnostics` stub in
> `crates/ogdb-eval/src/drivers/skill_quality.rs` with the real
> implementations that satisfy every assertion below.

**Goal:** close the outer loop of the evaluator harness — when a
`skill_quality` EvaluationRun regresses against baseline, emit a
machine-readable `skill_regression_report.json` that lists the regressed
skills, the failing cases inside each one, and a one-line "next plan"
hint the conductor file-watcher can use to launch a targeted plan
session. This is the *recursive* step: the evaluator's output drives the
conductor's next plan.

**Tech stack:** Rust 2021, `serde_json` (already a workspace dep),
existing `ogdb-eval` crate only. No new runtime dependencies.

---

## 1. Problem summary — why this matters for closed-loop autonomy

Dimension 4 (skill quality) shipped in commit `cc82a1b` and now produces
`EvaluationRun`s with per-skill `pass_rate_<skill>` metrics alongside the
headline `pass_rate`, `avg_score`, and difficulty breakdowns. But the
harness currently stops there:

1. `DiffEngine::diff` compares metrics name-by-name, so it *will* notice
   a `pass_rate` drop — but it classifies `pass_rate` as a
   `throughput_pct` metric (5% threshold) because `pass_rate` is
   `higher_is_better=true` and the substring matcher in
   `category_threshold` only routes to `quality_pct` on
   `ndcg|recall|mrr|precision`. A 4% skill regression today is therefore
   missed; a 6% regression emits a generic `Regression { metric:
   "pass_rate", … }` event with no per-skill context.
2. There is no code path that turns that event into an actionable
   artifact. A conductor that wants to auto-spawn a plan session for the
   regressed skill has nothing to read.
3. The per-skill `pass_rate_<slug>` metrics *are* written to the run,
   but no consumer correlates them with the individual failing case
   names + actual response text — data which lives only in the
   in-process `Vec<CaseResult>` during `skill_quality::run()` and is
   discarded before the `EvaluationRun` is serialised.

Until this loop closes, the "recursive skill improvement" story is
aspirational: every skill-quality regression needs a human to
cross-reference the baseline diff with the spec failures by hand and
manually compose a `plan/skill-quality-<skill>-fix` session. The
conductor cannot act on a signal it cannot read.

**Closing this loop** — (a) teaching `DiffEngine` that
`pass_rate` / `pass_rate_<slug>` belong in the `quality_pct` category,
(b) capturing per-case diagnostics during `run()`, and (c) emitting a
`skill_regression_report.json` with a `suggested_next_plan` one-liner —
gives the conductor the single input it needs to auto-spawn plan
sessions when a skill regresses. That is the recursion.

## 2. Exact reproducer — today's state

```console
$ cd /home/ashesh-goplani/opengraphdb
$ grep -n "quality_pct" crates/ogdb-eval/src/lib.rs
99:            quality_pct: 0.03,
189:    if n.contains("ndcg") || n.contains("recall") || n.contains("mrr") || n.contains("precision") {
190:        th.quality_pct
$ grep -rn "pass_rate" crates/ogdb-eval/src/lib.rs
# (no matches — pass_rate is not recognised as a quality metric)
$ ls crates/ogdb-eval/src/skill_regression.rs 2>&1
ls: cannot access 'crates/ogdb-eval/src/skill_regression.rs': No such file or directory
$ ls crates/ogdb-eval/tests/skill_regression_*.rs 2>&1
ls: cannot access 'crates/ogdb-eval/tests/skill_regression_*.rs': No such file or directory
$ grep -n "CaseDiagnostic\|run_with_diagnostics\|skill_regression_report" \
    crates/ogdb-eval/src/drivers/skill_quality.rs
# (no matches)
```

Nothing exists yet. Running the existing `DiffEngine::diff` on two
`skill_quality` EvaluationRuns today:

- routes `pass_rate` through the `throughput_pct` branch (5% tolerance),
- ignores `pass_rate_<skill>` per-skill deltas as undifferentiated
  throughput metrics,
- has no awareness of `suite == "skill_quality"`,
- produces no per-case failing-test output,
- writes no `skill_regression_report.json` to disk.

## 3. Data-flow trace

```
┌──────────────────────────────────────────────────────────────────────────┐
│ docs/evaluation-runs/baseline-YYYY-MM-DD.json                            │
│   JSON array of EvaluationRun (already has one skill_quality entry       │
│   once publish_baseline wires in Dimension 4 — out of scope here,        │
│   synthesised in tests via tempfile fixtures)                            │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │ skill_regression::load_runs_from_json_array(path)
                        │   → Vec<EvaluationRun>
                        │ skill_regression::find_skill_quality_run(&runs)
                        │   → Option<&EvaluationRun>   (matches suite=="skill_quality")
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ baseline_run: &EvaluationRun                                             │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        │ (parallel path)
                        │
┌──────────────────────────────────────────────────────────────────────────┐
│ skill_quality::run_with_diagnostics(specs_dir, adapter)                  │
│   → (EvaluationRun, Vec<CaseDiagnostic>)                                 │
│                                                                          │
│ CaseDiagnostic {                                                         │
│   skill, case_name, difficulty, passed, score, latency_us,               │
│   expected_must_contain: Vec<String>,                                    │
│   expected_pattern:      Option<String>,                                 │
│   actual_response:       String,                                         │
│ }                                                                        │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ DiffEngine::diff_skill_quality(baseline_run, current_run)                │
│   → Vec<RegressionEvent>                                                 │
│                                                                          │
│ category_threshold() extended (Phase 3):                                 │
│   n.starts_with("pass_rate") || n == "avg_score"  → quality_pct          │
│                                                                          │
│ New enum variant (additive, non-breaking):                               │
│   RegressionEvent::SkillQualityDiff {                                    │
│     skill: String,                                                       │
│     baseline_pass_rate: f64,                                             │
│     current_pass_rate:  f64,                                             │
│     delta_pct:          f64,   // signed; negative = regression          │
│     severity:           Severity,                                        │
│   }                                                                      │
│                                                                          │
│ Emission rule: for every metric name `pass_rate_<slug>` present in       │
│ BOTH runs, compute delta = (current - baseline) / baseline. If           │
│ |delta_pct| ≥ threshold, emit SkillQualityDiff; else drop. Existing      │
│ Regression/Improvement variants are emitted from the non-skill-quality  │
│ code path, unchanged.                                                    │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        │ threshold_pct =                                  
                        │   skill_regression::threshold_pct_from_env()    
                        │   (env: OGDB_SKILL_REGRESSION_THRESHOLD_PCT,    
                        │    default 5.0 — i.e. -5% gate)                  
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ skill_regression::generate_skill_regression_report(                      │
│     baseline: &EvaluationRun,                                            │
│     current:  &EvaluationRun,                                            │
│     current_diagnostics: &[CaseDiagnostic],                              │
│     threshold_pct: f64,                                                  │
│ ) -> SkillRegressionReport                                               │
│                                                                          │
│ SkillRegressionReport {                                                  │
│   schema_version: "1.0",                                                 │
│   generated_at:   "YYYY-MM-DDTHH:MM:SSZ",                                │
│   baseline_run_id: String,                                               │
│   current_run_id:  String,                                               │
│   threshold_pct:   f64,                                                  │
│   summary: SkillRegressionSummary {                                      │
│     overall_pass_rate_baseline, overall_pass_rate_current,               │
│     overall_pass_rate_delta_pct,                                         │
│     regressed_skill_count, total_failing_cases,                          │
│   },                                                                     │
│   regressed_skills: Vec<RegressedSkill>,                                 │
│ }                                                                        │
│                                                                          │
│ RegressedSkill {                                                         │
│   skill, baseline_pass_rate, current_pass_rate, delta_pct, severity,     │
│   failing_cases: Vec<FailingCase>,                                       │
│   suggested_next_plan: String,   // e.g.                                 │
│   // "plan/skill-quality-ogdb-cypher-fix — 2 failing case(s): basic-node-│
│   // query, complex-join"                                                │
│ }                                                                        │
│                                                                          │
│ FailingCase {                                                            │
│   case_name, difficulty, expected_must_contain,                          │
│   expected_pattern, actual_response, score,                              │
│ }                                                                        │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ skill_regression::write_report(&path, &report)                           │
│   → serde_json::to_writer_pretty with deterministic ordering:            │
│   · regressed_skills sorted by skill name ASC                            │
│   · failing_cases inside each sorted by case_name ASC                    │
│   · BTreeMap-backed fields inherit their natural ordering                │
│   · timestamp/run_ids passed in — NOT read from the clock inside         │
│     generate_* (keeps the fn deterministic; Phase 3 resolves at callsite)│
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ docs/evaluation-runs/skill_regression_report.json    (on disk)           │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ (OUT OF SCOPE — separate conductor config change, later)                 │
│ conductor file watcher: inotify on docs/evaluation-runs/ →               │
│   for each regressed_skill.suggested_next_plan → spawn plan session via  │
│   `agent-deck session add -t "<plan-name>" …`.                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Determinism note.** `generate_skill_regression_report` is a pure
function: no clock reads, no env reads, no disk I/O. `generated_at`,
`baseline_run_id`, `current_run_id`, and `threshold_pct` are inputs, not
sensed state. That makes test (4) — byte-identical output across runs —
realisable without snapshot freezing.

## 4. Scope boundaries

**In scope (this plan touches only):**
- `crates/ogdb-eval/src/skill_regression.rs`                              (new module)
- `crates/ogdb-eval/src/lib.rs`                                           (add `pub mod skill_regression;`, add `SkillQualityDiff` variant to `RegressionEvent`, extend `category_threshold` for `pass_rate`/`avg_score` — Phase 3 only; Phase 2 stubs only)
- `crates/ogdb-eval/src/drivers/skill_quality.rs`                         (add `CaseDiagnostic` + `run_with_diagnostics`)
- `crates/ogdb-eval/tests/skill_regression_diff.rs`                       (new — tests 1, 2)
- `crates/ogdb-eval/tests/skill_regression_report.rs`                     (new — tests 3, 4)
- `crates/ogdb-eval/tests/skill_regression_history.rs`                    (new — test 5)
- `crates/ogdb-eval/tests/skill_regression_threshold.rs`                  (new — test 6)

**Explicitly out of scope:**
- `ogdb-core`, `ogdb-cli`, `ogdb-bench`, `frontend/`, `bindings/`, `mcp/`.
- Conductor file-watcher / inotify glue / `agent-deck session add` wiring.
- Wiring `generate_skill_regression_report` into `publish_baseline` or
  a CI job — that's a separate follow-on once the pure core is green.
- Real LLM adapter (still `StubRealAdapter`; tests use `MockAdapter`).
- CHANGELOG.md / `docs/IMPLEMENTATION-LOG.md` entries — land with
  Phase 3 GREEN, not with this RED plan commit.

**Test-runner invariant.** All assertions in this plan are validated with
`cargo test -p ogdb-eval` (per-crate). Never `cargo test --workspace` —
the workspace contains crates outside this plan's blast radius and
running them here would widen scope by accident.

## 5. Module + type design (Phase 3 shape — what stubs become)

### `crates/ogdb-eval/src/skill_regression.rs` (new)

```rust
//! Closed-loop skill-quality regression reporter. Consumes two
//! EvaluationRuns (one baseline, one current) + the per-case diagnostics
//! captured during the current run, and emits a machine-readable
//! SkillRegressionReport that the conductor's file-watcher uses to auto-
//! spawn plan sessions.

use crate::drivers::skill_quality::{CaseDiagnostic, Difficulty};
use crate::{EvalError, EvaluationRun, Severity};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const REPORT_SCHEMA_VERSION: &str = "1.0";
pub const DEFAULT_THRESHOLD_PCT: f64 = 5.0;
pub const THRESHOLD_ENV: &str = "OGDB_SKILL_REGRESSION_THRESHOLD_PCT";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillRegressionReport {
    pub schema_version: String,
    pub generated_at: String,
    pub baseline_run_id: String,
    pub current_run_id: String,
    pub threshold_pct: f64,
    pub summary: SkillRegressionSummary,
    pub regressed_skills: Vec<RegressedSkill>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillRegressionSummary {
    pub overall_pass_rate_baseline: f64,
    pub overall_pass_rate_current: f64,
    pub overall_pass_rate_delta_pct: f64,
    pub regressed_skill_count: usize,
    pub total_failing_cases: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RegressedSkill {
    pub skill: String,
    pub baseline_pass_rate: f64,
    pub current_pass_rate: f64,
    pub delta_pct: f64,
    pub severity: Severity,
    pub failing_cases: Vec<FailingCase>,
    pub suggested_next_plan: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailingCase {
    pub case_name: String,
    pub difficulty: Difficulty,
    pub expected_must_contain: Vec<String>,
    pub expected_pattern: Option<String>,
    pub actual_response: String,
    pub score: f64,
}

/// Read an array-of-EvaluationRuns file (e.g. `baseline-2026-04-23.json`).
/// Contrast with `JsonlHistory::read_all`, which reads newline-delimited.
pub fn load_runs_from_json_array(path: &Path) -> Result<Vec<EvaluationRun>, EvalError> { /* … */ }

/// First run whose `suite == "skill_quality"`, else None.
pub fn find_skill_quality_run(runs: &[EvaluationRun]) -> Option<&EvaluationRun> { /* … */ }

/// `OGDB_SKILL_REGRESSION_THRESHOLD_PCT` parsed as f64, else
/// `DEFAULT_THRESHOLD_PCT` (5.0). Non-finite / negative values fall back
/// to the default.
pub fn threshold_pct_from_env() -> f64 { /* … */ }

/// Pure function — deterministic output given fixed inputs.
pub fn generate_skill_regression_report(
    baseline: &EvaluationRun,
    current: &EvaluationRun,
    current_diagnostics: &[CaseDiagnostic],
    threshold_pct: f64,
    generated_at: &str,
) -> SkillRegressionReport { /* … */ }

/// Pretty-printed deterministic JSON → `path`. Over-writes.
pub fn write_report(path: &Path, report: &SkillRegressionReport) -> Result<(), EvalError> { /* … */ }
```

### `crates/ogdb-eval/src/lib.rs` (extensions)

```rust
pub mod skill_regression;   // NEW: re-exported for downstream callers.

#[derive(Debug, Clone, PartialEq)]
pub enum RegressionEvent {
    Regression { … },        // unchanged
    Improvement { … },       // unchanged
    // NEW — emitted by DiffEngine::diff_skill_quality:
    SkillQualityDiff {
        skill: String,
        baseline_pass_rate: f64,
        current_pass_rate: f64,
        delta_pct: f64,      // signed; negative = regression
        severity: Severity,
    },
}

impl DiffEngine {
    /// Like `diff`, but specialised for `suite == "skill_quality"` runs:
    /// iterates `pass_rate_<slug>` metric pairs, emits one
    /// `SkillQualityDiff` per skill whose |delta_pct| ≥ threshold.
    /// `pass_rate` (overall) is emitted as the special skill name
    /// `"<overall>"`.
    pub fn diff_skill_quality(
        &self,
        baseline: &EvaluationRun,
        current: &EvaluationRun,
        threshold_pct: f64,
    ) -> Vec<RegressionEvent> { /* … */ }
}

// Phase-3-only tweak to existing `category_threshold`:
// add  `|| n.starts_with("pass_rate") || n == "avg_score"`  →  th.quality_pct
// BEFORE the `ndcg/recall/mrr/precision` branch (higher priority).
```

### `crates/ogdb-eval/src/drivers/skill_quality.rs` (extension)

```rust
/// Diagnostic mirror of CaseResult with the extra fields a regression
/// report needs: the expected expectations + actual response text.
#[derive(Debug, Clone, PartialEq)]
pub struct CaseDiagnostic {
    pub skill: String,
    pub case_name: String,
    pub difficulty: Difficulty,
    pub passed: bool,
    pub score: f64,
    pub latency_us: u64,
    pub expected_must_contain: Vec<String>,
    pub expected_pattern: Option<String>,
    pub actual_response: String,
}

/// Like `run`, but captures per-case diagnostics alongside the aggregated
/// EvaluationRun. Callers who only need the EvaluationRun keep using `run`.
pub fn run_with_diagnostics(
    specs_dir: &Path,
    adapter: &dyn LlmAdapter,
) -> Result<(EvaluationRun, Vec<CaseDiagnostic>), SkillQualityError> { /* … */ }
```

## 6. Failing-test matrix

| # | Test (file :: name)                                                         | Asserts                                                                                                                                       | RED stub that makes it fail                                |
|---|-----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| 1 | `skill_regression_diff :: diff_engine_detects_pass_rate_drop`               | 2 runs, per-skill `pass_rate_ogdb_cypher` drops 90% → 80% at 5% threshold ⇒ `SkillQualityDiff { skill: "ogdb-cypher", delta_pct ≈ -11.1 }` event emitted. | `DiffEngine::diff_skill_quality` → `unimplemented!()` |
| 2 | `skill_regression_diff :: no_regression_when_within_threshold`              | Same metric drops 90% → 87% (−3.3%) at default 5% threshold ⇒ no `SkillQualityDiff` event.                                                   | same stub                                                  |
| 3 | `skill_regression_report :: report_lists_failing_cases_per_skill`           | 3 skills present, one regressed with 2 failing diagnostics ⇒ report.regressed_skills has len 1, that entry's `failing_cases` has len 2 with case names + expected patterns + actual responses populated; `suggested_next_plan` contains `"plan/skill-quality-"` and the skill name. | `generate_skill_regression_report` → `unimplemented!()`    |
| 4 | `skill_regression_report :: report_is_deterministic_across_runs`            | Calling `generate_skill_regression_report` twice with identical inputs ⇒ byte-identical `serde_json::to_string` output; calling `write_report` twice produces a file with byte-identical bytes. | same stub                                                  |
| 5 | `skill_regression_history :: integration_with_diff_history_file`            | A tempfile JSON array containing a `skill_quality` run ⇒ `load_runs_from_json_array` + `find_skill_quality_run` returns that run; diffing it against a second (lower-pass_rate) `skill_quality` run through the full pipeline produces a report with ≥ 1 regressed skill. | `load_runs_from_json_array`, `find_skill_quality_run` → `unimplemented!()` |
| 6 | `skill_regression_threshold :: threshold_configurable_via_env`              | With env `OGDB_SKILL_REGRESSION_THRESHOLD_PCT=15.0`, an 8% skill drop ⇒ *no* `SkillQualityDiff`. Unset ⇒ default 5.0 ⇒ yes `SkillQualityDiff`. Test uses a process-serial mutex because env is process-global. | `threshold_pct_from_env` → `unimplemented!()`              |

Every test passes the *current* test file name through exactly — no
rename or typo between plan and file. Each test is standalone (its own
`#[test]` fn, own fixtures, no cross-test state) except the env-var test
(6) which serialises against a `Mutex` to survive parallel cargo test
execution.

## 7. Phase-3 (GREEN) TODO list — for the follow-on session

1. Replace the six `unimplemented!()` stubs with real implementations
   that pass every test in §6.
2. Extend `category_threshold` in `lib.rs` so `pass_rate` / `pass_rate_*`
   / `avg_score` route to `quality_pct`. Add a regression test in
   `tests/diff_engine.rs` asserting a 4% `pass_rate` drop trips the 3%
   `quality_pct` threshold (it doesn't today under the 5% `throughput_pct`).
3. Wire `run_with_diagnostics` into `publish_baseline.rs` so the baseline
   JSON carries a `skill_quality` run AND a sidecar
   `skill_quality_diagnostics.jsonl` — deferred to Phase 4 if it creeps
   scope.
4. Add CHANGELOG.md `Unreleased` entry + `docs/IMPLEMENTATION-LOG.md`
   row. Append `release-tests.manifest` entry in the final phase.
5. Run `./scripts/test.sh` + `./scripts/coverage.sh` before merging.
   Never `cargo test --workspace`.

## 8. Self-review checklist

- [x] Scope limited to `crates/ogdb-eval/`.
- [x] No ogdb-core / conductor / frontend edits.
- [x] Every test in §6 has a matching failing stub in §5.
- [x] Threshold semantics defined: positive number = % drop gate.
- [x] Determinism contract stated (pure fn, injected timestamp + run-ids).
- [x] Additive `SkillQualityDiff` enum variant keeps existing `matches!`
      call-sites wildcarded-safe (verified against `tests/diff_engine.rs`).
- [x] RED stubs compile (tests reference real pub fn signatures) and
      panic at runtime — not compile-error.
- [x] Cargo test instruction scoped: `cargo test -p ogdb-eval`.
