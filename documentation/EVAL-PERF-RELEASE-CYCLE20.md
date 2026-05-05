# EVAL-PERF-RELEASE — Cycle 20

- **Eval area:** PERF-RELEASE
- **Workspace HEAD:** `fb0ec7a` (origin/main, 2026-05-05; post path-sweep + migration-spec wins-section restructure)
- **Worktree:** a fresh detached worktree off `origin/main`
- **Scope:** `documentation/BENCHMARKS.md`, `documentation/evaluation-runs/baseline-2026-{05-02,05-01,04-25}.json`, `.claude/release-tests.yaml`, `scripts/test.sh`, `scripts/check-*.sh`, `scripts/test-*.sh`, `scripts/release.sh`, `scripts/install.sh`, `scripts/verify-claims.sh`, `scripts/workflow-check.sh`, `.github/workflows/{ci,release,verify-claims}.yml`, `CHANGELOG.md`, `skills/opengraphdb/SKILL.md`, `skills/opengraphdb/references/benchmarks-snapshot.md`, `documentation/MIGRATION-FROM-NEO4J.md`, `documentation/DESIGN.md` (path-coherence cross-check).
- **Methodology:** read-only inspection on a fresh detached worktree off `origin/main` @ `fb0ec7a`. Did NOT run `cargo bench` / `cargo test --workspace` / any release-pipeline workflows. Diffed every BENCHMARKS.md table cell + every skills-mirror cell against `baseline-2026-05-02.json` (15 EvaluationRuns, schema v1.0, version=0.4.0, N=5 medianed) to ground-truth the numbers. Ran every wired gate (`check-benchmarks-version`, `check-benchmarks-vocabulary-mirror`, `check-init-agent-syntax`, `check-install-demo-path-matches-binary-default`, `check-changelog-tags`, `check-changelog-paths`, `check-doc-anchors`, `check-public-doc-tmp-leak`, `check-binary-name`, `check-security-supported-version`, `check-skills-copilot-removed`, `check-contributing-coverage-claim`, `check-npm-package-github-url`, `check-followup-target-not-current`, `check-npm-version`, `check-pypi-version`, `check-crate-metadata`, `check-shipped-doc-coverage`, `test-workflow-bash-syntax`, `test-install-detect-target`, `test-release-workflow`, `test-dockerfile`, `test-ci-bench-regression`, `test-all-check-scripts-wired`, every meta-test for the new c18+c19 gates) standalone — all green.
- **Cycle-18+19 dedup:** read `git show origin/eval/c18-perf-release-91ee552:documentation/EVAL-PERF-RELEASE-CYCLE18.md`. Per the cycle-20 brief, cycle-19 perf-release eval was dropped (dead-claude flake), so cycle-20 is the first proper baseline since cycle-18. The user states cycle-18 was "0B+1H closed by 28b49b6 (skills mirror sweep)." Verified `28b49b6` scope: it touches **only** rows 3 + 4 in `benchmarks-snapshot.md`, the verdict-string on row 10 of `benchmarks-snapshot.md`, the verdict-string on row 5 of `SKILL.md` (rerank), and the strict-bucketing scorecard line. **The other eleven rows in `benchmarks-snapshot.md` and four rows in `SKILL.md`'s "Performance you can expect" table were NOT touched** — see F01 below. C18 F02 (`workflow-check.sh` Layer 2 feat-only), F03 (`test-install-detect-target.sh` runs under bash not sh), F04 (`release-tests.yaml::install-sh-asset-url-template` test-field naming), F05 (`check-public-doc-tmp-leak.sh` skip skills/) are all still open verbatim in the live tree — re-flagged below as F02 / F03 / F04 / F05 (now widened).

## Summary

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| HIGH | 1 | F01 |
| MEDIUM | 2 | F02 — F03 |
| LOW | 3 | F04 — F06 |

KNOWN_BROKEN release-pipeline jobs (carried forward verbatim from cycle-18; tracked separately in `pending_asks`, NOT re-flagged here):

- `release.yml::publish-crates` — `CARGO_REGISTRY_TOKEN` (mapped from `secrets.CRATES_TOKEN`, `release.yml:325`) unset; `cargo publish` 401s on first real `v*` tag push. Workaround: maintainer sets `CRATES_TOKEN` repo secret before next tag.
- `release.yml::docker` — multi-platform `linux/amd64,linux/arm64` build under QEMU emulation has been flaky in prior runs (`release.yml:410`). Workaround: drop `linux/arm64` until self-hosted aarch64 runner is available, or split docker into two single-platform jobs so amd64 always lands.

