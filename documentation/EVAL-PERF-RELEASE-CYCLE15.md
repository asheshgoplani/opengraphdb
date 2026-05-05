# EVAL-PERF-RELEASE — Cycle 15

- **Eval area:** PERF-RELEASE
- **Workspace HEAD:** `aff476f` (origin/main, 2026-05-05)
- **Worktree:** `/tmp/wt-c15-perf-release` (detached)
- **Scope:** `documentation/BENCHMARKS.md`, `documentation/evaluation-runs/*`, `.claude/release-tests.yaml`, `scripts/test.sh`, `scripts/check-*.sh`, `scripts/test-*.sh`, `scripts/release.sh`, `scripts/install.sh`, `.github/workflows/{ci,release,verify-claims}.yml`, `Dockerfile`, `CHANGELOG.md`.
- **Methodology:** read-only inspection. Did NOT run `cargo bench`, `cargo test --workspace`, or any release-pipeline workflows. Diffed BENCHMARKS.md table cells against `baseline-2026-05-02.json` (latest N=5 v0.4.0 baseline) and `baseline-2026-04-25.json` (prior 0.3.0 N=5).

## Summary

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 1 | F01 |
| HIGH | 6 | F02 — F07 |
| MEDIUM | 4 | F08 — F11 |
| LOW | 1 | F12 |

No prior `EVAL-PERF-RELEASE-CYCLE14.md` exists in tree, so nothing to de-duplicate against. Cycles 1–14 are referenced via inline `EVAL-…` annotations in `scripts/test.sh` and `.github/workflows/*.yml`.

KNOWN_BROKEN release-pipeline jobs (tracked separately from findings, with workaround):

- `release.yml::publish-crates` — `CARGO_REGISTRY_TOKEN: ${{ secrets.CRATES_TOKEN }}` reads an unset repo secret. `cargo publish` runs with an empty token and 401s; the `|| echo "WARN: …"` swallow is on the dry-run loop only, not the real-publish loop. **Workaround:** maintainer sets `CRATES_TOKEN` repo secret before the next `v*` tag push, OR keep `if: false` until first publish lands. **No GitHub Issue filed** (see F11).
- `release.yml::docker` — multi-platform build (`linux/amd64,linux/arm64`) under QEMU emulation has been flaky in prior runs (eval pending_asks noted an `npm ci` issue). Inspecting the current `Dockerfile`, the SPA build stage is structurally correct (`COPY frontend/package.json…/package-lock.json` then `npm ci` in a separate layer before `COPY frontend ./frontend`), so the Dockerfile is not the npm-ci root cause. **Most likely root cause:** QEMU-emulated `cargo build --release --locked -p ogdb-cli` on `linux/arm64` exceeds the 6 hr `actions` job timeout when bringing up the workspace toolchain cache cold. **Workaround:** drop `linux/arm64` from `platforms:` until a self-hosted aarch64 runner is provisioned, or split the docker job into two single-platform jobs so the amd64 image always lands. **No GitHub Issue filed** (see F11).

---

## F01 — CHANGELOG.md footer is missing `[0.5.1]` and `[0.5.0]` entries

- **Severity:** BLOCKER
- **File:** `CHANGELOG.md` lines 234–245 (compare-link footer block)

Local tags `v0.5.1` (HEAD-adjacent) and `v0.5.0` exist (`git tag -l 'v*'` returns `v0.3.0 v0.4.0 v0.5.0 v0.5.1`). CHANGELOG.md headings list `[0.5.1] - 2026-05-05`, `[0.4.0] - 2026-04-28`, `[0.3.0] - 2026-04-23`, `[0.2.0]`, `[0.1.0]`. The compare-link footer block ends with:

```
[Unreleased]: <not-yet-pushed: compare against v0.4.0 once pushed>
[0.4.0]: <not-yet-pushed: …>
[0.3.0]: <not-yet-pushed: …>
[0.2.0]: <unreleased: …>
[0.1.0]: <unreleased: …>
```

`[0.5.0]` and `[0.5.1]` slots are missing entirely. Any markdown renderer (GitHub web view, IDE preview, doc-site generator) that resolves the `[0.5.1]` heading-link into a footer URL will surface as unresolved or fall through to the empty default. The `Unreleased` body still says `compare against v0.4.0 once pushed` even though `v0.5.1` is already the latest tag.

The existing `scripts/check-changelog-tags.sh` gate iterates over present footer entries and verifies each resolves to a real local tag; it does NOT enforce that every `## [X.Y.Z]` heading has a matching footer entry. So the gate stays green while the footer drifts.

