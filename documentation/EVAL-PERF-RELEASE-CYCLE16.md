# EVAL-PERF-RELEASE — Cycle 16

- **Eval area:** PERF-RELEASE
- **Workspace HEAD:** `8496878` (origin/main, 2026-05-05)
- **Worktree:** `/tmp/wt-c16-perf-release` (detached off origin/main)
- **Scope:** `documentation/BENCHMARKS.md`, `documentation/evaluation-runs/baseline-2026-05-02.json`, `.claude/release-tests.yaml`, `scripts/test.sh`, `scripts/check-*.sh`, `scripts/test-*.sh`, `scripts/release.sh`, `scripts/install.sh`, `scripts/verify-claims.sh`, `scripts/workflow-check.sh`, `.github/workflows/{ci,release,verify-claims}.yml`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`.
- **Methodology:** read-only inspection on a fresh worktree off `origin/main` @ `8496878`. Did NOT run `cargo bench`, `cargo test --workspace`, or any release-pipeline workflows. Diffed every BENCHMARKS.md table cell against `baseline-2026-05-02.json` (15 EvaluationRuns, schema v1.0, version=0.4.0, N=5 medianed). Ran every cycle-15 gate (`check-changelog-tags`, `check-benchmarks-version`, `check-security-supported-version`, `check-skills-copilot-removed`, `check-contributing-coverage-claim`, `test-workflow-bash-syntax`, `test-install-detect-target`) standalone — all passed.
- **Cycle-15 dedup:** read `git show origin/eval/c15-perf-release-aff476f:documentation/EVAL-PERF-RELEASE-CYCLE15.md`. F01–F12 were closed across 16 commits between `aff476f` and `8496878`. This cycle-16 audit does not re-flag those; every finding below is NEW drift introduced by (or left open by) the cycle-15 commit chain.

## Summary

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| HIGH | 3 | F01 — F03 |
| MEDIUM | 3 | F04 — F06 |
| LOW | 1 | F07 |

KNOWN_BROKEN release-pipeline jobs (tracked separately, in pending_asks; not re-flagged here):

- `release.yml::publish-crates` — `CARGO_REGISTRY_TOKEN` secret unset; `cargo publish` 401s on first real `v*` tag push. Workaround: maintainer sets `CRATES_TOKEN` repo secret before next tag, OR keep `if: false` on the upstream `semver` job until first publish lands.
- `release.yml::docker` — multi-platform `linux/amd64,linux/arm64` build under QEMU emulation has been flaky / timeout-prone in prior runs. Workaround: drop `linux/arm64` from `platforms:` until self-hosted aarch64 runner is available, or split docker into two single-platform jobs so amd64 always lands.

---

## F01 — BENCHMARKS.md rows 1 and 2 still carry 0.3.0 N=5 values while labeled "0.4.0, N=5 median"; doc body claims "All 14 rows" were rebaselined

- **Severity:** HIGH
- **Files:** `documentation/BENCHMARKS.md:14-15` (body claim), `documentation/BENCHMARKS.md:109` (row 1), `documentation/BENCHMARKS.md:110` (row 2); cross-referenced against `documentation/evaluation-runs/baseline-2026-05-02.json::throughput.{ingest_bulk,ingest_streaming}` and `baseline-2026-04-25.json` (0.3.0 N=5).

The cycle-15 patch (`cf97159`, "rebaseline rows 7-14 to 0.4.0 N=5") added a body section that explicitly claims:

> All 14 rows in § 2 below now carry 0.4.0 N=5 medians sourced from
> [`baseline-2026-05-02.json`](evaluation-runs/baseline-2026-05-02.json)

But rows 1 and 2 were not part of cycle-9's rebaseline (rows 3-6, 10) or cycle-15's rebaseline (rows 7-14), so they still carry the 0.3.0 N=5 numbers from `baseline-2026-04-25.json`:

| Row | Doc cell | Doc label | 0.4.0 N=5 (baseline-2026-05-02.json) | 0.3.0 N=5 (baseline-2026-04-25.json) | Verdict |
|---|---|---|---|---|---|
| 1 | **254 nodes/s** | "(0.4.0, `throughput::ingest_bulk`, N=5 median)" | 251.09 nodes/s (`throughput/ingest_bulk::nodes_per_sec`) | 254.25 nodes/s | doc value matches 0.3.0, label says 0.4.0 |
| 2 | **301 nodes/s** | "(0.4.0, `throughput::ingest_streaming`, N=5 median)" | 299.61 nodes/s (`throughput/ingest_streaming::nodes_per_sec`) | 301.83 nodes/s | doc value matches 0.3.0, label says 0.4.0 |

Both deltas are small in absolute terms (1.2 % and 0.7 %), but the load-bearing claim is the *labeling pedigree*: the doc tells a reader the cell is the 0.4.0 N=5 median when the cell is actually the 0.3.0 N=5 median. `documentation/evaluation-runs/baseline-2026-05-02.json` ships these exact 0.4.0 numbers — the rebaseline data was already on disk when cycle-15 patched only rows 7-14.

The doc body's "All 14 rows" sentence and the `0.3.0 → 0.4.0 N=5-vs-N=5 deltas` table that follows it (lines 39-57) starts at row 3 — rows 1 and 2 are not in the deltas table either, which is the visible tell that the claim was overreach.

**Patch sketch:**
```diff
@@ documentation/BENCHMARKS.md row 1
-| 1 | Bulk ingest, 10 k nodes + 10 k edges (nodes/s, single write-tx) | **254 nodes/s** (0.4.0, `throughput::ingest_bulk`, N=5 median) | …
+| 1 | Bulk ingest, 10 k nodes + 10 k edges (nodes/s, single write-tx) | **251 nodes/s** (0.4.0, `throughput::ingest_bulk`, N=5 median, 2026-05-02 re-baseline) | …

