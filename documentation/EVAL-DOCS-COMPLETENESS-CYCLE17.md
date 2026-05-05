# EVAL-DOCS-COMPLETENESS-CYCLE17

- **Workspace HEAD:** `b994aa7` (origin/main, post cycle-16 5-HIGH closure: 3 cycle-16 findings — F01 npm copilot, F02 npm GitHub URL drift, F09 skills/src/index.ts copilot — all closed by commit `09f9161`).
- **Worktree:** `/tmp/wt-c17-docs` (detached off origin/main).
- **Reviewer scope:**
  1. Re-status the 6 MEDIUM + 1 LOW that cycle-16 left open (F03–F08, F10) — promote any whose reader-impact, age, or contradiction-with-shipped-state has changed class.
  2. Audit drift introduced by the three cycle-16 fix commits: `09f9161` (npm-package sweep), `f72f7cd` (BENCHMARKS rows-1+2 rebaseline), `b994aa7` (CI gate wire-in).
- **Prior cycle report:** `git show origin/eval/c16-docs-8496878:documentation/EVAL-DOCS-COMPLETENESS-CYCLE16.md` — 0B + 2H + 6M + 2L. Cycle-16 fix `dc-AB` (`09f9161`) closed F01 + F02 + F09 (npm-package copilot + GitHub URL drift). F03–F08 + F10 not touched.

## Methodology

In-tree gates first (every one passes; this report enumerates drift the gates do not yet cover):

- `bash scripts/check-public-doc-tmp-leak.sh` → 0 hits
- `bash scripts/check-design-vs-impl.sh` → 0 hits
- `bash scripts/workflow-check.sh` → 0 hits
- `bash scripts/check-changelog-tags.sh` → 0 hits
- `bash scripts/check-benchmarks-version.sh` → "ok (0.5.1; headline + § 2 column header agree)"
- `bash scripts/check-contributing-coverage-claim.sh` → 0 hits
- `bash scripts/check-security-supported-version.sh` → "ok (0.5.1 → 0.5.x supported)"
- `bash scripts/check-skills-copilot-removed.sh` → 0 hits (gate scope now `skills/{README.md,src/install.ts,package.json,src/index.ts}` after cycle-16 widening)
- `bash scripts/check-doc-anchors.sh` → 0 hits
- `bash scripts/check-doc-rust-blocks.sh` → "OK — all extracted runnable blocks compile"
- `bash scripts/check-shipped-doc-coverage.sh` → "OK"
- `bash scripts/check-binding-readmes.sh` → "ok"
- `bash scripts/check-npm-package-github-url.sh` → "ok (4 package.json files; remote=https://github.com/asheshgoplani/opengraphdb)" (gate exists but not in CI — see F04)
- `bash scripts/changelog-check.sh` → 0 hits

Cycle-16 commit-by-commit audit:

- `09f9161 fix(npm-packages): strip copilot from skills npm metadata + correct skills+mcp github URLs to asheshgoplani/opengraphdb` — Diff inspected: `mcp/package.json` URL fields fixed (homepage / bugs / repository.url) but `keywords` still contains `"copilot"` (which is **correct** for the MCP package — `mcp/README.md` § "VS Code Copilot" documents Copilot as a supported MCP client and Copilot speaks MCP natively; the cycle-15 copilot purge was scoped to `skills/` because `skills/opengraphdb/SKILL.md` lists six AGENTs none of which are Copilot. No finding here.). `skills/package.json` description + keywords + URLs fixed. `skills/src/index.ts` help string fixed. `scripts/check-skills-copilot-removed.sh` PATHS array widened to four files. `scripts/check-npm-package-github-url.sh` + `scripts/test-check-npm-package-github-url.sh` added. **Gap:** the new `check-npm-package-github-url.sh` gate is not wired into `scripts/test.sh` (or `.github/workflows/`) — see F04.
- `f72f7cd fix(benchmarks): rebaseline rows 1+2 to 0.4.0 N=5 + extend deltas table` — Diff inspected: `documentation/BENCHMARKS.md` deltas table at L40-41 gained rows 1+2 (254 → 251, 302 → 300), and § 2 row-1 + row-2 cells were re-baselined from 254 / 301 → 251 / 300 with `2026-05-02 re-baseline` tag. **Gap:** the headline prose at L5 + the follow-up #11 retrospective at L154 still say "rows 3, 4, 5, 6, 10 in § 2 are this run" — already stale post cycle-15 `cf97159` (which extended re-baseline to rows 7–14) and now strictly false post cycle-16 `f72f7cd` (which extended to rows 1+2). Reader sees the headline and concludes rows 1, 2, 7–14 are old measurements when in fact they all carry the 2026-05-02 N=5 medians. See F03.
- `b994aa7 fix(ci): wire cycle-15 gates into scripts/test.sh + extend verify-claims.sh to non-frontend manifest entries` — Diff inspected: 6 cycle-15 gate scripts wired into `scripts/test.sh`. **Gap:** the four cycle-16-introduced gate scripts (added by sibling commit `09f9161` mere minutes earlier — `check-npm-package-github-url.sh`, `test-check-npm-package-github-url.sh`, plus the widened `check-skills-copilot-removed.sh` already wired) were skipped. The npm GitHub-URL gate is dead code in CI. See F04.

Then audited:

- `git grep -nE 'v0\.5 follow-up|post-v0\.5'` across `documentation/`, `SPEC.md`, `DESIGN.md`, `ARCHITECTURE.md` — 4 hits (F01 below + F08 below). With v0.5.0 + v0.5.1 both shipped, "v0.5 follow-up" / "post-v0.5" reads as a contradiction.
- `git grep -nE '(docs|documentation)/[A-Z][^[:space:]]+\.md' CHANGELOG.md` — 18 hits, two of which (L96 + L97) are the cycle-16 F06 residual paths cycle-15 commit `8496878` ("fix(changelog): … fix docs/→documentation/ path refs …") explicitly advertised as fixed but missed.
- `git remote get-url origin` (`asheshgoplani/opengraphdb`) cross-checked against every `*/package.json` `homepage` / `bugs` / `repository.url` — all four packages clean (`mcp/`, `skills/`, `frontend/`, `frontend/playground-skin/`). The gate exists; it just isn't run in CI — see F04.
- `documentation/COMPATIBILITY.md` enforcement runbook (L92–95) vs. the v0.5.0 fixture file added in cycle-15 (`crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs`) — runbook still lists only the v0.4.0 fixture test, F04 below (cycle-16 F04, restated).
- BENCHMARKS deltas-table header attribution at L33 says "(full audit, cycle-15)" — cycle-16 `f72f7cd` extended it to rows 1+2, attribution should grow. F09 below.

## Findings

### F01 — HIGH — `documentation/COMPATIBILITY.md:67` + `SPEC.md:634` + `DESIGN.md:1628` still call Bolt v4/v5 negotiation a "v0.5 follow-up" — v0.5.0 + v0.5.1 both shipped without it; prose now actively contradicts shipped state

- **Severity escalation:** cycle-16 F08 was MEDIUM. Escalating to HIGH because the v0.5.x train has now shipped two patch releases (v0.5.0 on 2026-05-04 and v0.5.1 on 2026-05-05 per `CHANGELOG.md` L29 + L20) without addressing this, and the docs still tell readers "tracked as a v0.5 follow-up." This is no longer "stale wording" — it is a published claim that is empirically false. A reader pulling v0.5.1 from crates.io and grepping `BOLT_VERSION_*` finds only `BOLT_VERSION_1` and the docs still promise v4/v5 is coming "in v0.5." Same class as cycle-15 F12 fix for the HNSW backend swap (which `ca82055` correctly bumped to "v0.6.0 follow-up (slipped from v0.5)"); cycle-15+16 didn't extend that sweep to Bolt.
- **Locations:**
  ```
  documentation/COMPATIBILITY.md:67  v4 / v5 negotiation is tracked as a v0.5 follow-up
  SPEC.md:634                        Bolt v1 protocol compatibility (v4/v5 negotiation is a v0.5 follow-up)
  DESIGN.md:1628                     v4/v5 negotiation is a v0.5 follow-up tracked
  ```