**Patch sketch:**
```diff
@@ CHANGELOG.md (footer)
-[Unreleased]: <not-yet-pushed: compare against v0.4.0 once pushed>
+[Unreleased]: <not-yet-pushed: compare against v0.5.1 once pushed>
+[0.5.1]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
+[0.5.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
 [0.4.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
```

And tighten the gate (`scripts/check-changelog-tags.sh`) to additionally assert that every `## [X.Y.Z]` heading has a matching footer entry — otherwise this drifts again on the next release.

---

## F02 — BENCHMARKS.md carry-forward rows demonstrably drift between 0.3.0 → 0.4.0

- **Severity:** HIGH
- **File:** `documentation/BENCHMARKS.md` § 2 rows 7, 8, 11, 12, 13, 14 (lines 87–94); § "Scope and honesty policy" carry-forward justification (lines 13–34)

The doc claims rows 3, 4, 5, 6, 10 were re-baselined at v0.4.0 N=5 and "other rows still show their last-published N=5 values (2026-04-25 0.3.0 medians, carried forward; methodology contract says these are stable across the 0.3.0 → 0.4.0 perf-sensitive code paths". This claim is empirically false — the v0.4.0 N=5 data EXISTS in `baseline-2026-05-02.json` (15 EvaluationRuns) for those same rows, and the deltas exceed the methodology section's published 5%-throughput / 10%-latency regression thresholds:

| Row | Metric | Doc value (0.3.0 carry-fwd) | 2026-05-02 v0.4.0 N=5 | Delta |
|---|---|---|---|---|
| 7 | enrichment p95 | 45.4 ms | 46.7 ms | +2.9 % |
| 7 | enrichment p99 | 114.0 ms | 112.6 ms | −1.2 % |
| 8 | hybrid retrieval p50 | 184 μs | 204 μs | **+10.9 %** |
| 8 | hybrid retrieval p95 | 223 μs | 233 μs | +4.4 % |
| 11 | BFS μs | 42.7 μs | 48.5 μs | **+13.5 %** |
| 12 | PageRank iter μs | 604 μs | 652 μs | **+8.0 %** |
| 13 | scaling 10k read p95 | 0.26 μs | 0.375 μs | **+44 %** |
| 13 | scaling 10k load | 0.29 s | 0.32 s | +10 % |
| 13 | scaling 10k RSS | 27.2 MB | 28.0 MB | +3 % |
| 14 | resources cpu_user | 1.45 s | 1.51 s | +4 % |
| 14 | resources rss_peak | 30.3 MB | 28.0 MB | −7.6 % |

Three rows breach the doc's own 5%-throughput / 10%-p99-latency `evaluator-diff-engine` thresholds (entry id `evaluator-diff-engine` in `release-tests.yaml` line 113). Publishing the older 0.3.0 numbers under a "0.4.0 N=5" column header is a methodology violation.

**Patch sketch:** either (a) update rows 7, 8, 11, 12, 13, 14 to the `baseline-2026-05-02.json` v0.4.0 N=5 values and remove the "carry-forward" claim, or (b) keep carry-forward but mark the affected rows with `(0.3.0 carry-forward — 0.4.0 N=5 differs by +X%)` so the reader knows the column header is editorial, not measured.

---

## F03 — BENCHMARKS.md row 9 ignores the v0.4.0 N=5 datapoint that exists

- **Severity:** HIGH
- **File:** `documentation/BENCHMARKS.md` § 2 row 9 (line 89)

Row 9 (concurrent_writes) shows `300 commits/s` in the published table. `baseline-2026-05-02.json::ai_agent/concurrent_writes` (v0.4.0 N=5 median) reports `294.6 commits/s`. The v0.4.0 datapoint exists in the same JSON the rest of § 2 cites; row 9 was not in the explicitly-re-baselined-rows-3-4-5-6-10 list and is silently using the 2026-04-25 v0.3.0 number (`300.484 commits/s`). The 1.8 % delta is small, but the published value is provably from the wrong release.

**Patch sketch:**
```diff
@@ documentation/BENCHMARKS.md row 9
-| 9 | Concurrent multi-agent writes (commits/s), N=4 threads × 500 ops | **300 commits/s** (N=5 median) …
+| 9 | Concurrent multi-agent writes (commits/s), N=4 threads × 500 ops | **295 commits/s** (0.4.0, N=5 median, 2026-05-02 re-baseline) …
```

---

## F04 — `.github/workflows/ci.yml` semver-checks job has a syntax error (dormant, but lethal on un-skip)

- **Severity:** HIGH
- **File:** `.github/workflows/ci.yml` lines 240–248