---

## F01 — Skills-mirror benchmarks: 28b49b6 swept rows 3+4 + the literal `DIRECTIONAL WIN` token but left **eleven** other rows publishing 0.3.0 numerics under a "0.4.0 carry-fwd" label, the measurement-date headline still says 2026-04-25, and a lowercase `directional WIN` slipped through the c18 vocab-mirror gate

- **Severity:** HIGH
- **Files:** `skills/opengraphdb/references/benchmarks-snapshot.md:5-6,17,23-24,27-36`; `skills/opengraphdb/SKILL.md:276-285`. Cross-referenced against `documentation/evaluation-runs/baseline-2026-05-02.json` (0.4.0 N=5; 15 runs; schema v1.0) and `documentation/BENCHMARKS.md:113-118`. Gate-coverage gap: `scripts/check-benchmarks-version.sh:19` (`BENCHMARKS_MD="$ROOT/documentation/BENCHMARKS.md"`) only scans the canonical doc; `scripts/check-benchmarks-vocabulary-mirror.sh:32-36` enforces only three case-sensitive forbidden tokens (`DIRECTIONAL WIN`, `crushing`, `3 wins / 2 losses / 6 novel`) — no gate enforces cell-level numerical equivalence between BENCHMARKS.md and the npm-shipped mirror, and lowercase verdict variants escape the vocab gate entirely.

`28b49b6` is real progress over the c18 F01 state, but it left the underlying "skills mirror diverges from canonical doc" failure-class open on three independent axes:

### (a) Numerical drift: 11/14 rows of `benchmarks-snapshot.md` + 4/5 rows of SKILL.md table still publish 0.3.0 numerics

`28b49b6` updated rows 3 and 4 of `skills/opengraphdb/references/benchmarks-snapshot.md` (the worst-drift rows — point-read and 2-hop). Cells 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 were left at the 0.3.0 N=5 numerics from `baseline-2026-04-25.json`. Diffing the live skill-mirror cells against `baseline-2026-05-02.json` (the actual 0.4.0 baseline that the wrapper sentence at line 5 claims to carry forward):

| Skills row (`benchmarks-snapshot.md`) | Snapshot cell | `baseline-2026-05-02.json` (actual 0.4.0 N=5) | Drift |
|---|---|---|---|
| 1 bulk ingest | **254 nodes/s** | 251.06 nodes/s | shipped value rounded from 0.3.0 baseline |
| 2 streaming ingest | **301 nodes/s** | 299.61 nodes/s | shipped value rounded from 0.3.0 baseline |
| 3 read p50/p95/p99 | 5.8 / 6.8 / 11.8 μs ✅ | 5.84 / 6.84 / 11.78 μs | **swept by 28b49b6** |
| 4 2-hop p50/p95/p99 | 22.9 / 25.8 / 36.0 μs ✅ | 22.91 / 25.76 / 36.02 μs | **swept by 28b49b6** |
| 5 IS-1 p50/p95/p99 | **22.2 / 232 / 365 μs** | 18.33 / 162.79 / 221.94 μs | **−21 % p50, −30 % p95, −39 % p99**; row also publishes 18.9k qps but actual is 25.9k (+37 %) |
| 6 mutation p95/p99 | **13 687 / 15 668 μs** | 12 980.69 / 15 939.43 μs | p95 −5 %, p99 +1.7 %; "71 ops/s" should be 72 |
| 7 enrichment p50/p95/p99 | **38.5 / 45.4 / 114.0 ms** | 38.77 / 46.72 / 112.63 ms | drift on every percentile |
| 8 hybrid p50/p95/p99 | **184 / 223 / 245 μs** | 204 / 233 / 246 μs | p50 +11 % drift; the p50 value of 204 is what BENCHMARKS.md flags as breaching the 5 % throughput / 10 % latency thresholds in its deltas table at L46 |
| 9 concurrent commits | **300 commits/s** | 294.62 commits/s | drift |
| 10 rerank p50/p95/p99 | **1.27 / 1.35 / 1.50 μs** | 1.275 / 1.343 / 1.624 μs | p99 +8 %; verdict-string on this row WAS swept by 28b49b6 but the *numbers* on the same row were not |
| 11 BFS | **42.7 μs** | 48.47 μs | **+13.5 % drift** — same regression BENCHMARKS.md flags transparently in deltas table at L52 |
| 12 PageRank iter / 20-iter total | **604 μs/iter × 20 = 12.1 ms** | 652 μs/iter × 20 = 13.0 ms | **+8 % drift** |
| 13 scaling 10k read p95 / load / RSS | **0.26 μs / 0.29 s / 27.2 MB** | 0.375 μs / 0.319 s / 28.0 MB | **read p95 +44 %**; load +10 %; RSS +3 % |
| 14 resources cpu_user / RSS peak | **1.45 s / 30.3 MB** | 1.51 s / 28.0 MB | drift (RSS understated by 8 %; cpu under-reported) |