- **Verified:** `crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1` is the only declared version constant (`grep -nE 'BOLT_VERSION_[0-9]' crates/ogdb-bolt/src/lib.rs`). `[0.5.0]` + `[0.5.1]` `### Added` blocks list zero Bolt-protocol entries.
- **Patch sketch:**
  ```
  s/v0\.5 follow-up/v0.6.0 follow-up (slipped from v0.5)/
  ```
  applied to all three files. Then extend `scripts/check-design-vs-impl.sh` (or add a sibling `scripts/check-followup-target-not-current.sh`): assert that no `vX\.Y follow-up|vX\.Y\.Z follow-up` token in `documentation/`, `SPEC.md`, `DESIGN.md`, `ARCHITECTURE.md` names a minor `<= current_minor` (where `current_minor = $(grep '^version' Cargo.toml | head -1 | cut -d'"' -f2 | cut -d. -f1-2)`). This generalizes cycle-15 F12's single-file fix; would catch the Bolt + future cases mechanically.

---

### F02 — HIGH — `CHANGELOG.md:96-97` `[0.4.0] ### Added` still references `docs/COOKBOOK.md` and `docs/MIGRATION-FROM-NEO4J.md` — cycle-15 commit `8496878` advertised "fix docs/→documentation/ path refs" as scope but missed these two adjacent bullets

- **Severity escalation:** cycle-16 F06 was MEDIUM. Escalating to HIGH because (a) cycle-15 commit `8496878 fix(changelog): split [0.5.0]+[0.5.1], fix docs/→documentation/ path refs, real Unreleased bullets` *explicitly* advertised this fix in its subject line — readers + reviewers reasonably believed the sweep was complete; (b) cycle-16 took no action on it; (c) these are the two flagship recipe docs whose runnable-snippet gates are the project's headline reproducibility story (cited in README + landing page) — a contributor following the L96-L97 references gets a missing-file error and may assume the docs were never written.
- **Locations:**
  ```
  CHANGELOG.md:96  - `docs/COOKBOOK.md` — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts`
  CHANGELOG.md:97  - `docs/MIGRATION-FROM-NEO4J.md` — 5-min honesty-first migration guide; backed by ...
  ```
- **Verified:** `ls documentation/COOKBOOK.md documentation/MIGRATION-FROM-NEO4J.md` resolves; `ls docs/COOKBOOK.md docs/MIGRATION-FROM-NEO4J.md` returns ENOENT. The `[0.4.0] ### Changed` block at L86 correctly documents the move ("user-facing docs … moved from `docs/` to a new `documentation/` folder"), so the L96-L97 references are unambiguously stale not historical.
  L107 (`docs/IMPLEMENTATION-LOG.md`, `docs/TDD-METHODOLOGY.md`, `docs/VERSIONING.md`) is correct — those three are still under `docs/`. Scope of finding is L96-L97 only.
- **Patch sketch:**
  ```diff
  -- `docs/COOKBOOK.md` — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts` ...
  +- `documentation/COOKBOOK.md` (relocated to `documentation/` in this release per § Changed above) — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts` ...
  -- `docs/MIGRATION-FROM-NEO4J.md` — 5-min honesty-first migration guide; backed by ...
  +- `documentation/MIGRATION-FROM-NEO4J.md` (relocated in this release) — 5-min honesty-first migration guide; backed by ...
  ```
  Then add a regression gate: in `scripts/check-doc-anchors.sh` (or sibling `scripts/check-changelog-paths.sh`), grep every `(docs|documentation)/[A-Z][^[:space:]]+\.md` reference in `CHANGELOG.md` and assert each path resolves. Whitelist `docs/IMPLEMENTATION-LOG.md`, `docs/TDD-METHODOLOGY.md`, `docs/VERSIONING.md` (the three legitimate `docs/`-rooted survivors).