```yaml
      - name: cargo semver-checks check-release
        run: |
          set -euo pipefail
          for crate in ogdb-types ogdb-vector ogdb-text ogdb-temporal \
                       ogdb-algorithms ogdb-import ogdb-export \
                       ogdb-core ogdb-bolt ogdb-cli; do
            cargo semver-checks check-release -p "$crate"
          done
          done    ←  EXTRA `done`
```

Line 248 is a stray `done` after the loop has already closed on line 247. The semver-checks job has `if: false` (line 209) so the bash never runs today, but the moment the maintainer flips `if: true` after first crates.io publish lands, the bash interpreter aborts with `bash: line N: syntax error near unexpected token 'done'`. The structural-lint suite (`scripts/test-release-workflow.sh`) does not parse the bash bodies inside `run: |` blocks, so this drift slipped past gating.

**Patch:**
```diff
@@ .github/workflows/ci.yml
             cargo semver-checks check-release -p "$crate"
           done
-          done
```

---

## F05 — `scripts/check-benchmarks-version.sh` only checks BENCHMARKS.md headline; ignores the table column header that's now stale

- **Severity:** HIGH
- **File:** `scripts/check-benchmarks-version.sh:39`, `documentation/BENCHMARKS.md:79`

The gate reads `head -n1 documentation/BENCHMARKS.md`, extracts an `X.Y.Z` token, and asserts equality with `Cargo.toml::workspace.package.version`. Today: headline = `OpenGraphDB 0.5.1` (matches workspace) → gate green.

But `documentation/BENCHMARKS.md:79` (the § 2 table column header that the rest of the table is "OpenGraphDB X.Y.Z" against) reads:
```
| # | Metric | OpenGraphDB 0.4.0 | Neo4j published | …
```

The 0.5.1 patch-release note (line 3) explains the carry-forward, but the column header is the load-bearing claim shown to a reader scanning the table — and it now lies about which release the numbers came from. Worse, the gate is built specifically to prevent this drift class (per its EVAL-PERF-RELEASE.md Finding 1 banner) and its check is too narrow.

**Patch sketch:**
```bash
# In scripts/check-benchmarks-version.sh after the existing headline check:
TABLE_VERSION=$(grep -oE 'OpenGraphDB [0-9]+\.[0-9]+\.[0-9]+' "$BENCHMARKS_MD" | head -n2 | tail -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [[ "$TABLE_VERSION" != "$WS_VERSION" ]] && ! grep -q "patch-release no-op note" "$BENCHMARKS_MD"; then
  echo "check-benchmarks-version: TABLE COLUMN VERSION DRIFT ($TABLE_VERSION ≠ $WS_VERSION)" >&2
  exit 1
fi
```

(Or, if the carry-forward is intentional, change the table column header to `OpenGraphDB 0.5.1 (carry-forward 0.4.0 N=5)`.)

---

## F06 — Install-pipeline BLOCKER fix has no entry in `release-tests.yaml`

- **Severity:** HIGH
- **File:** `.claude/release-tests.yaml` (gap), `scripts/install.sh`, `.github/workflows/release.yml`, recent commits `1a56bb2` / `0172208` / `4f58a29`

Commits since v0.4.0:
- `1a56bb2 fix(install): repair v0.5.0 install pipeline + cut v0.5.1` — patched `detect_target()` asset URL template + `OGDB_VERSION=latest` resolver + curl --fail + extract for `.tar.xz`/`.zip`. Real-user E2E test against `v0.5.0` curl-404'd; this was a shipped BLOCKER that escaped CI.
- `0172208 fix(release.yml): scope sha256sum to archive files (not staging dirs)` — `find . -maxdepth 1 -type f` fix.
- `4f58a29 fix(release.sh): fallback to PowerShell Compress-Archive on Windows runners`.

None of these have a regression test entry in `.claude/release-tests.yaml`. The manifest comment (line 4) explicitly says *"every test that was added to fix a specific bug"* — three BLOCKER/HIGH fixes in one week, zero new entries. This is exactly the failure mode the manifest exists to prevent.

**Patch sketch:** add an entry with a smoke test that exercises `install.sh detect_target()` against the `release.yml::build.matrix` targets and asserts every produced asset URL pattern matches `ogdb-<version>-<target>.{tar.xz,zip}`:

```yaml
  - id: install-sh-asset-url-template
    task: fix-install-asset-name
    crate: scripts
    test: scripts/test-install-detect-target.sh
    function: []
    command: "bash scripts/test-install-detect-target.sh"
    purpose: "Guards the install-pipeline BLOCKER fixed in 1a56bb2 — install.sh detect_target() must emit asset URLs matching the rust-target triples in release.yml::build.matrix (x86_64-unknown-linux-gnu et al.) and the .tar.xz/.zip extensions release.sh produces. Catches re-introduction of the v0.5.0 curl-404 regression that escaped CI to a real user."
    added: 2026-05-05
```

(`scripts/test-install-detect-target.sh` to be added; trivial harness that loops the 5 OS/arch pairs and asserts URL-template match against `release.yml`.)

---

## F07 — `release-tests.yaml::is1-perf-recovery-after-monolith-split` has `test:` ↔ `command:` schema drift

- **Severity:** HIGH
- **File:** `.claude/release-tests.yaml:510-517`

```yaml
  - id: is1-perf-recovery-after-monolith-split
    task: fix-is1-cross-crate-inlining
    crate: ogdb-eval
    test: ldbc_snb_is1_driver
    function: []
    command: "OGDB_EVAL_BASELINE_JSON=/tmp/is1-gate.json cargo test --release -p ogdb-eval --test publish_baseline -- --nocapture"
```

Manifest schema (header lines 14–22) declares `test: the rust test target name (matches --test flag)`. The entry's `test:` field says `ldbc_snb_is1_driver` but the `command:` runs `--test publish_baseline`. Both files exist (`crates/ogdb-eval/tests/ldbc_snb_is1_driver.rs` and `crates/ogdb-eval/tests/publish_baseline.rs`), but the `test:` field is then a lie about what the manifest entry actually runs. Auto-tooling that uses `test:` as the source of truth (the manifest comment says the conductor's release gate scans this file) will run the wrong target.

Two ways out:
- (a) Replace `test: ldbc_snb_is1_driver` with `test: publish_baseline` (~12 min wall — matches what the command actually runs).
- (b) Replace the command with `cargo test --release -p ogdb-eval --test ldbc_snb_is1_driver` so both fields agree and the IS-1 gate becomes a cheap pin (~30 s) — but then the median-of-5 ≥18k qps gate the comment promises is gone, because the cheap test only runs one iter. Pick (a) and add a comment noting the test field intentionally maps to the master harness.

---

## F08 — CHANGELOG.md footer comment "Push status as of 2026-05-01" is stale

- **Severity:** MEDIUM
- **File:** `CHANGELOG.md` lines 237–241 (footer comment block)

```
  Push status as of 2026-05-01: no `v*` tag is pushed to origin
  (`git ls-remote origin --tags 'refs/tags/v*'` is empty). Update this
  block as part of the release-tag-push step in the public release runbook.
```

Today is 2026-05-05; v0.5.0 + v0.5.1 tags were cut locally between 2026-05-02 and 2026-05-05. The "as of 2026-05-01" date is now ≥4 days stale and the surrounding instructions point at a release runbook that should now say "five tags need pushing, not zero". Pairs with F01 — both should be fixed in the same patch.

---

## F09 — BENCHMARKS.md table column header reads `OpenGraphDB 0.4.0` while the document headline reads `0.5.1`

- **Severity:** MEDIUM
- **File:** `documentation/BENCHMARKS.md:79`

Headline (line 1) says `OpenGraphDB 0.5.1 — Competitive Benchmark Baseline`. The 0.5.1 patch-release note (line 3) explains why numbers carry forward. But the § 2 table column header (line 79) still reads `OpenGraphDB 0.4.0`, with no on-row breadcrumb that the table is one minor version older than the headline. A reader who jumps to § 2 (the most-cited section in any external reproducer / benchmark bake-off) reads "0.4.0" and assumes the headline is wrong, not that the patch-release was perf-no-op.

**Patch sketch:**
```diff
-| # | Metric | OpenGraphDB 0.4.0 | …
+| # | Metric | OpenGraphDB 0.5.1 (carry-fwd 0.4.0 N=5) | …
```

(Pairs with F05's gate-tightening so the headline-vs-column drift can't recur.)

---

## F10 — KNOWN_BROKEN docker + cargo-publish jobs have no GitHub Issue filed

- **Severity:** MEDIUM
- **File:** GitHub Issues for `asheshgoplani/opengraphdb` (`gh issue list --state all --limit 30 -R asheshgoplani/opengraphdb` returns 0 issues — empty repo)