Same problem on the SKILL.md "Performance you can expect" table at lines 276-285 (4 of 5 rows still 0.3.0):

| SKILL.md row (`skills/opengraphdb/SKILL.md`) | Cell | Actual 0.4.0 N=5 | Drift |
|---|---|---|---|
| L281 Point read p50/p95/p99 | **7.1 / 11.2 / 13.4 μs** (119k qps) | 5.8 / 6.8 / 11.8 μs (166k qps) | row was NOT touched by 28b49b6; same file, same baseline-update PR, just missed |
| L282 IS-1 p50/p95 | **22.2 / 232 μs** (18.9k qps) | 18.3 / 163 μs (25.9k qps) | NOT touched |
| L283 Enrichment p95 | **45.4 ms** | 46.7 ms | NOT touched |
| L284 Hybrid p95 | **223 μs** | 233 μs | NOT touched |
| L285 Rerank p95 | **1.35 μs** | 1.34 μs | numerically near-match; verdict-string toned down by 28b49b6 |

### (b) Headline + wrapper sentence both claim "0.4.0 carry-fwd" — both untrue

- `skills/opengraphdb/references/benchmarks-snapshot.md:5` — wrapper sentence reads "The table below carries forward the 0.4.0 N=5 medianed numbers — zero perf-relevant code in the 0.4.0 → 0.5.1 window." The values diff above shows this is false for 11 of 14 rows.
- `skills/opengraphdb/references/benchmarks-snapshot.md:17` — `Measurement date: 2026-04-25`. That is the 0.3.0 N=5 baseline date. `documentation/BENCHMARKS.md:5` says `Measurement date: 2026-05-02`. The skills mirror is silently four weeks behind, agent-facing, with no note that it's stale.
- The two together are the same trap c15 + c16 + c18 closed for the canonical doc and missed for the npm-shipped surface: the version label moves with the workspace bump, the cells stay frozen at the previous baseline, and a wrapper sentence asserts the cells were brought forward.

### (c) Lowercase verdict variant slips through the c18 vocab-mirror gate

`scripts/check-benchmarks-vocabulary-mirror.sh:32-36` defines:

```bash
FORBIDDEN=(
  'DIRECTIONAL WIN'
  'crushing'
  '3 wins / 2 losses / 6 novel'
)
```

and `scripts/check-benchmarks-vocabulary-mirror.sh:60` runs `grep -nF "$token" "$p"` (case-sensitive). `skills/opengraphdb/SKILL.md:281` ships:

```
| Point read `neighbors()` p50 / p95 / p99 @ 10k nodes | **7.1 / 11.2 / 13.4 μs** (119k qps) | p95 < 5 ms | ⚠️ directional WIN (80× under Memgraph Pokec p99) |
```

Lowercase `d` in `directional WIN`. The gate's case-sensitive `grep -F "DIRECTIONAL WIN"` does not match. Verified by re-running both case-sensitive and case-insensitive sweeps:

```
$ grep -nE "directional WIN|crushing|3 wins / 2 losses / 6 novel" -i \
    skills/opengraphdb/SKILL.md \
    skills/opengraphdb/references/benchmarks-snapshot.md \
    documentation/BENCHMARKS.md documentation/MIGRATION-FROM-NEO4J.md
skills/opengraphdb/SKILL.md:281: ... ⚠️ directional WIN (80× under Memgraph Pokec p99) ...
```

Case-sensitive grep returns nothing (the gate passes); case-insensitive returns the SKILL.md hit. The c17 e585f66 retracted ALL such "directional WIN" claims from the canonical doc; the c18 F02-class gate exists specifically to enforce mirror-doc parity on this vocabulary. The lowercase variant is a literal bypass of the gate's stated purpose.

### Why this is HIGH again, despite 28b49b6 being real work