---

### F03 — HIGH — `documentation/BENCHMARKS.md:5` + `:154` headline + retrospective claim "rows 3, 4, 5, 6, 10 in § 2 are this run" — cycle-16 `f72f7cd` extended re-baseline to rows 1+2 without touching the prose; cycle-15 `cf97159` had already extended to rows 7-14

- **Severity:** HIGH. Reader-impact is high — the prose at L5 is the **first sentence** under "Measurement date" in the project's public competitive-comparison sheet, and it explicitly tells the reader which rows are fresh vs. carry-forward. After cycle-16 `f72f7cd` rebaselined rows 1+2, **all 14 rows** carry the 2026-05-02 N=5 re-baseline (verified: `grep -c '2026-05-02 re-baseline' documentation/BENCHMARKS.md` returns 14, one per row). The headline still scopes the run to 5 rows — the inverse of reality.

  This is **drift introduced by cycle-16** (f72f7cd extended row scope without updating headline); the cycle-15 cf97159 commit had already left the prose stale for rows 7-14, but cycle-16 made it strictly worse and was the natural place to land the prose fix.

- **Locations:**
  ```
  documentation/BENCHMARKS.md:5    **Measurement date:** 2026-05-02 (cycle-9 N=5 re-baseline at 0.4.0; rows 3, 4, 5, 6, 10 in § 2 are this run. ...)
  documentation/BENCHMARKS.md:154  ... **Done 2026-05-02** — rows 3, 4, 5, 6, 10 above now carry fresh 0.4.0 N=5 medians from `baseline-2026-05-02.json` ...
  ```
- **Verified:** Every row 1–14 in § 2 (L111–124) ends with `(0.4.0, N=5 median, 2026-05-02 re-baseline)` or `(0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline)`. None say "single-shot" or "0.3.0 N=5". The 5-row scope claim is false against every row in the table.
- **Patch sketch:**
  ```diff
  -**Measurement date:** 2026-05-02 (cycle-9 N=5 re-baseline at 0.4.0; rows 3, 4, 5, 6, 10 in § 2 are this run. The 2026-05-01 single-shot and 2026-04-25 0.3.0 N=5 medianed baselines are preserved as historical.).
  +**Measurement date:** 2026-05-02 (N=5 re-baseline at 0.4.0; **all 14 rows in § 2** are this run after cycle-15 `cf97159` extended scope to rows 7-14 and cycle-16 `f72f7cd` extended scope to rows 1-2. The 2026-05-01 single-shot and 2026-04-25 0.3.0 N=5 medianed baselines are preserved as historical.).
  ```
  And matching update for L154:
  ```diff
  -**Done 2026-05-02** — rows 3, 4, 5, 6, 10 above now carry fresh 0.4.0 N=5 medians ...
  +**Done 2026-05-02** — all 14 rows above now carry fresh 0.4.0 N=5 medians (cycle-9 wave: rows 3-6 + 10; cycle-15 `cf97159`: rows 7-14; cycle-16 `f72f7cd`: rows 1-2) ...
  ```
  Wire a regression gate in `scripts/check-benchmarks-version.sh` (or sibling): if every row in § 2 carries `2026-05-02 re-baseline`, the headline must say "all 14 rows" not enumerate a subset.

---

### F04 — HIGH — `scripts/check-npm-package-github-url.sh` created in cycle-16 `09f9161` is not wired into `scripts/test.sh` — the gate is dead code in CI; sibling commit `b994aa7` wired only the cycle-15 gates

