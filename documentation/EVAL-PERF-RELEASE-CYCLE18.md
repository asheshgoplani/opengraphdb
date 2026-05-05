# EVAL-PERF-RELEASE — Cycle 18

- **Eval area:** PERF-RELEASE
- **Workspace HEAD:** `91ee552` (origin/main, 2026-05-05)
- **Worktree:** a fresh detached worktree off `origin/main`
- **Scope:** `documentation/BENCHMARKS.md`, `documentation/evaluation-runs/baseline-2026-{04-25,05-02}.json`, `.claude/release-tests.yaml`, `scripts/test.sh`, `scripts/check-*.sh`, `scripts/test-*.sh`, `scripts/release.sh`, `scripts/install.sh`, `scripts/verify-claims.sh`, `scripts/workflow-check.sh`, `.github/workflows/{ci,release,verify-claims}.yml`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `skills/opengraphdb/SKILL.md`, `skills/opengraphdb/references/benchmarks-snapshot.md`.
- **Methodology:** read-only inspection on a fresh detached worktree off `origin/main` @ `91ee552`. Did NOT run `cargo bench` or any release-pipeline workflows. Diffed every BENCHMARKS.md table cell + every skills-mirror cell against `baseline-2026-05-02.json` (15 EvaluationRuns, schema v1.0, version=0.4.0, N=5 medianed) AND against the cycle-9 `baseline-2026-04-25.json` (0.3.0 N=5). Ran every wired gate (`check-changelog-tags`, `check-changelog-paths`, `check-doc-anchors`, `check-public-doc-tmp-leak`, `check-binary-name`, `check-security-supported-version`, `check-skills-copilot-removed`, `check-contributing-coverage-claim`, `check-npm-package-github-url`, `check-followup-target-not-current`, `check-benchmarks-version`, `check-npm-version`, `check-pypi-version`, `check-crate-metadata`, `check-shipped-doc-coverage`, `test-workflow-bash-syntax`, `test-install-detect-target`, `test-release-workflow`, `test-dockerfile`, `test-ci-bench-regression`, `test-all-check-scripts-wired`, every meta-test) standalone — all green. `scripts/workflow-check.sh` exits 0.
- **Cycle-16/17 dedup:** read `git show origin/eval/c16-perf-release-8496878:documentation/EVAL-PERF-RELEASE-CYCLE16.md`. C16 F01/F02/F03/F05 closed by `f72f7cd` + `b994aa7`. C16 F04/F06/F07 NOT closed in cycle-17 (cycle-17 perf-release evaluator stopped early per user pivot; no cycle-17 perf-release branch exists). The C17 fixes that did land in this window — `64929c8` (BENCHMARKS headline rebaseline → all-14-rows + scope-drift gate), `b5bf977` (wire `check-npm-package-github-url` + new structural meta-meta-test `test-all-check-scripts-wired.sh`), `e585f66` (BENCHMARKS tone-down DIRECTIONAL WIN → DIRECTIONAL INDICATOR + drop "crushing") — all verified applied. The new meta-meta-test `test-all-check-scripts-wired.sh` is GREEN against the current `scripts/test.sh` (every `scripts/check-*.sh` is invoked directly).

## Summary

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| HIGH | 1 | F01 |
| MEDIUM | 2 | F02 — F03 |
| LOW | 2 | F04 — F05 |

KNOWN_BROKEN release-pipeline jobs (tracked separately in `pending_asks`, not re-flagged here):

- `release.yml::publish-crates` — `CARGO_REGISTRY_TOKEN` (mapped from `secrets.CRATES_TOKEN`, `release.yml:325`) unset; `cargo publish` 401s on first real `v*` tag push. Workaround: maintainer sets `CRATES_TOKEN` repo secret before next tag.
- `release.yml::docker` — multi-platform `linux/amd64,linux/arm64` build under QEMU emulation has been flaky in prior runs (`release.yml:409`). Workaround: drop `linux/arm64` until self-hosted aarch64 runner is available, or split docker into two single-platform jobs so amd64 always lands.

---

