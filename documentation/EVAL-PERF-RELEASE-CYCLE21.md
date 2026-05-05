# EVAL-PERF-RELEASE — Cycle 21

- **Eval area:** PERF-RELEASE
- **Workspace HEAD:** `cfb3d40` (origin/main, 2026-05-05; post readme-cli-listing fix `cfb3d40` + cycle-20 skills mirror full sweep `6108439`)
- **Worktree:** a fresh detached worktree off `origin/main`
- **Scope:** `documentation/BENCHMARKS.md`, `documentation/evaluation-runs/baseline-2026-{05-02,05-01,04-25}.json`, `.claude/release-tests.yaml`, `scripts/test.sh`, `scripts/check-*.sh`, `scripts/test-*.sh`, `scripts/release.sh`, `scripts/install.sh`, `scripts/verify-claims.sh`, `scripts/workflow-check.sh`, `.github/workflows/{ci,release,verify-claims}.yml`, `CHANGELOG.md`, `skills/opengraphdb/SKILL.md`, `skills/opengraphdb/references/benchmarks-snapshot.md`, `documentation/MIGRATION-FROM-NEO4J.md`, `DESIGN.md` (path-coherence cross-check; moved to repo root since c20).
- **Methodology:** read-only inspection on a fresh detached worktree off `origin/main` @ `cfb3d40`. Did NOT run `cargo bench` / `cargo test --workspace` / any release-pipeline workflows. Verified `6108439` swept all 11 remaining `benchmarks-snapshot.md` rows + measurement date + 4 SKILL.md "Performance you can expect" rows, plus tightened `check-benchmarks-vocabulary-mirror.sh` to `grep -niF` (case-insensitive). Diffed every BENCHMARKS.md table cell + every skills-mirror cell against `baseline-2026-05-02.json` (15 EvaluationRuns, schema v1.0, version=0.4.0, N=5 medianed). Ran every wired gate standalone (`check-benchmarks-version`, `check-benchmarks-vocabulary-mirror`, `check-init-agent-syntax`, `check-install-demo-path-matches-binary-default`, `check-changelog-tags`, `check-changelog-paths`, `check-doc-anchors`, `check-public-doc-tmp-leak`, `check-binary-name`, `check-security-supported-version`, `check-skills-copilot-removed`, `check-contributing-coverage-claim`, `check-npm-package-github-url`, `check-followup-target-not-current`, `check-npm-version`, `check-pypi-version`, `check-crate-metadata`, `check-shipped-doc-coverage`, `test-workflow-bash-syntax`, `test-install-detect-target`, `test-release-workflow`, `test-dockerfile`, `test-ci-bench-regression`, `test-all-check-scripts-wired`, every meta-test for the c18+c19 gates) — all green.
- **Cycle-20 dedup:** read `git show origin/eval/c20-perf-release-fb0ec7a:documentation/EVAL-PERF-RELEASE-CYCLE20.md`. Per the cycle-21 brief, cycle-20 closed F01 (HIGH; skills mirror full sweep landed in `6108439`). Verified: `6108439` swept all 11 remaining cells in `skills/opengraphdb/references/benchmarks-snapshot.md` to actual 0.4.0 N=5 values, swept the 4 SKILL.md "Performance you can expect" rows, fixed the headline `Measurement date:` to `2026-05-02`, rewrote the wrapper sentence, AND tightened `check-benchmarks-vocabulary-mirror.sh:60` from `grep -nF` to `grep -niF` (closes the (c) lowercase-escape leg of c20 F01). Skills mirror now matches BENCHMARKS.md § 2 cell-for-cell. C20 F02 / F03 / F04 / F05 / F06 (the four MED + LOW carry-forwards + the new-this-cycle DESIGN.md doc-residue) were NOT touched by `6108439` and are re-flagged below as F02 / F03 / F04 / F05 / F07 (verbatim shape; F06 below is new this cycle).

## Summary

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 3 | F01 — F03 |
| LOW | 4 | F04 — F07 |

KNOWN_BROKEN release-pipeline jobs (carried forward verbatim from cycle-18 / cycle-20; tracked separately in `pending_asks`, NOT re-flagged here):