- **Severity:** HIGH. The cycle-16 fix-set was **two coupled commits**: `09f9161` fixed the npm URL drift and added a regression gate, then `b994aa7` (10 minutes later) wired CI gates. `b994aa7` wired `check-skills-copilot-removed.sh` and 5 cycle-15 gates into `scripts/test.sh`, but **skipped the brand-new sibling `check-npm-package-github-url.sh` and its meta-test `test-check-npm-package-github-url.sh`**. The npm-URL gate exists, passes when invoked manually, but never runs in `scripts/test.sh` or any `.github/workflows/*.yml`. The cycle-16 F02 closure is therefore one bad commit (a contributor reverting the URL fix) away from regressing without any CI signal.
- **Locations:**
  ```
  scripts/check-npm-package-github-url.sh        (created 09f9161, exists, passes)
  scripts/test-check-npm-package-github-url.sh   (created 09f9161, exists, passes)
  scripts/test.sh                                (b994aa7 added 6 lines for cycle-15 gates; cycle-16 sibling gate not added)
  .github/workflows/ci.yml                       (no reference)
  ```
- **Verified:**
  ```
  $ grep -rn check-npm-package-github-url scripts/test.sh .github/
  (no output)
  $ grep -rn check-npm-package-github-url scripts/
  scripts/check-npm-package-github-url.sh:...   (the script itself)
  scripts/test-check-npm-package-github-url.sh:GATE="$REPO_ROOT/scripts/check-npm-package-github-url.sh"
  ```
  The meta-test references the gate but is itself unwired. The same gap that cycle-16 F02 was supposed to lock down — fictional `github.com/openGraphDB/openGraphDB` URLs in npm `package.json` files — would re-pass `bash scripts/test.sh` if reintroduced today.
- **Patch sketch:** in `scripts/test.sh`, add to the pre-cargo gate block (after line 19, beside the cycle-15 cluster):
  ```bash
  # EVAL-DOCS-COMPLETENESS-CYCLE16 F02: every */package.json must declare
  # repository.url / homepage / bugs URLs that match `git remote get-url origin`.
  ./scripts/check-npm-package-github-url.sh
  ```
  And in the post-cargo meta-test block (after the existing `test-check-skills-copilot-removed.sh` line):
  ```bash
  ./scripts/test-check-npm-package-github-url.sh
  ```
  Add a CI-coverage assertion: a meta-meta-test that grep counts `scripts/test.sh` mentions of every `scripts/check-*.sh` and fails if a check script is unreferenced (the cycle-15+16 lesson is that creating a gate is half the job; wiring it is the other half).

---

### F05 — MEDIUM — `documentation/COMPATIBILITY.md:44` still says "Future releases add a v0.5.0 fixture beside it"; v0.5.0 fixture exists (cycle-15 `c904418`)

- **Restated from cycle-16 F03 — not addressed by cycle-16.** Severity unchanged: the v0.5.0 fixture file `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` exists and is verified against the current binary, so the prose is contradictory rather than 404, but it's still a reader-confusion drift. Patch sketch identical to cycle-16 F03 patch — replace "Future releases add a v0.5.0 fixture beside it" with the actual two-fixture inventory.
- **Patch sketch:**
  ```diff
  -- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` ships a checked-in v0.4.0 fixture and asserts the current binary opens it. Any format-version bump that breaks readability fails this test in CI. Future releases add a v0.5.0 fixture beside it; the test scaffold is designed to grow.
  +- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` and `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` ship checked-in v0.4.0 and v0.5.0 fixtures respectively; both assert the current binary opens them. The v0.5.0 fixture is byte-identical to v0.4.0 because the five `*_FORMAT_VERSION` constants did not bump in the 0.4 → 0.5 window — the parallel test locks policy, not data, in place. Any format-version bump that breaks readability fails these tests in CI. Future releases (v0.6.0+) add a `v0.6.0` fixture beside them; the scaffold grows with each minor.
  ```