## F01 — Skill-bundle benchmarks mirror still publishes 0.3.0 N=5 numbers as "0.5.1 (carry-fwd 0.4.0 N=5)" + reverts cycle-17 e585f66 tone-down on the npm-shipped surface

- **Severity:** HIGH
- **Files:** `skills/opengraphdb/references/benchmarks-snapshot.md:1,5-6,17,23-36`; `skills/opengraphdb/SKILL.md:276-285`. Cross-referenced against `documentation/evaluation-runs/baseline-2026-04-25.json` (0.3.0 N=5) and `documentation/evaluation-runs/baseline-2026-05-02.json` (0.4.0 N=5), and against `documentation/BENCHMARKS.md:113-118` (cycle-17 e585f66 tone-down). Gate gap: `scripts/check-benchmarks-version.sh:19` `BENCHMARKS_MD="$ROOT/documentation/BENCHMARKS.md"` only scans the canonical doc; the skills mirror is invisible to CI.

The cycle-15 `cf0bbdb` patch ("bump SKILL.md + references perf and Cypher tables to 0.5.1") changed only the column LABEL (`OpenGraphDB 0.3.0` → `OpenGraphDB 0.5.1`), the file title (`# OpenGraphDB 0.3.0 — benchmarks snapshot` → `# OpenGraphDB 0.5.1 …`), and added a new wrapper sentence claiming "The table below carries forward the 0.4.0 N=5 medianed numbers — zero perf-relevant code in the 0.4.0 → 0.5.1 window." The numerical cells were untouched, and the methodology paragraph still says "**Measurement date:** 2026-04-25" — the 0.3.0 baseline date.

Diffing the cells against both JSON baselines confirms the values are 0.3.0 N=5, not 0.4.0 carry-fwd:

| Skills row | Snapshot cell | `baseline-2026-04-25.json` (0.3.0 N=5) | `baseline-2026-05-02.json` (0.4.0 N=5; what the wrapper claims) |
|---|---|---|---|
| 1 bulk ingest | **254 nodes/s** | (not in mini set) | 251.09 nodes/s |
| 2 streaming ingest | **301 nodes/s** | (not in mini set) | 299.61 nodes/s |
| 3 point read p50/p95/p99 | **7.1 / 11.2 / 13.4 μs** (119k qps) | **7.124 / 11.242 / 13.381** ← matches | 5.837 / 6.843 / 11.778 μs (166k qps) |
| 4 2-hop p50/p95/p99 | **8.6 / 17.2 / 18.1 μs** | **8.602 / 17.159 / 18.086** ← matches | 22.911 / 25.760 / 36.017 μs |
| 5 IS-1 p50/p95/p99 | **22.2 / 232 / 365 μs** | **22.231 / 232.729 / 365.911** ← matches | 18.334 / 162.791 / 221.944 μs |
| 6 mutation p95/p99 | **13 687 / 15 668 μs** | matches 0.3.0 | 12 980.69 / 15 939.43 μs |
| 7 enrichment | **38.5 / 45.4 / 114.0 ms** | matches 0.3.0 | 38.77 / 46.72 / 112.63 ms |
| 8 hybrid | **184 / 223 / 245 μs** | matches 0.3.0 | 203.98 / 233.25 / 245.69 μs |
| 9 concurrent commits/s | **300 commits/s** | matches 0.3.0 | 294.62 commits/s |
| 10 rerank p50/p95/p99 | **1.27 / 1.35 / 1.50 μs** | matches 0.3.0 | 1.275 / 1.343 / 1.624 μs |
| 11 BFS | **42.7 μs** | **42.72** ← matches | 48.468 μs |
| 12 PageRank iter | **604 μs/iter × 20 = 12.1 ms** | **604.74** ← matches | 651.962 μs/iter, 13.0 ms |
| 13 scaling 10k read p95 | **0.26 μs** / 0.29 s / 27.2 MB | matches 0.3.0 | 0.375 μs / 0.319 s / 28.0 MB |
| 14 resources cpu_user | **1.45 s** / 30.3 MB | matches 0.3.0 | 1.51 s / 28.0 MB |