- `release.yml::publish-crates` — `CARGO_REGISTRY_TOKEN` (mapped from `secrets.CRATES_TOKEN`, `release.yml:325`) unset; `cargo publish` 401s on first real `v*` tag push. Workaround: maintainer sets `CRATES_TOKEN` repo secret before next tag.
- `release.yml::docker` — multi-platform `linux/amd64,linux/arm64` build under QEMU emulation has been flaky in prior runs (`release.yml:410`). Workaround: drop `linux/arm64` until self-hosted aarch64 runner is available, or split docker into two single-platform jobs so amd64 always lands.

---

## F01 — `documentation/BENCHMARKS.md` § 3 ("What's true about each win") prose still cites 0.3.0-era numerics for rows 7, 10, and 13; the deltas table at L41 explicitly publishes a +44 % drift on row 13 read p95 yet the methodology paragraph below the table still cites the OLD 0.26 μs

- **Severity:** MEDIUM
- **Files:** `documentation/BENCHMARKS.md:139-141` (§ 3 prose). Cross-checked against the `baseline-2026-05-02.json` 0.4.0 N=5 medianed values that landed in the `documentation/BENCHMARKS.md:117,120,123` table cells via `cf97159` (cycle-15 row 7-14 rebaseline) + `f72f7cd` (cycle-16 row 1-2 extension). Gate-coverage gap: `scripts/check-benchmarks-version.sh` covers (a) headline version vs `Cargo.toml` (`:46`) and (b) § 2 table column header (`:72`) — it does NOT verify cell-vs-prose-body numerical consistency within BENCHMARKS.md itself. The c20 F01 cell-mirror gate sketch (Layer 3) is the structural fix for this exact failure-class.

§ 3 of `documentation/BENCHMARKS.md` is titled "What's true about each win (methodology disclosure)" — the section's stated purpose is to disclose the headline numbers each verified-WIN row stands on. Three of its bullets cite 0.3.0-era numerics that disagree with the rebaselined cells in § 2:

| § 3 prose (line) | Cited value | § 2 table cell (line) | Actual 0.4.0 N=5 | Drift |
|---|---|---|---|---|
| L139 (Row 7 — Enrichment) | `p95 = 45.4 ms` | L117 → `**38.8 / 46.7 / 112.6 ms**` | 46.7 ms | **−2.8 %** |
| L140 (Row 10 — Rerank) | `p95 = 1.35 μs` | L120 → `**1.28 / 1.34 / 1.62 μs**` | 1.34 μs | rounding noise (<1 %) |
| L141 (Row 13 — Scaling 10k) | `27 MB RSS / 0.29 s load / 0.26 μs read p95` | L123 → `read p95 = 0.38 μs, load = 0.32 s, RSS = 28.0 MB` | 0.38 μs / 0.32 s / 28.0 MB | RSS −3.7 %, load −10 %, **read p95 −31.6 %** |