The issue is not the number of cells fixed — it is that the user-facing surface (the npm `opengraphdb-skills` bundle, rendered into AI-agent context on `ogdb init --agent-id <ID>`) shipped to readers makes three contradictory claims at once: (a) "this is OpenGraphDB 0.5.1," (b) "the table carries forward the 0.4.0 N=5 medianed numbers," (c) values from `baseline-2026-04-25.json` (the 0.3.0 N=5 baseline). An agent reading row 13 sees `read p95 = 0.26 μs` when the actual 0.4.0 number is 0.38 μs (44 % understatement); row 5 IS-1 p99 reads 365 μs when the actual is 222 μs (39 % overstatement) — both off by margins that change the verdict the row is asserting.

The c18 F01 patch sketch had two layers: (1) sweep the cells, (2) close the gate-coverage gap. Layer 1 was partially applied (rows 3+4); Layer 2 was not applied at all. Without Layer 2, the next BENCHMARKS.md baseline-update PR will hit the same partial-sweep failure mode.

**Patch sketch (three independent layers; pick the first you can land):**

1. **Cell sweep — the smallest change:** apply the cycle-18 F01 patch sketch to the remaining 11 + 4 rows. Update headline `Measurement date:` to `2026-05-02`. Drop the wrapper-sentence claim until the cells actually match.

2. **Vocab-mirror gate widening — closes (c) above:**

```diff
@@ scripts/check-benchmarks-vocabulary-mirror.sh:60
-    done < <(grep -nF "$token" "$p" || true)
+    # EVAL-PERF-RELEASE-CYCLE20 F01: case-insensitive match — c17 e585f66
+    # retracted both `DIRECTIONAL WIN` and `directional WIN` (any casing).
+    # Token list lives uppercase for readability; matching must be -i.
+    done < <(grep -niF "$token" "$p" || true)
```

3. **Cell-mirror gate — closes the (a) + (b) failure-class permanently:** introduce `scripts/check-benchmarks-cell-mirror.sh` (paired meta-test) that asserts every numerical cell in `skills/opengraphdb/references/benchmarks-snapshot.md` AND in the SKILL.md "Performance you can expect" table equals the same cell in `documentation/BENCHMARKS.md` § 2 (within a documented tolerance, e.g. ≤ 1 % rounding noise). Wire from `scripts/test.sh`. Same template as `check-benchmarks-version.sh` extended to cells. Alternative — generate the skill-mirror cells at build-time from BENCHMARKS.md so divergence is mechanically impossible.

Either layer 2 alone or layer 3 alone is enough to close the gate gap; layer 1 is the fix to the current shipped state.

---

## F02 — `scripts/workflow-check.sh` Layer 2 still feat(-only; the lone `feat(` commit since `8496878` is `5f3ec88` (which already has [Unreleased] coverage), but every other commit type still ships ungated

- **Severity:** MEDIUM
- **Files:** `scripts/workflow-check.sh:117-136` (Layer 2 grep filter), `CHANGELOG.md:7-22` ([Unreleased] body), `git log 8496878..fb0ec7a`. Carry-forward from cycle-16 F04 / cycle-18 F02.

Verbatim from the still-shipped script (`scripts/workflow-check.sh:136`):

```bash
done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|!:|:)' -z)
```

Only `feat(` commits are collected. Since the cycle-15 changelog-split commit `8496878`, the commit-traffic on `main` is overwhelmingly `fix(` / `docs(`. The c18 eval enumerated 11 such commits; cycle-19 + cycle-20 added more (`28b49b6`, `1957b55`, `6c17c3d`, `ae7ebb5`, `fb0ec7a`, `5f3ec88`, `c87c4f6`, `32c472e` and the various `chore(release)` appends — none of these `fix(` / `docs(` / `chore(` commits trip Layer 2 because Layer 2 only looks at `feat(`). The AGENTS.md rule ("every merged change land an `[Unreleased]` bullet") is unenforced for the only commit types actually landing.

This finding is unchanged in shape from c18 F02 — the commit list grew by ~10 entries, the regex did not move. Re-flagged because the underlying gap is wider than it was four weeks ago.

**Patch sketch (same as c18 F02; backfill `[Unreleased]` in the same PR so it lands green):**