Several rows would change verdict materially under the actual 0.4.0 numbers: row 4's "DIRECTIONAL WIN — clears SF10 IC threshold by 3 000×" is computed off 17.2 μs p95 (0.3.0); the actual 0.4.0 p95 is 25.8 μs and the multiplier is 2 000× (still a win, but the cell shipped to npm is wrong by 50%). Row 11 BFS understates by 13.5%; row 12 PageRank by 8%; row 13 scaling-tier read-p95 by 44%. These are the same regressions BENCHMARKS.md publishes transparently in the deltas table at lines 39-57; the skills mirror silently sweeps them under "carry-fwd".

The cycle-17 `e585f66` tone-down ("DIRECTIONAL WIN" → "DIRECTIONAL INDICATOR (pending apples-to-apples)"; drop "crushing" superlatives) was applied to `documentation/BENCHMARKS.md:113,114,140` but not to the skills mirror. The npm-shipped surfaces still publish:

```
skills/opengraphdb/references/benchmarks-snapshot.md:25:
  ⚠️ DIRECTIONAL WIN — 80× under Memgraph Pokec p99, 2 000× under Neo4j.
skills/opengraphdb/references/benchmarks-snapshot.md:26:
  ⚠️ DIRECTIONAL WIN — clears SF10 IC threshold by 3 000×.
skills/opengraphdb/SKILL.md:281:
  ⚠️ directional WIN (80× under Memgraph Pokec p99)
skills/opengraphdb/SKILL.md:285:
  ✅ crushing — 27 000× under bar
```

This is the npm `opengraphdb-skills` bundle — the surface AI agents load when wired up via `ogdb init --agent`. The agents see different numbers AND different verdict language than the canonical doc, with `cf0bbdb`'s wrapper-sentence promising the opposite ("carries forward the 0.4.0 N=5 medianed numbers"). The reader who trusts the wrapper sentence is misled in two directions at once: the numbers are 0.3.0 (not 0.4.0), and the language is the pre-tone-down version (not the cycle-17 honesty pass).

The check-benchmarks-version gate would catch this if it scanned the skills mirror; it doesn't. There is no other gate that walks `skills/**/*.md` for benchmark-cell drift.

**Patch sketch (two layers — fix the cells, then close the gate-gap):**

1. Sweep skills mirror to actual 0.4.0 N=5 values + apply the cycle-17 tone-down:

```diff
@@ skills/opengraphdb/references/benchmarks-snapshot.md
-`crates/ogdb-eval/tests/publish_baseline.rs`. Measurement date: 2026-04-25.
+`crates/ogdb-eval/tests/publish_baseline.rs`. Measurement date: 2026-05-02
+(0.4.0 N=5 re-baseline; carried forward to 0.5.1 — patch-release window
+touched no perf-relevant code).
@@
-| 3 | Point read `neighbors()` p50/p95/p99 @ 10k nodes, cold | **7.1 / 11.2 / 13.4 μs** (119k qps) | p95 < 5 ms (SF10 warm) | ⚠️ DIRECTIONAL WIN — 80× under Memgraph Pokec p99, 2 000× under Neo4j. Scale mismatch: Pokec is 1.6M nodes; we ran 10k. |
-| 4 | 2-hop traversal p50/p95/p99 @ 10k nodes, cold | **8.6 / 17.2 / 18.1 μs** (90k qps) | p95 < 100 ms | ⚠️ DIRECTIONAL WIN — clears SF10 IC threshold by 3 000×. |
+| 3 | Point read `neighbors()` p50/p95/p99 @ 10k nodes, cold | **5.8 / 6.8 / 11.8 μs** (166k qps) | p95 < 5 ms (SF10 warm) | 🟡 DIRECTIONAL INDICATOR (pending apples-to-apples) — 10k tier vs Memgraph Pokec 1.6M; lower-bound feasibility signal, not verified WIN. |
+| 4 | 2-hop traversal p50/p95/p99 @ 10k nodes, cold | **22.9 / 25.8 / 36.0 μs** (48k qps) | p95 < 100 ms | 🟡 DIRECTIONAL INDICATOR (pending apples-to-apples) — 10k p95 clears SF10 IC threshold but cycle-15 noted 17→26 μs regression; profile pass needed before claiming SF1/SF10. |
…
@@ skills/opengraphdb/SKILL.md (line 281, 285)
-| Point read `neighbors()` p50 / p95 / p99 @ 10k nodes | **7.1 / 11.2 / 13.4 μs** (119k qps) | p95 < 5 ms | ⚠️ directional WIN (80× under Memgraph Pokec p99) |
+| Point read `neighbors()` p50 / p95 / p99 @ 10k nodes | **5.8 / 6.8 / 11.8 μs** (166k qps) | p95 < 5 ms | 🟡 directional indicator — pending apples-to-apples at SF10 |
…
-| Graph-feature rerank batch p95 (100 candidates × 1-hop) | **1.35 μs** (153 μs/batch) | p95 < 50 ms | ✅ crushing — 27 000× under bar |
+| Graph-feature rerank batch p95 (100 candidates × 1-hop) | **1.34 μs** (153 μs/batch) | p95 < 50 ms | ✅ WIN — 27 000× under bar; caveat: synthetic Σ neighbour_id boost (not learned dot-product) |
```