---

### F06 — MEDIUM — `documentation/COMPATIBILITY.md:94` § 6 release-time enforcement runbook only enumerates `upgrade_fixture_v0_4_0_opens_on_current` — v0.5.0 fixture not in the runbook

- **Restated from cycle-16 F04 — not addressed by cycle-16.** § 6 declares "Every `v*` tag must" pass three explicit checks; check 3 names only the v0.4.0 fixture test. The v0.5.0 fixture test added in cycle-15 `c904418` is invisible to anyone reading the policy doc — they would not know to also run it on a release tag.
- **Patch sketch:**
  ```diff
  -3. Pass `cargo test -p ogdb-core --test upgrade_fixture_v0_4_0_opens_on_current` — the v0.4.0 baseline fixture still opens (Finding 12, this document).
  +3. Pass `cargo test -p ogdb-core --test 'upgrade_fixture_v0_*_opens_on_current'` — every checked-in upgrade fixture (currently `v0.4.0` and `v0.5.0`) still opens on the current binary. New minor releases add a `v0.X.0` fixture and add it to this gate (Finding 12, this document).
  ```
  Wire a regression check (could go in `scripts/check-design-vs-impl.sh`): assert `count(crates/ogdb-core/tests/upgrade_fixture_v0_*_opens_on_current.rs) == count(upgrade_fixture_v0_*_opens_on_current entries in documentation/COMPATIBILITY.md § 6)`.

---

### F07 — MEDIUM — `documentation/COMPATIBILITY.md:3` doc-level stamp still says "active as of v0.4.0 · 2026-05-01"; cycle-15 `c904418` advanced the body to 0.5.* without bumping the stamp

- **Restated from cycle-16 F05 — not addressed by cycle-16.** Same class of stale-stamp drift as cycle-15 F02 caught for `SPEC.md:5`. A contributor reading "active as of v0.4.0" may infer the policy applies up to but not including 0.5.x, when in fact § 3 explicitly governs `0.5.*`.
- **Patch sketch:**
  ```diff
  -**Status:** active as of v0.4.0 · 2026-05-01
  +**Status:** active as of v0.5.1 · 2026-05-05 (last reviewed cycle-17; cycle-15 `c904418` advanced § 3 examples 0.4.* → 0.5.* + added v0.5.0 upgrade-fixture)
  ```

---

### F08 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md:26` release-notes prose still reads "tracked as a post-v0.5 task" — cycle-15 `812068f` bumped the action-item line two lines above to "v0.6 minor" but missed the canned release-notes wording

- **Restated from cycle-16 F07 — not addressed by cycle-16.** L19 reads "Target: v0.6 minor (slipped from original v0.5 target)" (correct, post-cycle-15). L26 inside the `> Release-notes wording when shipped:` blockquote still reads "A pyo3 0.24 migration is tracked as a post-v0.5 task." That's the prose that would *literally ship in the v0.6 release notes* if migrated tomorrow. With v0.5.0 + v0.5.1 already shipped without migration, "post-v0.5" is no longer disambiguating — the entire point of cycle-15 F13's renaming.
- **Patch sketch:**
  ```diff
  -  > default. A pyo3 0.24 migration is tracked as a post-v0.5 task. If you
  +  > default. A pyo3 0.24 migration is tracked as a v0.6.0 task (slipped
  +  > from the original v0.5 target — pyo3 0.21 → 0.24 is a major API
  +  > migration that the 0.4.0 → 0.5.x development window did not include).
  +  > If you
  ```

---

### F09 — LOW — `documentation/BENCHMARKS.md:33` deltas-table header attribution "(full audit, cycle-15)" is stale — cycle-16 `f72f7cd` extended the table with rows 1+2