```diff
@@ scripts/workflow-check.sh:136
-done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|!:|:)' -z)
+# EVAL-PERF-RELEASE-CYCLE20 F02 (carry-forward from C16/C18): extend Layer 2
+# to fix(/docs(/refactor(/perf( commits — chore(/test(/style( stay excluded
+# as implicit non-user-facing. Without this widening every fix( commit since
+# 8496878 has shipped with no [Unreleased] coverage.
+done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E \
+         --grep='^(feat|fix|docs|refactor|perf)(\(|!:|:)' -z)
@@ scripts/workflow-check.sh:121
-  topic="$(printf '%s' "$subject" | sed -E 's/^feat(\([^)]*\))?!?:[[:space:]]*//I')"
+  topic="$(printf '%s' "$subject" | sed -E 's/^(feat|fix|docs|refactor|perf)(\([^)]*\))?!?:[[:space:]]*//I')"
@@ scripts/workflow-check.sh:140
-  echo "ERROR: ${#failed_commits[@]} feat( commit(s) since ${released_tag} have no matching keyword under [Unreleased]:" >&2
+  echo "ERROR: ${#failed_commits[@]} feat(/fix(/docs( commit(s) since ${released_tag} have no matching keyword under [Unreleased]:" >&2
```

---

## F03 — `scripts/test-install-detect-target.sh` still evaluates `install.sh::detect_target()` under `bash` while `install.sh` itself targets POSIX `sh` — bash-only-syntax regressions slip through

- **Severity:** MEDIUM
- **Files:** `scripts/test-install-detect-target.sh:48` (`bash -c`), `scripts/install.sh:1` (`#!/usr/bin/env sh`). Carry-forward from cycle-16 F06 / cycle-18 F03.

The current `scripts/test-install-detect-target.sh:46-60` is verbatim what cycle-18 flagged:

```bash
out=$(
  OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
    c_red() { printf "ERR: %s\n" "$1" >&2; }
    uname() { case "$1" in -s) printf "%s" "$OS_NAME" ;; -m) printf "%s" "$ARCH" ;; *) command uname "$@" ;; esac }
    eval "$DETECT_FN"
    detect_target
  '
)
```

`scripts/install.sh:1` is `#!/usr/bin/env sh` and `:14` is `set -eu` (no `-o pipefail`, no bash). The documented distribution path is `curl -fsSL …/install.sh | sh` — which on Debian/Ubuntu is `dash`, on Alpine/BusyBox is `ash`. Bash-only syntax inside `detect_target()` (`[[ ... ]]`, `${var^^}`, `arr=(…)`, `<(…)`) silently passes this gate (bash supports it) and breaks on real-user installs.

**Patch sketch (unchanged from c18 F03):**

```diff
@@ scripts/test-install-detect-target.sh:48
-    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
+    # EVAL-PERF-RELEASE-CYCLE20 F03 (carry-forward C16/C18): run under POSIX sh
+    # to match the real `curl … | sh` distribution path. install.sh's shebang
+    # is /usr/bin/env sh; exercising under bash hides bash-only-syntax regressions.
+    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" sh -c '
```

(Or run twice — once under `sh`, once under `bash` — so both shells are gated explicitly.)

---

## F04 — `.claude/release-tests.yaml` `test:` field schema-drift now spans 17 of 64 entries, not just the install-sh one cycle-18 caught

- **Severity:** LOW
- **Files:** `.claude/release-tests.yaml:14-23` (manifest schema header), `:620-627` (install-sh entry), plus 16 other entries enumerated below. Carry-forward from cycle-16 F07 / cycle-18 F04, **widened with new evidence**.

The manifest header at `.claude/release-tests.yaml:19` declares `test: the rust test target name (matches --test flag)` — singular target name. Cycle-18 F04 flagged exactly one entry (`install-sh-asset-url-template`) for using a cargo-target-style name on a bash script. Counting more carefully across the live manifest, the same field is being used to encode three different things, none of them strictly conformant to the documented schema:

| Drift class | Count | Examples (id : `test:` value) |
|---|---|---|
| Multi-test comma-list (≥ 2 cargo `--test` targets) | 6 | `evaluator-drivers-e2e: ldbc_mini_fixture, ldbc_snb_is1_driver, graphalytics_driver, criterion_ingest_driver, scaling_driver` ; `skill-quality-dimension-driver` ; `skill-regression-closed-loop` ; `real-llm-adapter-multi-provider` ; `hnsw-vector-index-acceptance` ; `unwind-in-core-physical-operator` |
| Frontend e2e path-style | 10 | `playground-schema-browser-e2e: e2e/schema-browser` ; `playground-polish-cohesion-e2e: e2e/polish-cohesion` ; `claims-power-tab-real-cypher-e2e: e2e/claims/power-tab-real-cypher` ; `claims-schema-tab-real-backend-e2e: e2e/claims/schema-tab-real-backend` ; `obsidian-graph-quality-e2e: e2e/obsidian-graph` ; `rdf-import-real-e2e: e2e/rdf-import-real` ; `cookbook-snippets-runnable: e2e/cookbook-snippets-runnable` ; `migration-guide-snippets-runnable: e2e/migration-guide-snippets` ; `c9-playground-values-real: e2e/c9-playground-values` ; `c9-perf-strip-cells-r6: e2e/reposition/R6-perf-strip` |
| Bash-script entry encoded as cargo target name | 1 | `install-sh-asset-url-template: install_sh_detect_target` (the exact c18 F04 finding) |
| (Aside) `test: lib` for unit tests run via `--lib` | 3 | `wcoj-two-expand-chain-under-30s` ; `wcoj-cost-comparison-under-5s` ; `correctness-core-poisoned-lock-registry` — all use `cargo test … --lib` in `command:` |