The L141 row is load-bearing: the prose itself describes the cell as `(N=5 median)` and concludes "comfortably beats every other embedded-graph-DB's published floor numbers" using the 0.3.0 number for read p95. The deltas table at L41 explicitly publishes that the 0.3.0 → 0.4.0 N=5-vs-N=5 drift on this exact cell is `+44 %` and flags it for § 4.2 — so the doc internally acknowledges the regression in one place while continuing to cite the pre-regression number 100 lines later. The verdict claim ("✅ WIN on all three gates — read p95 is 2 600× under the threshold") still holds at 0.38 μs (2 600× below 1 ms is the table's own framing), so this is purely a numerical drift, not a verdict-changing claim — but a methodology section labelled `(N=5 median)` that emits non-N=5 0.3.0 numbers is exactly what cycle-15 cf97159 was meant to close for the canonical doc.

This is the same failure-class as cycle-20 F01 but for in-doc prose rather than the npm-shipped mirror. The `cf97159` / `f72f7cd` rebaseline scope was § 2 table cells (rows 7-14 + rows 1-2); § 3 prose was outside that scope and the `check-benchmarks-version.sh` gate enforces only headline + column-header parity, leaving the prose mentions ungated.

**Patch sketch (two layers; layer 1 closes the immediate drift, layer 2 prevents recurrence):**

1. **Prose sweep — three line edits:**

```diff
@@ documentation/BENCHMARKS.md:139
-- **Row 7 — Enrichment p95 = 45.4 ms (N=5 median).**
+- **Row 7 — Enrichment p95 = 46.7 ms (N=5 median).**
@@ documentation/BENCHMARKS.md:140
-- **Row 10 — Rerank batch p95 = 1.35 μs (N=5 median).**
+- **Row 10 — Rerank batch p95 = 1.34 μs (N=5 median).**
@@ documentation/BENCHMARKS.md:141
-  but at 27 MB RSS / 0.29 s load / 0.26 μs read p95 it comfortably beats
+  but at 28 MB RSS / 0.32 s load / 0.38 μs read p95 it comfortably beats
```

2. **Gate widening — extend `check-benchmarks-version.sh` (or add a sibling `check-benchmarks-cell-prose-mirror.sh`) to assert that any number cited in BENCHMARKS.md § 3 prose for "Row N" matches the corresponding cell in § 2:**

```bash
# EVAL-PERF-RELEASE-CYCLE21 F01: § 3 "What's true about each win" prose
# must cite the same headline number as the § 2 table cell. Catches the
# cf97159/f72f7cd gap where § 2 cells were rebaselined and § 3 prose was
# not — the same in-doc contradiction this finding documents.
SECTION_3_LINES=$(awk '/^## 3\./,/^## 4\./' "$BENCHMARKS_MD")
# For each "Row N" mention in § 3, parse the cited value and compare
# against § 2's row-N cell. Report drift > 1 % rounding tolerance.
```

This is the same Layer-3 cell-mirror gate the c20 F01 patch sketch proposed for the canonical-vs-skills-mirror axis, applied to the in-doc cells-vs-prose axis. Either layer alone is enough; layer 1 is the immediate fix.

---

## F02 — `scripts/workflow-check.sh` Layer 2 still gates only `feat(` commits; 34 commits since `v0.5.1` are 100 % `fix(` / `docs(` and entirely ungated by Layer 2 (carry-forward C16-F04 / C18-F02 / C20-F02)

- **Severity:** MEDIUM
- **Files:** `scripts/workflow-check.sh:136` (Layer 2 grep filter), `CHANGELOG.md:7-22` ([Unreleased] body), `git log v0.5.1..HEAD`. Carry-forward from cycle-16 F04 / cycle-18 F02 / cycle-20 F02.

Verbatim from the still-shipped script (`scripts/workflow-check.sh:136`):

```bash
done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|!:|:)' -z)
```

`git log v0.5.1..HEAD --no-merges --format='%h %s' -E --grep='^feat(\(|!:|:)'` returns **zero** results — every one of the 34 commits since `v0.5.1` is `fix(` or `docs(`. Layer 2 silently passes for all of them. The c20 F02 framing held that a single bullet under [Unreleased] satisfies Layer 1 regardless of how many subsequent `fix(`/`docs(` commits land — and that is exactly the live state: [Unreleased] currently has the cycle-18 F01 demo-path bullet (CHANGELOG.md L10) plus 17 cycle-15 carry-over bullets, and the 33 other commits since `v0.5.1` (`6108439` skills sweep, `fb0ec7a` path coherence widening, `cfb3d40` readme-cli-listing fix, etc.) have no [Unreleased] coverage. The AGENTS.md rule ("every merged change land an `[Unreleased]` bullet") remains unenforced for the only commit types actually landing.

This finding is unchanged in shape from c16/c18/c20 — the commit-traffic since the latest released tag has only grown. Re-flagged because the gap is now 34 commits wide.

**Patch sketch (same as c18 F02 / c20 F02; backfill `[Unreleased]` in the same PR so it lands green):**

```diff
@@ scripts/workflow-check.sh:136
-done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|!:|:)' -z)
+# EVAL-PERF-RELEASE-CYCLE21 F02 (carry-forward C16/C18/C20): extend Layer 2
+# to fix(/docs(/refactor(/perf( commits — chore(/test(/style( stay excluded
+# as implicit non-user-facing. Without this widening every fix( commit since
+# v0.5.1 has shipped with no [Unreleased] coverage (34 commits as of cfb3d40).
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

## F03 — `scripts/test-install-detect-target.sh` still evaluates `install.sh::detect_target()` under `bash` while `install.sh` itself targets POSIX `sh` (carry-forward C16-F06 / C18-F03 / C20-F03)

- **Severity:** MEDIUM
- **Files:** `scripts/test-install-detect-target.sh:48` (`bash -c`), `scripts/install.sh:1` (`#!/usr/bin/env sh`). Carry-forward from cycle-16 F06 / cycle-18 F03 / cycle-20 F03.

Verbatim unchanged. `scripts/install.sh:1` is `#!/usr/bin/env sh` and `:14` is `set -eu` (no bash-isms allowed). The documented distribution path is `curl -fsSL …/install.sh | sh` — which is `dash` on Debian/Ubuntu, `ash` on Alpine/BusyBox. The regression test at `scripts/test-install-detect-target.sh:48`:

```bash
out=$(
  OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
    ...
  '
)
```

evaluates `detect_target()` under bash, so any bash-only syntax inside (`[[ ... ]]`, `${var^^}`, `arr=(…)`, `<(…)`) silently passes the gate but breaks on the `curl … | sh` real-user path. The gate ostensibly guards against "the v0.5.0 curl-404 regression that escaped CI to a real user" (`b5ee76d` purpose blurb at `.claude/release-tests.yaml:626`); using bash to gate a sh script preserves the same shell-mismatch class of escape.

**Patch sketch (unchanged from c18 F03 / c20 F03):**

```diff
@@ scripts/test-install-detect-target.sh:48
-    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
+    # EVAL-PERF-RELEASE-CYCLE21 F03 (carry-forward C16/C18/C20): run under POSIX sh
+    # to match the real `curl … | sh` distribution path. install.sh's shebang
+    # is /usr/bin/env sh; exercising under bash hides bash-only-syntax regressions.
+    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" sh -c '
```

(Or run twice — once under `sh`, once under `bash` — so both shells are gated explicitly.)

---

## F04 — `.claude/release-tests.yaml` `test:` field schema-drift remains 17 of 64 entries (carry-forward C16-F07 / C18-F04 / C20-F04; no new entries added since c20)

- **Severity:** LOW
- **Files:** `.claude/release-tests.yaml:14-23` (manifest schema header), `:620-627` (install-sh entry), plus 16 other entries. Carry-forward from cycle-16 F07 / cycle-18 F04 / cycle-20 F04. **Unchanged vs c20** — most-recent `added: 2026-05-05` (the install-sh-asset-url-template entry, b5ee76d).

Schema header `.claude/release-tests.yaml:19` declares `test: the rust test target name (matches --test flag)` — singular target name. Counting across the live manifest reveals the same 17 schema-drift entries cycle-20 enumerated:

| Drift class | Count | First example (id : `test:` value) |
|---|---|---|
| Multi-test comma-list (≥ 2 cargo `--test` targets) | 6 | `evaluator-drivers-e2e: ldbc_mini_fixture, ldbc_snb_is1_driver, graphalytics_driver, criterion_ingest_driver, scaling_driver` |
| Frontend e2e path-style (`e2e/<spec>`) | 10 | `playground-schema-browser-e2e: e2e/schema-browser` |
| Bash-script entry encoded as cargo target name | 1 | `install-sh-asset-url-template: install_sh_detect_target` (the same entry c20 F04 flagged at `:623`) |

The `command:` field is the source of truth at run-time and works correctly for all 64 entries. The `test:` field is a documentation contract: any consumer that takes `crate` + `test` and constructs `cargo test --test "$test"` builds an invalid command for these 17 entries. No new entries since c20 — which means b5ee76d's install-sh entry (added 2026-05-05) is still encoded with the cargo-target-style ID, the same drift c20 documented and the issue this finding tracks.

**Patch sketch (two layers — pick one; same as c18 F04 / c20 F04):**

1. **Field-shape sweep (preferred — keeps the schema crisp):**

```diff
@@ .claude/release-tests.yaml:623  # install-sh-asset-url-template
-    test: "install_sh_detect_target"
+    test: "bash:scripts/test-install-detect-target.sh"
@@ # multi-test cargo entries — change to a list
-    test: "ldbc_mini_fixture, ldbc_snb_is1_driver, graphalytics_driver, criterion_ingest_driver, scaling_driver"
+    test: ["ldbc_mini_fixture", "ldbc_snb_is1_driver", "graphalytics_driver", "criterion_ingest_driver", "scaling_driver"]
@@ # frontend path-style entries
-    test: "e2e/c9-playground-values"
+    test: "playwright:e2e/c9-playground-values.spec.ts"
```

2. **Schema-header documentation sweep (smallest change):** update the manifest preamble at `.claude/release-tests.yaml:19` to document the four field shapes actually in use (`<rust-test-name>`, `[<rust-test-name>, ...]`, `bash:<path>`, `playwright:<spec>`, `lib:<#[test]>`) so downstream consumers can parse them.

---

## F05 — `scripts/check-public-doc-tmp-leak.sh` still excludes `skills/`; the npm-shipped agent surface remains outside the leak gate (carry-forward C18-F05 / C20-F05)

- **Severity:** LOW
- **Files:** `scripts/check-public-doc-tmp-leak.sh:7` (`SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)`). Compared with `scripts/check-doc-anchors.sh` (which does include `skills`). Carry-forward from cycle-18 F05 / cycle-20 F05.

Verbatim unchanged from c20. The `skills/` tree is npm-published as `opengraphdb-skills`; `check-doc-anchors.sh` and `check-binary-name.sh` correctly include `skills/` in their scope; `check-public-doc-tmp-leak.sh` does not. The current `skills/opengraphdb/SKILL.md` + `references/benchmarks-snapshot.md` body has only `/tmp/<file>.json` env-var assignments and `/tmp/<file>.ogdb` runnable-command examples (which are runnable instructions, not citations and would be exempted by the existing `=/tmp/` filter at `:18`); there are no `/tmp/<file>.md` markdown citations, so this is purely preventive parity, not a current leak. Flagged because the cycle-19 path-coherence widening explicitly added `skills/` to the install-demo-path gate's TARGETS for the same reason — the structural-drift gate scope is meaningful only if the parallel gates agree on what counts as user-facing.

**Patch sketch (unchanged from c18 / c20):**

```diff
@@ scripts/check-public-doc-tmp-leak.sh:7
-SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)
+# EVAL-PERF-RELEASE-CYCLE21 F05 (carry-forward C18/C20): include skills/ — it ships
+# to npm as opengraphdb-skills and is rendered to AI agents on ogdb init --agent-id.
+# Parallels the scope of check-doc-anchors.sh / check-binary-name.sh and the
+# cycle-19 path-coherence widening which added skills/ to its TARGETS.
+SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md skills)
```

---

## F06 — `skills/opengraphdb/SKILL.md:294` "When you hit limits" prose still cites `254 nodes/s` for bulk ingest; `6108439` swept the SKILL.md "Performance you can expect" table at L281-285 + the entire `benchmarks-snapshot.md` 14-row table but missed this prose mention

- **Severity:** LOW
- **Files:** `skills/opengraphdb/SKILL.md:294`. Cross-checked against `documentation/BENCHMARKS.md:111` (canonical 0.4.0 N=5 = `**251 nodes/s**`), `skills/opengraphdb/references/benchmarks-snapshot.md:25` (mirrored 0.4.0 N=5 = `**251 nodes/s**` after `6108439`). NEW for cycle-21.

`skills/opengraphdb/SKILL.md:294`:

```
- **Bulk ingest path is naïve.** 254 nodes/s @ 10k+10k single write-tx — 670× behind
  Kuzu, 1 150× behind Memgraph at the same scale. Workaround: batch via UNWIND inside
  one write-tx, or use `POST /import` for >10k rows. Tracked: BENCHMARKS §4.1.
```

`254 nodes/s` is the 0.3.0 N=5 value (visible in `documentation/BENCHMARKS.md:41` deltas table and in `baseline-2026-04-25.json::throughput::ingest_bulk`). The 0.4.0 N=5 medianed value (per `baseline-2026-05-02.json::throughput::ingest_bulk`) is `251 nodes/s` and is correctly carried in:

- `documentation/BENCHMARKS.md:111` (canonical scorecard row 1) — `**251 nodes/s**`
- `skills/opengraphdb/references/benchmarks-snapshot.md:25` (skills-mirror row 1, swept by `6108439`) — `**251 nodes/s**`

So the SKILL.md scorecard table is correct after `6108439`, but the "When you hit limits" prose 9 lines below it still publishes the OLD 0.3.0 number. Drift is small (`254 → 251 = −1.2 %`) and the verdict claim ("naïve, 670× behind Kuzu") remains true at 251 — but it is the same prose-vs-table failure-class as F01 (skills-mirror axis instead of canonical-doc axis), and same root cause: the cycle-20 `6108439` sweep was scoped to table cells and the methodology / honesty-section prose was not in scope. Flagged at LOW because (a) the drift is rounding-noise scale and (b) it is one line, not a structural axis.

**Patch sketch (single line edit):**

```diff
@@ skills/opengraphdb/SKILL.md:294
-- **Bulk ingest path is naïve.** 254 nodes/s @ 10k+10k single write-tx — 670× behind
+- **Bulk ingest path is naïve.** 251 nodes/s @ 10k+10k single write-tx — 670× behind
```

(The same gate-widening sketched in F01 layer 2 — assert that prose mentions of "row N" cite the same number as the table cell — would also catch this and the F01 instances in one structural pass.)

---

## F07 — `DESIGN.md:2107` "Surface in 0.4.0" subsection still asserts "No global `~/.opengraphdb/config.toml`"; the cycle-19 path-coherence gate excluded design-spec docs by scope (carry-forward C20-F06)

- **Severity:** LOW
- **Files:** `DESIGN.md:2092,2107` (note: file moved from `documentation/DESIGN.md` to repo root since cycle-20's reference; live path is now `./DESIGN.md`). Cross-checked against `scripts/check-install-demo-path-matches-binary-default.sh:79-89` (the cycle-19 widening clause TARGETS list). Carry-forward from cycle-20 F06.

The cycle-19 widening expanded the path-coherence gate to scan three runtime-affecting surfaces (`init_agent.rs`, `skills/opengraphdb/scripts`, `skills/opengraphdb/references`); design-spec docs were excluded by scope. After the cycle-18 `~/.opengraphdb` → `~/.ogdb` rename, two `DESIGN.md` lines still reference the OLD path:

```
DESIGN.md:2092: > `~/.opengraphdb/config.toml` → env vars → CLI flags → per-database
DESIGN.md:2107: - **No global `~/.opengraphdb/config.toml`** and no
```

L2092 is inside a `> Reality check (0.4.0):` blockquote that explicitly frames the rejected original Decision-4 sketch — defensible as historical context using the original sketch's vocabulary.

L2107 is in the **current** "Surface in 0.4.0" subsection asserting "No global `~/.opengraphdb/config.toml`". After the rename, the absent-file mention should reference the NEW path (`~/.ogdb/config.toml`) — a reader who later sees `~/.ogdb/demo.ogdb` materialise on their disk and reads DESIGN.md will reasonably assume the unshipped config file would have been `~/.ogdb/config.toml`, not under a directory they have no other reason to expect. This is shipped public spec drift, not runtime-breaking, and slipped through the cycle-19 path-coherence gate by scope.

**Patch sketch (two layers — both small; layer 1 is the immediate fix):**

1. **Doc fix (single line):**

```diff
@@ DESIGN.md:2107
-- **No global `~/.opengraphdb/config.toml`** and no
+- **No global `~/.ogdb/config.toml`** and no
   `OGDB_BUFFER_POOL_SIZE`-style env vars in 0.4.0. Document any
```

(Leave L2092 verbatim — historical context describing the rejected sketch's vocabulary.)

2. **Gate widening (optional — defensible scope decision either way):** add the repo root + `documentation/` to the cycle-19 path-coherence gate's TARGETS, with an exemption for lines inside `> ` blockquotes that explicitly mark themselves as historical (mirrors the `<!-- HISTORICAL -->` pattern the c18 vocab-mirror gate uses). Without layer 2, the next path rename will repeat the same drift class.

---

## What was checked and not flagged

- **Cycle-20 F01 closure verified.** `6108439` swept all 11 remaining rows in `skills/opengraphdb/references/benchmarks-snapshot.md` (rows 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) to actual 0.4.0 N=5 values from `baseline-2026-05-02.json`; updated the headline `Measurement date: 2026-04-25` → `2026-05-02`; rewrote the wrapper sentence at L5 to match BENCHMARKS.md § 2 framing; swept the 4 SKILL.md "Performance you can expect" rows at L281-285; AND tightened `scripts/check-benchmarks-vocabulary-mirror.sh:60` from `grep -nF` to `grep -niF` to close the lowercase-`directional WIN` escape c20 F01(c) flagged. All three independent failure-axes from c20 F01 are closed.
- **Cell-by-cell mirror verification.** Diffed every cell in `skills/opengraphdb/references/benchmarks-snapshot.md` rows 1-14 against `documentation/BENCHMARKS.md` rows 111-124 cell-for-cell. **All 14 rows agree exactly** on numeric values (rounded to the same precision) and verdicts. The 4 SKILL.md "Performance you can expect" rows L281-285 also agree with their canonical-doc counterparts modulo SKILL.md's intentionally compact verdicts. F01 is in-doc cells-vs-prose drift inside BENCHMARKS.md itself; F06 is one prose mention inside SKILL.md. Both are residue from sweeps that targeted tables; neither contradicts the closure of c20 F01's three axes.
- **`scripts/check-benchmarks-vocabulary-mirror.sh` case-insensitive coverage.** Re-ran case-insensitive sweep across `documentation/BENCHMARKS.md` + `documentation/MIGRATION-FROM-NEO4J.md` + `skills/opengraphdb/SKILL.md` + `skills/opengraphdb/references/benchmarks-snapshot.md` for `directional WIN` / `crushing` / `3 wins / 2 losses / 6 novel` — gate exits 0; no surface ships any casing of those tokens (the `<!-- HISTORICAL -->`-marked instances in BENCHMARKS.md scope/honesty-policy are correctly exempted by the gate's historical-marker logic).
- **Gate coverage of all c19+c20 new gates.** `scripts/test-all-check-scripts-wired.sh` exits clean: every `check-*.sh` on disk is invoked from `scripts/test.sh`. Cycle-19's `check-install-demo-path-matches-binary-default.sh` (with widened TARGETS), cycle-19's `test-check-opengraphdb-path-coherence.sh`, cycle-20's tightened `check-benchmarks-vocabulary-mirror.sh` — all wired. Each runs green standalone:
  - `bash scripts/check-init-agent-syntax.sh` → exit 0
  - `bash scripts/check-benchmarks-vocabulary-mirror.sh` → exit 0
  - `bash scripts/check-install-demo-path-matches-binary-default.sh` → exit 0
  - `bash scripts/check-benchmarks-version.sh` → exit 0
  - `bash scripts/test-check-opengraphdb-path-coherence.sh` → 7/7 cases pass
  - `bash scripts/test-check-init-agent-syntax.sh` → 3/3 cases pass
  - `bash scripts/test-check-benchmarks-vocabulary-mirror.sh` → 3/3 cases pass
- **`.claude/release-tests.yaml` 64 entries.** Every `command:` resolves on disk. Three new entries since c18 (`c9-playground-values-real`, `c9-perf-strip-cells-r6`, `install-sh-asset-url-template`); no new entries since c20. Field-drift count is unchanged at 17. F04 is purely about the `test:` documentation contract.
- **`release.yml` contract.** `bash scripts/test-release-workflow.sh` exits 0; all 14 contract checks pass: `tests` gate runs `bash scripts/test.sh`; `build` / `publish-crates` / `docker` all `needs: tests`; sha256sums emitter narrowed to archive files only (`release.yml:182`); `install.sh` staged into `dist/` for the release-asset bundle; `cargo-auditable` install with plain `cargo build` fallback (`release.sh:64`); idempotency check via `cargo search` before each `cargo publish` (`release.yml:347-353`). All consistent with c20 baseline.
- **`Dockerfile` contract.** `bash scripts/test-dockerfile.sh` exits 0; all 8 contract checks pass.
- **`scripts/install.sh` detect_target.** `bash scripts/test-install-detect-target.sh` exits 0; 5/5 (linux x86_64, linux aarch64, darwin x86_64, darwin arm64, windows x86_64) emit the correct rust-target triple + `.tar.xz` / `.zip` extension. (F03 is the bash-vs-sh shell-mismatch in HOW the test exercises detect_target, not WHAT it asserts.)
- **`baseline-2026-05-02.json` schema.** `schema_version 1.0` across all 15 runs; `binary.version 0.4.0`; aggregation `median-of-5-iters`. JSON sound. F01 is canonical-doc-internal cells-vs-prose drift on numbers that ARE faithfully rebaselined in the table.
- **`scripts/workflow-check.sh` Layer 1 (empty-placeholder rejection).** `[Unreleased]` is non-empty (CHANGELOG.md L10-22 has 17 bullets), gate exits 0. Cycle-19's `32c472e` placeholder bullet still keeps Layer 1 green.
- **All wired meta-tests.** Each meta-test (`test-check-{benchmarks-version,benchmarks-vocabulary-mirror,changelog-paths,contributing-coverage-claim,followup-target-not-current,init-agent-syntax,install-demo-path-matches,npm-package-github-url,opengraphdb-path-coherence,security-supported-version,skills-copilot-removed}.sh`) PASS standalone with both green-fixture and red-fixture cases.
- **KNOWN_BROKEN release.yml jobs.** `publish-crates` (`CRATES_TOKEN` unset, `release.yml:325`) and `docker` (multi-arch QEMU flake, `release.yml:410`) — both live and unchanged since c18. Tracked in `pending_asks`; explicitly out of scope per the cycle-21 brief.

## Cross-references

- **C20 F01 closed by `6108439`.** Verified all three failure-axes (cell sweep + measurement-date headline + lowercase verdict gate-coverage gap). Skills mirror is now cell-for-cell with BENCHMARKS.md § 2.
- **F01 (this cycle) is c20-F01-class but for an in-doc rather than cross-doc axis.** § 2 cells correct; § 3 prose drifted. Same root structure (gate enforces version-label parity, not cell-vs-prose-body parity); same patch shape (sweep + cell-mirror gate).
- **F02 / F03 / F04 / F05 are c20 carry-forwards** (originally c16 / c18 lineage). None received any commit since c20 wrote them up. F02 widened slightly: the v0.5.1..HEAD window is now 34 commits, all `fix(`/`docs(`, every one ungated by Layer 2.
- **F06 is a sweep-residue of c20 F01.** `6108439` correctly swept the SKILL.md scorecard table at L281-285 but missed the "When you hit limits" prose at L294, which is the same Section-3-style methodology paragraph (skills-mirror version of F01).
- **F07 is c20 F06 with a corrected file path.** Cycle-20 listed the file as `documentation/DESIGN.md`; the actual live path is `./DESIGN.md` (DESIGN.md has always been at the repo root, per `git log --follow`). The two stale `~/.opengraphdb` references are unchanged.
- **`pending_asks`** — `release.yml::publish-crates` (CRATES_TOKEN unset) and `release.yml::docker` (multi-arch QEMU flake) — remain KNOWN_BROKEN, tracked separately, NOT re-flagged here per the cycle-21 brief.