Per the eval task's pending-asks, both `release.yml::publish-crates` (CARGO_REGISTRY_TOKEN secret missing) and `release.yml::docker` (multi-platform QEMU build flake / suspected timeout) have been confirmed broken across multiple v* tag pushes. Neither has a GitHub Issue with a reproducer, the workaround, and an owner. Tracking known-broken release-pipeline jobs only via inline comments in the workflow YAML and the eval doc cycle-after-cycle is the failure mode `release-tests.yaml` was created to prevent at the test level — apply the same discipline at the workflow level.

**Patch sketch:** open two issues — `release.yml::publish-crates fails with empty CRATES_TOKEN secret on every v* tag` and `release.yml::docker arm64 build times out under QEMU emulation on every v* tag` — each with: (a) repro = link to the failed run, (b) root cause = the one-line summary above, (c) workaround = either "set the secret" or "drop arm64 from platforms: until self-hosted runner". Reference the issue URLs from the inline workflow comments.

---

## F11 — `scripts/test.sh` runs `cargo test --workspace --all-targets` while CI also runs it independently

- **Severity:** MEDIUM
- **File:** `scripts/test.sh:104`, `.github/workflows/ci.yml:64`

`scripts/test.sh:104` runs `cargo test --workspace --all-targets`. CI's `quality` job runs `./scripts/test.sh` (covered) plus a separate `cargo test --workspace --doc` step (line 71 of ci.yml) — that is intentional dual-pinning per CYCLE4-H4. But the per-crate manifest entries in `.claude/release-tests.yaml` (63 entries) are NOT exercised by `scripts/test.sh::cargo test --workspace --all-targets`'s default-feature-set sweep — a test that requires `--features document-ingest` (`ogdb-import-extraction`) or `--features llm-anthropic,llm-openai,llm-local` (`real-llm-adapter-multi-provider`) won't run under `--all-targets` alone, even though the manifest names them as release-cut blockers. Result: a release cut that runs `scripts/test.sh` green can still ship with regressions in feature-flagged tests the manifest claims are gated.

**Patch sketch:** add a `scripts/run-release-tests.sh` driver that parses `.claude/release-tests.yaml` and runs every `command:` entry exactly as written (Python yaml + subprocess loop, ~30 lines), then wire that into `scripts/test.sh` as a final step or into `release.yml::tests`. Without this driver, the manifest is documentation, not gate.

---

## F12 — `scripts/test.sh:103` doc gate skips `--examples`

- **Severity:** LOW
- **File:** `scripts/test.sh:103`

```bash
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --all-features
```

`cargo doc` doesn't compile `examples/` rustdoc unless paired with `--examples`. None of the workspace crates ship `examples/` today (verified `find crates -path '*/examples/*.rs' -type f` is empty), so this is dormant. But the cycle-3 ratchet (CYCLE3 §H9) was added to "catch broken intra-doc links, malformed `rust blocks, and dead links at PR time"; the moment the first crate-level example lands (one of the v0.5.x roadmap items per the doc note in semver-checks), the gate silently skips it. Cheap fix: add `--examples` flag now.

**Patch:**
```diff
-RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --all-features
+RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --all-features --examples
```

---

## Cross-references

- F01, F08 share the CHANGELOG.md footer fix surface — bundle in one patch.
- F02, F03, F09 share the BENCHMARKS.md re-baseline surface — bundle.
- F05 ties F09 closed structurally so re-occurrence of the column-header drift is gated.
- F06 + F11 together close the manifest-as-actual-gate gap: F06 adds the missing entry, F11 makes the manifest mechanically run in CI.
- F10 is the only finding that requires opening external (GitHub Issues) artefacts; everything else is in-tree.

## What was checked and not flagged

- `scripts/test-release-workflow.sh` — passes; the structural lints over `release.yml` are sound.
- `scripts/test-dockerfile.sh` — not run end-to-end here (no docker daemon), but Dockerfile structure inspected and the SPA/cargo two-stage layout is correct.
- `scripts/check-benchmarks-version.sh` — runs green on this HEAD; weakness flagged as F05.
- `scripts/check-changelog-tags.sh` — runs green on present footer entries; weakness (no coverage check over headings) flagged as part of F01.
- `scripts/workflow-check.sh` — runs green; the placeholder bullet under `[Unreleased]` (`32c472e` commit) trivially satisfies layer 1 and there are no `feat(` commits since `v0.5.1` so layer 2 short-circuits. Acceptable.
- `release-tests.yaml` 63 entries — every `crate/<test>.rs` and `frontend/<spec>.spec.ts` path resolves on disk. No deleted files referenced.
- `baseline-2026-05-02.json` — schema_version 1.0 across all 15 runs; binary.version 0.4.0; aggregation `median-of-5-iters`; all metrics populated. JSON is sound. Drift is in the doc's row choices, not the JSON.