The `command:` field is the source of truth at run-time, so the gates DO actually run. The `test:` field is a documentation contract for downstream tooling: any consumer that takes `crate` + `test` and constructs `cargo test --test "$test"` builds an invalid command for 17 entries. The single inline acknowledgement that exists (`is1-perf-recovery-after-monolith-split` at line 514) is a one-off — the schema header itself was never updated to reflect what the field is actually being used for.

**Patch sketch (two layers — pick one):**

1. **Field-shape sweep (preferred — keeps the schema crisp):**

```diff
@@ .claude/release-tests.yaml:620-627  # install-sh-asset-url-template
-    test: "install_sh_detect_target"
+    test: "bash:scripts/test-install-detect-target.sh"
@@ # multi-test cargo entries — change to a list
-    test: "ldbc_mini_fixture, ldbc_snb_is1_driver, graphalytics_driver, criterion_ingest_driver, scaling_driver"
+    test: ["ldbc_mini_fixture", "ldbc_snb_is1_driver", "graphalytics_driver", "criterion_ingest_driver", "scaling_driver"]
@@ # frontend path-style entries
-    test: "e2e/c9-playground-values"
+    test: "playwright:e2e/c9-playground-values.spec.ts"
@@ # lib unit-test entries
-    test: "lib"
+    test: "lib:wcoj_two_expand_chain_completes_under_30s_guard"
```

2. **Schema-header documentation sweep (smallest change):** update the manifest preamble to document the four field shapes actually in use (`<rust-test-name>`, `[<rust-test-name>, ...]`, `bash:<path>`, `playwright:<spec>`, `lib:<#[test]>`) so downstream consumers can parse them. Either way, the `command:` field stays authoritative; this is purely about making the `test:` documentation contract consistent with reality.

---

## F05 — `scripts/check-public-doc-tmp-leak.sh` still excludes `skills/`; the npm-shipped agent surface is outside the leak gate

- **Severity:** LOW
- **Files:** `scripts/check-public-doc-tmp-leak.sh:7` (`SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)`), compared with `scripts/check-doc-anchors.sh` (which does include `skills`). Carry-forward from cycle-18 F05.

Verbatim unchanged from c18. The `skills/` tree is npm-published as `opengraphdb-skills`; `check-doc-anchors.sh` and `check-binary-name.sh` correctly include `skills/` in their scope; `check-public-doc-tmp-leak.sh` does not. Structural drift between parallel gate-scope inventories — pure prevention, no current leak.

**Patch sketch (unchanged from c18):**

```diff
@@ scripts/check-public-doc-tmp-leak.sh:7
-SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)
+# EVAL-PERF-RELEASE-CYCLE20 F05 (carry-forward C18): include skills/ — it ships
+# to npm as opengraphdb-skills and is rendered to AI agents on ogdb init --agent-id.
+# Parallels the scope of check-doc-anchors.sh / check-binary-name.sh.
+SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md skills)
```

---

## F06 — `documentation/DESIGN.md` § 34 still teaches `~/.opengraphdb/config.toml` as the (unshipped) config path; the cycle-19 path-coherence gate is scoped to runtime surfaces and skips `documentation/`

- **Severity:** LOW
- **Files:** `documentation/DESIGN.md:2092,2107`; cross-checked against `scripts/check-install-demo-path-matches-binary-default.sh:79-89` (the cycle-19 widening clause). NEW for cycle-20.

The cycle-19 `fb0ec7a` widening (§ "EVAL-DOCS-COMPLETENESS-CYCLE19 F01/F02/F03") expanded `check-install-demo-path-matches-binary-default.sh` to scan three runtime-affecting surfaces:

```bash
TARGETS=(
  "$ROOT/crates/ogdb-cli/src/init_agent.rs"
  "$ROOT/skills/opengraphdb/scripts"
  "$ROOT/skills/opengraphdb/references"
)
```