2. Extend `scripts/check-benchmarks-version.sh` (or add `scripts/check-skills-benchmarks-mirror.sh`) to assert the skill mirror's cells equal BENCHMARKS.md row-for-row, OR replace the skill mirror with a generated-at-build-time excerpt so divergence is mechanically impossible. The cycle-17 meta-meta-test only enforces gate-wiring; it does not enforce content consistency between the canonical doc and the npm-shipped mirror. Without one of these, the next patch-release that updates BENCHMARKS.md will repeat the cf0bbdb pattern (label-bump, value-skip).

---

## F02 — `scripts/workflow-check.sh` Layer 2 still only enforces `feat(` commits; 11 `fix(`/`docs(` commits since `8496878` ship without [Unreleased] coverage

- **Severity:** MEDIUM
- **Files:** `scripts/workflow-check.sh:117-136` (Layer 2 grep filter), `CHANGELOG.md:7-22` ([Unreleased] body), `git log 8496878..HEAD`. Carry-forward from cycle-16 F04 (not addressed in cycle-17).

Layer 2's regex is still `--grep='^feat(\(|!:|:)'` (line 136) — only `feat(` commits are collected. Since the cycle-15 changelog-split commit `8496878`, eleven `fix(` / `docs(` commits have landed on `main` with no matching keyword in `[Unreleased]`:

| SHA | Subject | Token in [Unreleased]? |
|---|---|---|
| `ca82055` | `docs(version-stamps): bump backend-swap follow-up target to v0.6.0 + sweep BENCHMARKS body 0.4.0→0.5.1 carry-fwd refs` | no |
| `f72f7cd` | `fix(benchmarks): rebaseline rows 1+2 to 0.4.0 N=5 + extend deltas table` | no |
| `b994aa7` | `fix(ci): wire cycle-15 gates into scripts/test.sh + extend verify-claims.sh to non-frontend manifest entries` | no |
| `09f9161` | `fix(npm-packages): strip copilot from skills npm metadata + correct skills+mcp github URLs to asheshgoplani/opengraphdb` | no |
| `64929c8` | `fix(benchmarks): bump headline from rows-3-4-5-6-10 → all-14-rows + tighten gate` | no |
| `b5bf977` | `fix(ci): wire check-npm-package-github-url + add structural meta-meta-test (every check-*.sh must be referenced in test.sh)` | no |
| `0061176` | `fix(docs): Bolt v0.5 follow-up → v0.6.0 across COMPATIBILITY/SPEC/DESIGN + structural gate` | no |
| `b5d10c9` | `docs(readme): simplify hero + drop dense Neo4j comparison + add Can I use RDF section + ship QUICKSTART.md` | no |
| `463c3d0` | `fix(changelog): correct docs/→documentation/ for COOKBOOK + MIGRATION-FROM-NEO4J + add path-resolution gate` | no |
| `e585f66` | `docs(benchmarks): tone down DIRECTIONAL WIN to DIRECTIONAL INDICATOR pending apples-to-apples + drop crushing language` | no |
| `91ee552` | `fix(install,readme,changelog): correct demo seed claim — ogdb demo loads MovieLens only, not movies+social+fraud` | no |

`scripts/workflow-check.sh` still exits 0 against this state because it only iterates `feat(` commits. The cycle-15 C15-F16 strengthening rejects the empty `(No entries yet)` placeholder, but that closes only the *zero-bullet* failure mode — the *missing-bullet-per-non-feat-commit* failure mode is wide open.

This is structurally important precisely because the recent commit-traffic on `main` is 100 % `fix(`/`docs(`. The AGENTS.md rule ("every merged change land an `[Unreleased]` bullet") is currently unenforced for the only commit types actually landing.

**Patch sketch:**

```diff
@@ scripts/workflow-check.sh:136
-done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|!:|:)' -z)
+# EVAL-PERF-RELEASE-CYCLE18 F02: extend Layer 2 to fix(/docs(/refactor(/perf( in
+# addition to feat(. chore(/test(/style( stay excluded as implicit non-user-facing.
+# Caught by cycle-18: 11 fix(/docs( commits since 8496878 had no [Unreleased] entry.
+done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E \
+         --grep='^(feat|fix|docs|refactor|perf)(\(|!:|:)' -z)
@@ scripts/workflow-check.sh: also adjust the topic-strip + error message
-  topic="$(printf '%s' "$subject" | sed -E 's/^feat(\([^)]*\))?!?:[[:space:]]*//I')"
+  topic="$(printf '%s' "$subject" | sed -E 's/^(feat|fix|docs|refactor|perf)(\([^)]*\))?!?:[[:space:]]*//I')"
@@
-  echo "ERROR: ${#failed_commits[@]} feat( commit(s) since ${released_tag} have no matching keyword under [Unreleased]:" >&2
+  echo "ERROR: ${#failed_commits[@]} feat(/fix(/docs( commit(s) since ${released_tag} have no matching keyword under [Unreleased]:" >&2
```

(After this lands, expect a transient red on this branch — the right fix is to backfill the 11 missing bullets in `[Unreleased]` as part of the same PR, not to weaken the gate.)

---

## F03 — `scripts/test-install-detect-target.sh` evaluates `install.sh::detect_target()` under `bash` while `install.sh` itself targets POSIX `sh`

- **Severity:** MEDIUM
- **Files:** `scripts/test-install-detect-target.sh:48` (`bash -c`), `scripts/install.sh:1` (`#!/usr/bin/env sh`). Carry-forward from cycle-16 F06 (not addressed in cycle-17).

Verbatim from the still-shipped script (`scripts/test-install-detect-target.sh:46-60`):

```bash
out=$(
  OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
    c_red() { printf "ERR: %s\n" "$1" >&2; }
    uname() {
      case "$1" in
        -s) printf "%s" "$OS_NAME" ;;
        -m) printf "%s" "$ARCH" ;;
        *) command uname "$@" ;;
      esac
    }
    eval "$DETECT_FN"
    detect_target
  '
)
```

`scripts/install.sh:14` is `set -eu` (no `-o pipefail`) — the conservative POSIX baseline so the documented `curl -fsSL …/install.sh | sh` distribution path works on Alpine/BusyBox `ash`, Debian/Ubuntu `dash` (the default `/bin/sh`), OpenWrt `ash`, etc. A future edit reaching for bash-only syntax inside `detect_target()` (`[[ ... ]]`, arrays `arr=(…)`, process substitution `<(…)`, `${var^^}` upper-casing) would silently pass this gate (bash supports it) but break the moment a real user runs the install command on any of those shells. That is the exact regression class the test was created to catch — and it currently doesn't.

**Patch sketch:**

```diff
@@ scripts/test-install-detect-target.sh:46
-  out=$(
-    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
+  # EVAL-PERF-RELEASE-CYCLE18 F03: run under POSIX sh (dash on Debian/Ubuntu CI runners)
+  # to match the real `curl … | sh` path. install.sh's shebang is /usr/bin/env sh, not bash;
+  # exercising under bash hides bash-only-syntax regressions.
+  out=$(
+    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" \
+      sh -c '
       c_red() { printf "ERR: %s\n" "$1" >&2; }
       uname() {
         …
       }
       eval "$DETECT_FN"
       detect_target
     '
   )
```

(Equivalently: run twice — once under `sh`, once under `bash` — so both shells are gated.)

---

## F04 — `.claude/release-tests.yaml::install-sh-asset-url-template` `test:` field uses cargo-target naming for a bash-script entry

- **Severity:** LOW
- **File:** `.claude/release-tests.yaml:620-627`. Carry-forward from cycle-16 F07 (not addressed in cycle-17).

The manifest header `.claude/release-tests.yaml:19` declares `test: the rust test target name (matches --test flag)`. The install-sh entry from cycle-15 F06 has:

```yaml
  - id: install-sh-asset-url-template
    task: fix-install-asset-name
    crate: scripts
    test: "install_sh_detect_target"     # <-- cargo-target naming for a bash script
    function: []
    command: "bash scripts/test-install-detect-target.sh"
```

Same schema-drift class the cycle-15 patch closed for `is1-perf-recovery-after-monolith-split` via the inline comment at `.claude/release-tests.yaml:512-514` ("test field intentionally maps to the master harness publish_baseline; ldbc_snb_is1_driver is the underlying gate"). The install-sh entry has no such acknowledgement; auto-tooling that uses `test:` as the source of truth requests a non-existent `--test install_sh_detect_target` cargo target.

**Patch sketch:**

```diff
@@ .claude/release-tests.yaml:620-627
   - id: install-sh-asset-url-template
     task: fix-install-asset-name
     crate: scripts
-    test: "install_sh_detect_target"
+    # EVAL-PERF-RELEASE-CYCLE18 F04: test: field uses bash:<path> convention
+    # for non-cargo entries. Manifest header (line 19) defines test: as the
+    # rust --test target; bash: prefix marks it as not-a-cargo-target.
+    test: "bash:scripts/test-install-detect-target.sh"
     function: []
     command: "bash scripts/test-install-detect-target.sh"
```

---

## F05 — `scripts/check-public-doc-tmp-leak.sh` does not scan `skills/`, the npm-shipped agent surface

- **Severity:** LOW
- **Files:** `scripts/check-public-doc-tmp-leak.sh:7` (`SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)`), compared with `scripts/check-doc-anchors.sh:12` (`DOCS=(documentation README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md skills)`).

The `skills/` tree is npm-published as `opengraphdb-skills` and rendered to AI agents on `ogdb init --agent`. `check-doc-anchors.sh` and `check-binary-name.sh` correctly include `skills/` in their scope; `check-public-doc-tmp-leak.sh` does not. A future contributor citing a private temp-dir scratch markdown file inside any `skills/**/*.md` file would slip through CI even though the gate's stated purpose ("Public docs must cite a public URL or in-repo path, not a private temp-dir scratch file") clearly applies.

There is no current leak (verified by ad-hoc grep over `skills/`; the only candidate matches are env-var assignments at `skills/opengraphdb/references/benchmarks-snapshot.md:75,80` which the gate's existing `=`-prefix allowlist already exempts), so this is structural drift — but the parallel gate-scope inventory should be coherent, and shipping the npm bundle outside the leak gate is the same failure mode the gate exists to prevent.

**Patch sketch:**

```diff
@@ scripts/check-public-doc-tmp-leak.sh:7
-SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)
+# EVAL-PERF-RELEASE-CYCLE18 F05: include skills/ — it ships to npm as
+# opengraphdb-skills and is rendered to AI agents on ogdb init --agent.
+# Parallels the scope of check-doc-anchors.sh / check-binary-name.sh.
+SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md skills)
```

---

## What was checked and not flagged

- `documentation/BENCHMARKS.md` rows 1–14 vs `baseline-2026-05-02.json`: every cell verified after `f72f7cd` (rows 1-2 fix), `cf97159` (rows 7-14), `64929c8` (headline scope-drift gate). Closes C16 F01 + F05. Body claim "all 14 rows in § 2 below now carry 0.4.0 N=5 medians" is now honest; the deltas table at lines 39-57 includes all 14 rows; the L5 "Measurement date:" headline says "all 14 rows in § 2 are this run".
- `scripts/check-benchmarks-version.sh:107-128` cycle-17 F03 scope-drift gate: green; the auto-generated rule fires only when every `^| N |` row carries `2026-05-02 re-baseline` AND the L5 headline doesn't mention `all N rows`. Verified by reading the gate body + running the script (output: `check-benchmarks-version: ok (0.5.1; headline + § 2 column header agree)`).
- `scripts/test-all-check-scripts-wired.sh` cycle-17 F04 meta-meta-test: green. `comm -23 <(ls scripts/check-*.sh) <(grep -oE 'scripts/check-[A-Za-z0-9-]+\.sh' scripts/test.sh)` is empty. Every `check-*.sh` on disk is invoked from `scripts/test.sh`.
- `scripts/test.sh` direct-invocation walk: 24 distinct `./scripts/check-*.sh` references + 12 distinct `./scripts/test-*.sh` references; `bash scripts/test.sh` would dispatch every gate (subject to the `cargo` steps after the structural gates). Closes C16 F02 + F03.
- `.claude/release-tests.yaml` 64 entries: verified every `crates/<crate>/tests/<file>.rs`, `frontend/<spec>.spec.ts`, and `bash scripts/<file>.sh` path resolves on disk via `python3 yaml.safe_load`.
- `scripts/verify-claims.sh:64-83` cycle-17 b994aa7 extension to `RUNNABLE_CRATES = {"frontend", "scripts"}`: verified; the install-sh entry would now run under the `verify-claims` workflow in addition to `scripts/test.sh`. Closes the `crate: scripts` half of cycle-15 F11 / cycle-16 F03.
- `release.yml`: `tests` gate runs `bash scripts/test.sh`; `build` / `publish-crates` / `docker` all `needs: tests`; sha256sums emitter narrowed to archive files only (`release.yml:185`); `install.sh` staged into `dist/` for the release-asset bundle (`release.yml:215-218`); `release.sh` PowerShell `Compress-Archive` fallback present at `scripts/release.sh:103-105` for Windows runners without `zip`.
- `release.sh` archive emission: ext mapping matches `release.yml::build.matrix` and `test-install-detect-target.sh` cases (`tar.xz` for linux+macos, `zip` for windows). `test-install-detect-target.sh` 5/5 PASS standalone.
- `baseline-2026-05-02.json` schema: `schema_version 1.0` across all 15 runs; `binary.version 0.4.0`; aggregation `median-of-5-iters`. JSON sound. F01 is doc-side mislabeling on the skills mirror, not JSON drift.
- `scripts/check-token-leaks.sh` (referenced from `.github/workflows/ci.yml:112` as `bash scripts/check-token-leaks.sh`): NOT a finding. The `frontend-quality` job has `defaults.run.working-directory: frontend` (`ci.yml:82-84`), so the path resolves to `frontend/scripts/check-token-leaks.sh` which exists and is executable. Initial false-alarm during evaluation.
- `scripts/workflow-check.sh` Layer 1 (empty-placeholder rejection from C15-F16 / `8496878` final clause): `[Unreleased]` is non-empty, gate exits 0.
- All wired meta-tests (`test-check-{benchmarks-version,changelog-tags,changelog-paths,contributing-coverage-claim,followup-target-not-current,npm-package-github-url,security-supported-version,skills-copilot-removed}.sh`): each PASS standalone with both green-fixture and red-fixture cases.

## Cross-references

- F01 is the load-bearing finding: it bundles a numerical drift, a verdict-language drift, and a gate-coverage gap on the npm-shipped agent surface. Closing the cells without closing the gate-coverage gap will recur on the next minor.
- F02 + F03 + F04 are all "open since cycle-16" carry-forwards; they need re-flagging because the cycle-17 perf-release evaluator was stopped before reviewing them. None depend on each other; each is a standalone independent patch.
- F05 is structural drift between gate scope inventories (`check-doc-anchors.sh` vs `check-public-doc-tmp-leak.sh`); pure prevention, no current leak.
- `pending_asks` `release.yml::publish-crates` (CRATES_TOKEN unset) and `release.yml::docker` (multi-arch QEMU flake) remain KNOWN_BROKEN — out of scope for cycle-18.