@@ documentation/BENCHMARKS.md row 2
-| 2 | Streaming ingest (nodes/s sustained, 30 s window, batch=64) | **301 nodes/s** (0.4.0, `throughput::ingest_streaming`, N=5 median) | …
+| 2 | Streaming ingest (nodes/s sustained, 30 s window, batch=64) | **300 nodes/s** (0.4.0, `throughput::ingest_streaming`, N=5 median, 2026-05-02 re-baseline) | …
```

And add rows 1 and 2 to the deltas table in the body (`254 → 251`, `−1.2 %`; `302 → 300`, `−0.7 %`) so the "All 14 rows" claim is finally honest.

---

## F02 — 5 cycle-15 gates added but never wired into `scripts/test.sh` or any CI workflow; they are dead code

- **Severity:** HIGH
- **Files:** `scripts/test.sh` (has no entry for any of the 5 below), `.github/workflows/ci.yml`, `.github/workflows/release.yml`. Affected gates:
  - `scripts/test-workflow-bash-syntax.sh` (added by `f3be10c`, cycle-15 F04)
  - `scripts/test-install-detect-target.sh` (added by `b5ee76d`, cycle-15 F06)
  - `scripts/check-security-supported-version.sh` (added by `01b2554`, cycle-15-related)
  - `scripts/check-skills-copilot-removed.sh` (added by `d4bda6f`)
  - `scripts/check-contributing-coverage-claim.sh` (added by `4185044`)
  - and the matching meta-tests `scripts/test-check-*.sh` for the latter three.

Reproduction:

```bash
$ grep -E '\./scripts/(test-workflow-bash-syntax|test-install-detect-target|check-security-supported-version|check-skills-copilot-removed|check-contributing-coverage-claim)' \
    scripts/test.sh .github/workflows/*.yml
# (no matches)
```

Each script runs cleanly when invoked directly (`bash scripts/test-workflow-bash-syntax.sh` → `ok: all 47 run: blocks parse`; `bash scripts/check-security-supported-version.sh` → `ok (0.5.1 → 0.5.x supported)`; etc.). They simply never run in CI — a contributor changing SECURITY.md, CONTRIBUTING.md, the npm skill bundle, a workflow `run: |` body, or `install.sh::detect_target` gets zero feedback. This is exactly the failure mode `scripts/test.sh` is meant to be the single CI entry point against (see test.sh:32-39 comment "C2-A8 (HIGH): cycle-1 added these structural lints but never wired them into CI. Without the wiring they're dead code"). Cycle-15 reproduced the same failure mode for its own gates.

The `release-tests.yaml` entry `install-sh-asset-url-template` looks like wiring at first glance, but it isn't — see F03.

**Patch sketch:**
```diff
@@ scripts/test.sh
 ./scripts/check-changelog-tags.sh
 ./scripts/check-doc-anchors.sh
 ./scripts/check-binary-name.sh
+# EVAL-DOCS-COMPLETENESS-CYCLE15 F01: SECURITY.md "Supported Versions"
+# row minor must match the workspace minor.
+./scripts/check-security-supported-version.sh
+# EVAL-DOCS-COMPLETENESS-CYCLE15 F06: skills/README.md + skills/src/install.ts
+# must not mention copilot (SKILL.md compatibility metadata is the truth).
+./scripts/check-skills-copilot-removed.sh
+# EVAL-DOCS-COMPLETENESS-CYCLE15 F07: CONTRIBUTING.md coverage-gate claim
+# must match scripts/coverage.sh's --fail-under-lines / --fail-uncovered-lines.
+./scripts/check-contributing-coverage-claim.sh
…
 ./scripts/test-crate-metadata.sh
 ./scripts/test-release-workflow.sh
 ./scripts/test-dockerfile.sh
 ./scripts/test-check-benchmarks-version.sh
+# EVAL-PERF-RELEASE-CYCLE15 F04: bash -n every `run: |` body in
+# .github/workflows/*.yml so a stray `done`/`fi` can't slip past review.
+./scripts/test-workflow-bash-syntax.sh
+# EVAL-PERF-RELEASE-CYCLE15 F06: install.sh detect_target() must emit
+# asset URLs matching release.yml::build.matrix triples + .tar.xz/.zip exts.
+./scripts/test-install-detect-target.sh
+# Meta-tests for the cycle-15 gates above (run after the gates so a
+# breakage in the gate itself is visible separately from the surface it gates).
+./scripts/test-check-security-supported-version.sh
+./scripts/test-check-skills-copilot-removed.sh
+./scripts/test-check-contributing-coverage-claim.sh
```

---

## F03 — `install-sh-asset-url-template` manifest entry is documentation, not gate; never executes in CI

- **Severity:** HIGH
- **Files:** `.claude/release-tests.yaml:620-626`, `scripts/verify-claims.sh:54-79`, `scripts/test.sh` (gap), `.github/workflows/{ci,release,verify-claims}.yml` (no caller)

The cycle-15 F06 fix added a manifest entry pointing at `bash scripts/test-install-detect-target.sh`:

```yaml
  - id: install-sh-asset-url-template
    task: fix-install-asset-name
    crate: scripts
    test: "install_sh_detect_target"
    function: []
    command: "bash scripts/test-install-detect-target.sh"
```

But `scripts/verify-claims.sh` (the only mechanical driver of `release-tests.yaml`) explicitly filters non-frontend entries:

```python
for t in tests:
    if t.get("crate") != "frontend":
        continue
```

So `crate: scripts` entries are skipped. And no other pipeline reads the manifest — `scripts/test.sh` doesn't iterate it, neither does `ci.yml::quality` nor `release.yml::tests`. The result: the entry exists, the script exists, both are correct, but nothing in CI actually runs the script. The v0.5.0 install-pipeline BLOCKER that escaped CI to a real user remains structurally just as escapable as before — only the *post-mortem documentation* of "we have a regression test for this" landed.

This is the same failure cycle-15 F11 named (the manifest is documentation, not gate, until something mechanically iterates it). F11 was claimed closed but is closed only for `crate: frontend` entries; for `crate: scripts` / Rust crates it is wide open.

**Patch sketch (minimal — same shape as F02):**
```diff
@@ scripts/test.sh
+# Mechanically run every non-frontend release-tests.yaml entry (F11/F03):
+./scripts/test-install-detect-target.sh
+# (or ship a real driver that iterates `crate != frontend` entries)
```

**Patch sketch (full — close F11 properly):** add `scripts/run-release-tests.sh` (Python yaml + subprocess loop, ~40 lines) that iterates every `tests[*]` entry whose `crate` is one of `(scripts|ogdb-*|<rust crate>)` and runs each `command:` exactly as written. Wire it into `scripts/test.sh` after `cargo test --workspace --all-targets`, OR run it as a separate `release-manifest` job in `release.yml::tests`. Until this lands, every future entry added by future-cycle fixes will silently be a no-op.

---

## F04 — `scripts/workflow-check.sh` Layer 2 only enforces `feat(` commits; 5 `fix(` / `docs(` commits since `v0.5.1` ship without [Unreleased] coverage

- **Severity:** MEDIUM
- **Files:** `scripts/workflow-check.sh:117-136` (Layer 2 grep filter), `CHANGELOG.md:8-21` ([Unreleased] body), `git log v0.5.1..HEAD`

Layer 2's regex (`--grep='^feat(\(|!:|:)'`) only collects `feat(` commits. Since `v0.5.1` (commit `f79cf98`), the following commits landed on `main` with no matching keyword in `[Unreleased]`:

| SHA | Subject | In [Unreleased]? |
|---|---|---|
| `b5ee76d` | `fix(release-tests): add install-sh asset-url manifest entry + repair IS-1 test field schema drift` | no |
| `6230cde` | `fix(changelog): backfill [0.5.0]+[0.5.1] footer entries + tighten gate to require heading-footer parity` | no |
| `f3be10c` | `fix(ci): remove stray bash done in semver-checks block + add workflow-bash-syntax structural lint` | no |
| `b6cc6f0` | `fix(frontend): declare unlisted runtime deps @deck.gl/mapbox + @neo4j-cypher/language-support` | no |
| `ca82055` | `docs(version-stamps): bump backend-swap follow-up target to v0.6.0 + sweep BENCHMARKS body 0.4.0→0.5.1 carry-fwd refs` | partial (the BENCHMARKS sweep ref is implicit via the `aff476f` bullet, but the `v0.6.0 backend-swap` change has no entry) |

The C15-F16 strengthening rejected the empty `(No entries yet` placeholder, which closes the *zero-bullet* failure mode. But the `feat(`-only filter means the AGENTS rule (`AGENTS.md:13`: "every merged change land an `[Unreleased]` bullet") is still unenforced for the most common commit types. A `fix(` that ships a regression-affecting bug fix can land with no changelog entry just by virtue of not being `feat(`.

**Patch sketch:**
```diff
@@ scripts/workflow-check.sh:136
-done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|:)' -z)
+# Cycle-16 F04: cover fix(/docs(/refactor(/perf( in addition to feat(.
+# chore(/test(/style( are excluded — they are implicit non-user-facing.
+done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E \
+         --grep='^(feat|fix|docs|refactor|perf)(\(|!:|:)' -z)
```

(Or, if the bar is "user-facing change", relax it to all conventional-commit types and rely on the keyword-match heuristic to avoid false-positives on `chore:` commits — which is what Layer 2's stop-word list already handles.)

---

## F05 — BENCHMARKS.md "Baseline-version note" claim contradicts its own deltas table (rows 1, 2 missing)

- **Severity:** MEDIUM
- **File:** `documentation/BENCHMARKS.md:14-58`

The body section claims "All 14 rows in § 2 below now carry 0.4.0 N=5 medians" (line 14-15), then publishes a `0.3.0 → 0.4.0 N=5-vs-N=5 deltas` audit table (lines 39-57) that starts at row 3. Rows 1 and 2 are not in the audit table at all — the reader who looks at the table sees rows 3-14 audited and infers the writer also audited 1 and 2 and saw nothing worth flagging. Per F01, the truth is that rows 1 and 2 weren't sourced from the 0.4.0 baseline JSON in the first place; the omission from the audit table is the visible tell of the omission from the rebaseline.

This finding pairs with F01: F01 fixes the actual cells, F05 fixes the surrounding narrative so the same gap can't open again on the next minor.

**Patch sketch:** add rows 1 and 2 to the deltas table (using the new 0.4.0 N=5 values from F01) — both deltas are within published thresholds (−1.2 % nodes/s on row 1; −0.7 % on row 2, well under the 5 %-throughput regression bar), so no follow-up section is needed. The mere presence of the rows in the audit table closes the "is this row carry-forward or rebaselined?" ambiguity.

---

## F06 — `scripts/test-install-detect-target.sh` evaluates `install.sh` under `bash` while `install.sh` itself targets POSIX `sh`

- **Severity:** MEDIUM
- **Files:** `scripts/test-install-detect-target.sh:48` (`bash -c`), `scripts/install.sh:1` (`#!/usr/bin/env sh`)

`install.sh` is intentionally POSIX `sh` — the `#!/usr/bin/env sh` shebang and `set -eu` (no `-o pipefail`) are the conservative one-liner-installer baseline so the curl-pipe-sh distribution path works on Alpine `dash`, BusyBox `ash`, OpenWrt `ash`, etc. The cycle-15 regression test extracts `detect_target()` from `install.sh` via awk and re-invokes it under `bash`:

```bash
out=$(
  OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
    …
    eval "$DETECT_FN"
    detect_target
  '
)
```

A future edit that reaches for bash-only syntax (`[[ ... ]]`, arrays, process substitution `<(…)`) inside `detect_target()` will silently pass this test (because bash supports it) but break the moment a real user runs `curl … | sh` on a host where `/bin/sh` is `dash`. That's the exact regression class the test was created to catch — the test currently doesn't.

**Patch sketch:**
```diff
@@ scripts/test-install-detect-target.sh
-  out=$(
-    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
+  # Run under POSIX sh (dash on Debian/Ubuntu CI runners) to match the real
+  # `curl … | sh` path. install.sh's shebang is `/usr/bin/env sh`, not bash;
+  # exercising under bash hides bash-only-syntax regressions.
+  out=$(
+    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" \
+      sh -c '
       …
       eval "$DETECT_FN"
       detect_target
     '
   )
```

(Or, equivalently, run twice — once under `sh` and once under `bash` — so the test guarantees both shells.)

---

## F07 — `release-tests.yaml::install-sh-asset-url-template` `test:` field uses cargo-target naming for a bash-script entry

- **Severity:** LOW
- **File:** `.claude/release-tests.yaml:620-626`

The manifest header (lines 14-22 — visible from `head -22 .claude/release-tests.yaml`) declares `test: the rust test target name (matches --test flag)`. The new entry from cycle-15 F06 has:

```yaml
  - id: install-sh-asset-url-template
    crate: scripts
    test: "install_sh_detect_target"     # <-- looks like a Rust test target
    function: []
    command: "bash scripts/test-install-detect-target.sh"
```

This is the same schema-drift class the cycle-15 F07 patch closed for `is1-perf-recovery-after-monolith-split` — `test:` says one thing, `command:` runs another. Auto-tooling that uses `test:` as the source of truth (the manifest comment says the conductor's release gate scans this file) will request a non-existent `--test install_sh_detect_target` target. Either rename the field with a non-cargo-target convention (`test: "bash:test-install-detect-target.sh"`) or document the field is editorial for non-rust entries — the cycle-15 F07 patch chose the latter for IS-1 by leaving a comment; do the same here.

**Patch sketch:**
```diff
@@ .claude/release-tests.yaml
   - id: install-sh-asset-url-template
     task: fix-install-asset-name
     crate: scripts
-    test: "install_sh_detect_target"
+    test: "bash:scripts/test-install-detect-target.sh"
     function: []
     command: "bash scripts/test-install-detect-target.sh"
```

(The `bash:` prefix marks the field as non-cargo-target by convention; downstream tooling that splits on `:` can then route to `bash` vs `cargo test --test`.)

---

## What was checked and not flagged

- `scripts/check-changelog-tags.sh` — passes; the cycle-15 F01 heading-footer parity strengthening (lines 56-71) correctly catches the previous drift (every `## [X.Y.Z]` heading now has a matching `[X.Y.Z]: …` footer entry; verified by adding a synthetic missing footer in a scratch buffer and re-running — gate fails as expected).
- `scripts/check-benchmarks-version.sh` — passes; column-header gate (lines 68-97) green at `0.5.1 (carry-fwd 0.4.0 N=5)`. The `(carry-fwd …)` escape-hatch correctly recognises the patch-release no-op note.
- `scripts/check-security-supported-version.sh` — passes; `SECURITY.md` Supported Versions row reads `| 0.5.x   | ✅ |` and the cutoff `| < 0.5.0 | ❌ |`, matching `Cargo.toml::workspace.package.version = "0.5.1"`.
- `scripts/check-skills-copilot-removed.sh` — passes; no `copilot` references in `skills/README.md` or `skills/src/install.ts`.
- `scripts/check-contributing-coverage-claim.sh` — passes; CONTRIBUTING bolded claim matches `coverage.sh::--fail-under-lines 80` / `--fail-uncovered-lines 5000`.
- `scripts/test-workflow-bash-syntax.sh` — passes; all 47 `run: |` bodies in `.github/workflows/{ci,release,verify-claims}.yml` parse with `bash -n`. The cycle-15 F04 stray-`done` is gone from `ci.yml::semver` and the gate would catch its return.
- `scripts/test-install-detect-target.sh` — passes; all 5 OS/arch pairs produce asset URLs matching the `ogdb-X.Y.Z-<target>.{tar.xz,zip}` pattern from `release.yml::build.matrix` and `release.sh`.
- `release-tests.yaml` 64 entries — every `crates/<crate>/tests/<file>.rs`, `frontend/<spec>.spec.ts`, and `scripts/<file>.sh` path resolves on disk (verified via `python3 yaml.safe_load` walk over the manifest, with comma-list `test:` entries split correctly).
- `baseline-2026-05-02.json` — schema_version 1.0 across all 15 runs; binary.version 0.4.0; aggregation `median-of-5-iters`; all metrics populated. JSON is sound. F01 / F05 are doc-side mislabeling, not JSON-side drift.
- BENCHMARKS.md rows 3-14 vs JSON — every cell verified against `baseline-2026-05-02.json` after cycle-15 `cf97159`. Row-by-row deltas (rounded to doc precision):
  - Row 3 point read: doc 5.8/6.8/11.8 ↔ JSON 5.837/6.843/11.778 ✓
  - Row 4 traversal: doc 22.9/25.8/36.0 ↔ JSON 22.911/25.760/36.017 ✓
  - Row 5 IS-1: doc 18.3/163/222 ↔ JSON 18.334/162.791/221.944 ✓
  - Row 6 mutation: doc 12 981/15 939, 72 ops/s ↔ JSON 12980.69/15939.43, 72.17 ✓
  - Row 7 enrichment: doc 38.8/46.7/112.6 ↔ JSON 38.771/46.723/112.626 ✓
  - Row 8 hybrid: doc 204/233/246 ↔ JSON 203.979/233.254/245.685 ✓
  - Row 9 concurrent: doc 295 commits/s ↔ JSON 294.616 ✓
  - Row 10 rerank: doc 1.28/1.34/1.62, batch 153 ↔ JSON 1.275/1.343/1.624, 152.951 ✓
  - Row 11 BFS: doc 48.5 μs / 70 nodes / 3 levels ↔ JSON 48.468 / 70 / 3 ✓
  - Row 12 PageRank: doc 652 μs/iter, 13.0 ms total ↔ JSON 651.962 ✓
  - Row 13 scaling 10k: doc 0.38 μs / 0.32 s / 28.0 MB / 39.4 MB ↔ JSON 0.375 / 0.319 / 28.023 / 39.367 ✓
  - Row 14 resources: doc 1.51 s / 28.0 MB / 49 MB / 40 s ↔ JSON 1.51 / 28.023 / 49.135 / 39.902 ✓
  Only rows 1 and 2 disagree with the JSON — flagged in F01.

## Cross-references

- F01 + F05 share the BENCHMARKS.md row-1/row-2 surface — bundle in one patch (cells + deltas-table audit rows together).
- F02 + F03 share the "wire cycle-15 gates into CI" surface — bundle in one patch (`scripts/test.sh` additions cover both).
- F06 + F07 are pure regression-test polish on the install-pipeline guard — independent low-risk patches.
- F04 is independent of all other findings — pure `workflow-check.sh` strengthening.