By design — these are the surfaces that materialise on user systems. `documentation/` is excluded. After the c18 `~/.opengraphdb` → `~/.ogdb` rename, two `documentation/DESIGN.md` lines still reference the OLD path:

```
documentation/DESIGN.md:2092: > `~/.opengraphdb/config.toml` → env vars → CLI flags → per-database
documentation/DESIGN.md:2107: - **No global `~/.opengraphdb/config.toml`** and no
```

L2092 sits inside a "Reality check (0.4.0)" historical block describing the rejected original Decision-4 sketch — it is genuinely historical context, defensible to keep verbatim. L2107 is in the **current** "Surface in 0.4.0" subsection, asserting "No global `~/.opengraphdb/config.toml`" — this is teaching the reader that the absent file would have lived under the OLD path. After the rename, the absent-file mention should reference the NEW path: a reader who later sees `~/.ogdb/demo.ogdb` materialise on their disk and then reads DESIGN.md will reasonably assume the config file would have been a sibling under `~/.ogdb/config.toml`, not under a directory they have no other reason to expect (`~/.opengraphdb/`).

This is shipped public spec text drift — not runtime-breaking, but it confuses readers about the project's path conventions, which is exactly what the cycle-19 sweep was trying to make uniform.

**Patch sketch (two layers — both are small):**

1. **Doc fix:**

```diff
@@ documentation/DESIGN.md:2107
-- **No global `~/.opengraphdb/config.toml`** and no
+- **No global `~/.ogdb/config.toml`** and no
   `OGDB_BUFFER_POOL_SIZE`-style env vars in 0.4.0. Document any
```