- **Severity:** LOW. The "(full audit, cycle-15)" attribution at L33 was correct when the deltas table covered rows 3-14 (post cycle-15 `cf97159`). Cycle-16 `f72f7cd` added rows 1+2 to the same table without updating the attribution line. Reader-impact is low (the row count makes it self-evident the table grew); this is bookkeeping drift, not a contradiction. Same class as F03 (cycle-16 left prose stale when extending tables) but at lower reader-impact, hence LOW.
- **Location:** `documentation/BENCHMARKS.md:33`
- **Patch sketch:**
  ```diff
  -> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15).** The
  +> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15 + cycle-16).** The
  ```

---

### F10 — LOW — `frontend/e2e/qa-followups.spec.ts:3` cites private `/tmp/wt-frontend-qa/QA-REPORT.md` scratch path

- **Restated from cycle-16 F10 — not addressed by cycle-16.** The leak is in a tracked test file (not in `documentation/` so the public-doc-tmp-leak gate doesn't flag it). Reader-impact bounded; either drop the path-citation, move the audit report to `documentation/audits/`, or extend `scripts/check-public-doc-tmp-leak.sh` to also cover `frontend/e2e/`.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 4     | F01, F02, F03, F04 |
| MEDIUM   | 4     | F05, F06, F07, F08 |
| LOW      | 2     | F09, F10 |

### Severity changes vs. cycle-16

- **Up:** cycle-16 F08 (Bolt v0.5 follow-up) MEDIUM → HIGH (now F01) — v0.5.0 + v0.5.1 both shipped without it.
- **Up:** cycle-16 F06 (CHANGELOG docs/→ documentation/) MEDIUM → HIGH (now F02) — cycle-15 `8496878` advertised this as fixed; missed bullets are flagship recipe docs cited from README.
- **New HIGH (cycle-16-introduced):** F03 (BENCHMARKS row-scope prose drift) — cycle-16 `f72f7cd` extended re-baseline to rows 1+2 without touching the L5 + L154 prose; the headline is now strictly false against every row in § 2.
- **New HIGH (cycle-16-introduced):** F04 (npm-URL gate created but not CI-wired) — cycle-16 `09f9161` added the gate but sibling commit `b994aa7` wired only cycle-15 gates; the cycle-16 F02 closure has zero CI enforcement.
- **Carry-forward MEDIUMs:** F05–F08 unchanged from cycle-16 F03–F07; cycle-16 took no action on these.
- **Carry-forward LOW:** F10 unchanged from cycle-16 F10.
- **New LOW (cycle-16-introduced):** F09 — BENCHMARKS deltas-table attribution stale.
- **Closed in cycle-16:** F01 + F02 + F09 (npm copilot + URL drift + skills/src/index.ts copilot) — verified gates pass; gate scope widened to four files for the copilot sweep.

### Headline

Cycle-16 closed the 2 cycle-16 HIGHs cleanly (npm-package surface) but introduced two new HIGH-class gaps of its own — the same failure mode cycle-16 itself called out for cycle-15: **partial sweeps leave companion prose stale (F03), and creating a regression gate without wiring it is half the job (F04)**. Three of the six cycle-16 MEDIUMs (F01 Bolt, F02 CHANGELOG path drift) crossed into HIGH territory because the v0.5.x train shipping twice (post 0.5.0 on 2026-05-04 and 0.5.1 on 2026-05-05) turned forward-looking prose into shipped-state contradiction.

**Process recommendation for cycle-17:** every fix commit that adds a `scripts/check-*.sh` gate must also touch `scripts/test.sh` in the same commit (or as a paired commit landing within the same cycle). Add a structural assertion: `comm -23 <(ls scripts/check-*.sh | sort) <(grep -oE 'scripts/check-[A-Za-z0-9-]+\.sh' scripts/test.sh | sort -u)` should be empty. The cycle-16 npm-URL gate omission would have failed this assertion on the b994aa7 commit and been caught at review time.