(Leave L2092 verbatim — it is correctly framed as historical context describing the rejected sketch's vocabulary.)

2. **Gate widening (optional — defensible scope decision either way):** add `documentation/` to the cycle-19 path-coherence gate's TARGETS, with an exemption for lines inside ` > ` blockquotes that explicitly mark themselves as historical (mirrors the `<!-- HISTORICAL -->` pattern the c18 vocab-mirror gate uses). Without layer 2, the next rename will repeat the same drift class.

---

## What was checked and not flagged

- `documentation/BENCHMARKS.md` rows 1–14 vs `baseline-2026-05-02.json`: every cell verified. Headline `Measurement date: 2026-05-02` agrees with column header `(carry-fwd 0.4.0 N=5)`; `scripts/check-benchmarks-version.sh` exits clean. The c18-era convergence of the canonical doc holds. F01 is purely about the npm-shipped MIRROR diverging from the canonical doc; the canonical doc itself is honest.
- `scripts/test-all-check-scripts-wired.sh` cycle-17 F04 meta-meta-test: green. `comm -23 <(ls scripts/check-*.sh) <(grep -oE 'scripts/check-[A-Za-z0-9-]+\.sh' scripts/test.sh)` is empty. Every `check-*.sh` on disk is invoked from `scripts/test.sh`, including the four c18+c19 additions: `check-benchmarks-vocabulary-mirror.sh` (wired @ test.sh:67), `check-init-agent-syntax.sh` (wired @ :69), `check-install-demo-path-matches-binary-default.sh` (wired @ :53). The `test-check-opengraphdb-path-coherence.sh` meta-test (the cycle-19 widening's test fixture; lives only as a test, not a separate gate) is wired @ test.sh:118. Each runs green standalone:
  - `bash scripts/check-init-agent-syntax.sh` → exit 0
  - `bash scripts/check-benchmarks-vocabulary-mirror.sh` → exit 0 (case-sensitive — see F01(c) for the lowercase escape)
  - `bash scripts/check-install-demo-path-matches-binary-default.sh` → exit 0 (install.sh OGDB_HOME=$HOME/.ogdb == binary default $HOME/.ogdb/demo.ogdb; init_agent.rs + skill bundle clean)
  - `bash scripts/test-check-opengraphdb-path-coherence.sh` → 7/7 cases pass (synthetic + live repo)
  - `bash scripts/test-check-init-agent-syntax.sh` → 3/3 cases pass
  - `bash scripts/test-check-benchmarks-vocabulary-mirror.sh` → 3/3 cases pass
- `.claude/release-tests.yaml` 64 entries: every `command:` resolves on disk (verified via parse + `os.path.exists` for every `bash <path>` form, every `cargo test … --test <name>` against `crates/<crate>/tests/<name>.rs`, every `npx playwright test e2e/<name>.spec.ts` against `frontend/e2e/<name>.spec.ts`). Three new entries since c18: `c9-playground-values-real` + `c9-perf-strip-cells-r6` (added 2026-05-02; both resolve to existing frontend specs) and `install-sh-asset-url-template` (added 2026-05-05; resolves to `scripts/test-install-detect-target.sh` — the same script F03 flags for sh-vs-bash drift). F04 is about the `test:` *documentation* field, not the `command:` execution field.
- `release.yml`: `tests` gate runs `bash scripts/test.sh`; `build` / `publish-crates` / `docker` all `needs: tests`; sha256sums emitter narrowed to archive files only (`release.yml:182`); `install.sh` staged into `dist/` for the release-asset bundle (`release.yml:215-218`); `release.sh` PowerShell `Compress-Archive` fallback present at `scripts/release.sh:103-105` for Windows runners without `zip`; `cargo-auditable` install with plain `cargo build` fallback (`release.sh:64`); idempotency check via `cargo search` before each `cargo publish` (`release.yml:347-353`). All consistent with c18 baseline.
- `release.sh` archive emission: ext mapping matches `release.yml::build.matrix` and `test-install-detect-target.sh` cases (`tar.xz` for linux+macos, `zip` for windows). `test-install-detect-target.sh` 5/5 PASS standalone (exit 0).
- `baseline-2026-05-02.json` schema: `schema_version 1.0` across all 15 runs; `binary.version 0.4.0`; aggregation `median-of-5-iters`. JSON sound. F01 is doc-side mislabeling on the skills mirror, not JSON drift.
- `scripts/workflow-check.sh` Layer 1 (empty-placeholder rejection from C15-F16 / `8496878` final clause + `5f3ec88` tightening): `[Unreleased]` is non-empty, gate exits 0. Cycle-19 `32c472e` added an Unreleased placeholder commit specifically to keep this layer green.
- All wired meta-tests (`test-check-{benchmarks-version,benchmarks-vocabulary-mirror,changelog-paths,contributing-coverage-claim,followup-target-not-current,init-agent-syntax,install-demo-path-matches,npm-package-github-url,opengraphdb-path-coherence,security-supported-version,skills-copilot-removed}.sh`): each PASS standalone with both green-fixture and red-fixture cases. The cycle-19 `test-check-opengraphdb-path-coherence.sh` Case 7 ("live repo root → pass") confirms the `~/.opengraphdb` → `~/.ogdb` sweep is structurally complete on the runtime surfaces (init_agent.rs + skill bundle scripts/refs); F06 is the doc-only residue outside the gate's scope.
- `scripts/check-benchmarks-version.sh` cycle-17 F03 scope-drift gate: green; the auto-generated rule fires only when every `^| N |` row carries `2026-05-02 re-baseline` AND the L5 headline doesn't mention `all N rows`. Output: `check-benchmarks-version: ok (0.5.1; headline + § 2 column header agree)`.
- KNOWN_BROKEN `release.yml::publish-crates` (`CRATES_TOKEN` unset; `cargo publish` 401s on first real `v*` push, `release.yml:325`) and `release.yml::docker` (multi-arch QEMU flake, `release.yml:410`) — both live and unchanged since c18. Tracked in `pending_asks`; explicitly out of scope per the cycle-20 brief.

## Cross-references

- F01 is the load-bearing finding: the c18 F01 patch sketch had two layers (cell sweep + gate-coverage gap closure); 28b49b6 applied **part** of layer 1 (rows 3+4 + uppercase verdict tokens) and zero of layer 2. The remaining 11+4 cells, the wrapper sentence, the measurement-date headline, AND the lowercase verdict escape are all symptoms of the same root cause: nothing mechanically enforces parity between BENCHMARKS.md and the npm-shipped mirror. Layers 2 + 3 of the patch sketch close the failure-class permanently.
- F02 / F03 / F04 / F05 are the four c18 carry-forwards. Cycle-18 F01 is the only one that received any patch (28b49b6); the four MED + LOW carry-forwards were not touched. F04's "now 17 entries, not just 1" widening is the only material new content vs c18; F02 / F03 / F05 are verbatim re-flags.
- F06 is the only entirely-new-this-cycle finding: a doc-only residue from the cycle-18 `~/.opengraphdb` → `~/.ogdb` rename that the cycle-19 path-coherence gate excluded by scope.
- `pending_asks` — `release.yml::publish-crates` (CRATES_TOKEN unset) and `release.yml::docker` (multi-arch QEMU flake) — remain KNOWN_BROKEN, tracked separately, NOT re-flagged here per the cycle-20 brief.
