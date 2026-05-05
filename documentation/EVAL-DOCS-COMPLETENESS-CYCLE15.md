# EVAL-DOCS-COMPLETENESS-CYCLE15

- **Workspace HEAD:** `aff476f` (origin/main, post-v0.5.1 + cascade-fix landings)
- **Worktree:** `/tmp/wt-c15-docs` (detached off origin/main)
- **Reviewer scope:** `documentation/`, `docs/`, root `*.md`, plus tracked frontend / skill / e2e surface that affects user-facing docs
- **Prior cycle report:** none found in tree (`documentation/EVAL-DOCS-COMPLETENESS-CYCLE14.md` does not exist; tracked eval reports are gitignored under `.planning/`)

## Methodology

Ran the in-tree gates first (each passing exit=0):

- `bash scripts/check-public-doc-tmp-leak.sh` → 0 hits
- `bash scripts/check-design-vs-impl.sh`     → 0 hits
- `bash scripts/workflow-check.sh`           → 0 hits (gate is satisfied by the placeholder bullet — see F09)

Then audited:

- `git grep` for `/Users/ashesh` and `/home/ashesh-goplani` across tracked files (0 hits — clean)
- `git grep -nE "0\.4\.[0-9]+|0\.3\.[0-9]+"` against `*.md` and frontend `*.tsx` for stale headline versions
- README install URL pattern vs `scripts/install.sh` `OGDB_VERSION=latest` resolver (consistent)
- Frontend GitHub URL hostnames vs `git remote get-url origin` (`asheshgoplani/opengraphdb` — consistent)
- Cookbook recipe HTTP-snippet count vs `frontend/e2e/cookbook-snippets-runnable.spec.ts` coverage
- Internal-only docs accidentally tracked (`.planning/`, `.research/`, `/tasks/`, `docs/IMPLEMENTATION-LOG.md` correctly gitignored)
- Skill bundle (`skills/**/*.md`) version + agent-list freshness vs commits since v0.5.0
- `CHANGELOG.md` section completeness vs `git tag` output
- `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `COMPATIBILITY.md` freshness vs current shipped surface

## Findings

### F01 — BLOCKER — `SECURITY.md` declares 0.5.x unsupported for security fixes

- **Location:** `SECURITY.md:32-36`
- **Problem:** The "Supported Versions" table lists only `0.4.x ✅ / < 0.4.0 ❌` while the policy line above states "We patch security issues in the latest minor release only." The latest minor is **0.5.x** (current shipped: v0.5.1, per `Cargo.toml:25` `version = "0.5.1"` and `git tag` showing `v0.5.0` + `v0.5.1`). As written, the policy declares the current shipped line *unsupported* for security fixes, which is the most consequential possible reader misdirection in a security-policy doc.
- **Patch sketch:**
  ```diff
  -| 0.4.x   | ✅        |
  -| < 0.4.0 | ❌        |
  +| 0.5.x   | ✅        |
  +| < 0.5.0 | ❌        |
  ```
  Wire a regression gate: extend `scripts/check-design-vs-impl.sh` (or add `scripts/check-security-supported-version.sh`) to assert the `Supported` row's minor matches `cargo metadata --format-version 1 | jq -r .workspace_default_members[0]`'s minor.

---

### F02 — HIGH — `SPEC.md` headline still claims "Version: 0.3.0"

- **Location:** `SPEC.md:5`
- **Problem:** Header reads `**Version:** 0.3.0` / `**Date:** 2026-04-23` while the workspace is at v0.5.1 (2026-05-05). SPEC.md is named in `ARCHITECTURE.md` as the canonical product-spec source; a contributor opening it sees a version label two minor releases stale.
- **Patch sketch:**
  ```diff
  -**Version:** 0.3.0
  -**Date:** 2026-04-23
  +**Version:** 0.5.1
  +**Date:** 2026-05-05
  ```
  Add to `scripts/check-design-vs-impl.sh`: `grep -q "^\*\*Version:\*\* $(cargo metadata --no-deps --format-version 1 | jq -r '.packages[0].version')" SPEC.md`.

---

### F03 — HIGH — Hero badge on landing page hard-codes `v0.3.0` and a regression test pins it

- **Location:** `frontend/src/components/landing/HeroSection.tsx:80` plus `frontend/e2e/pg-high-fixes.spec.ts:15-22` and `frontend/e2e/pg-high-fixes-probe.spec.ts:15`, plus `frontend/e2e/a11y-sweep.spec.ts:22`
- **Problem:** Hero eyebrow renders `v0.3.0 · open source · Apache-2.0 · single-file`. Worse, three e2e tests *pin* it to v0.3.0 (`pg-high-fixes.spec.ts:18` `await expect(hero).toContainText(/v0\.3\.0/)`). This is the headline version label on the marketing site and locks the doc-impl drift in via the test suite — exactly the failure mode the test was originally written to prevent (its own comment says: "hard-coded `v0.1` while Cargo.toml had been at 0.3.0 for two minor releases" — same pattern, same drift).
- **Patch sketch:**
  ```diff
  -            v0.3.0&nbsp;·&nbsp;open source&nbsp;·&nbsp;Apache-2.0&nbsp;·&nbsp;single-file
  +            v0.5.1&nbsp;·&nbsp;open source&nbsp;·&nbsp;Apache-2.0&nbsp;·&nbsp;single-file
  ```
  And in all three e2e files, replace `/v0\.3\.0/` with a build-time injected constant or a regex that reads from `Cargo.toml` via `await fs.readFile`. Best: extract the version into a single constant (`frontend/src/lib/version.ts`) sourced from `import.meta.env.VITE_OGDB_VERSION` (set by Vite from `Cargo.toml`), and make the test read the same source — eliminates the hard-coded literal in three places.

---

### F04 — HIGH — `skills/opengraphdb/SKILL.md` still ships 0.3.0 perf table to AI agents

- **Location:** `skills/opengraphdb/SKILL.md:267, 274, 277, 290, 356`
- **Problem:** The master skill (the one that gets installed into Claude Code / Cursor / Codex via `npx @opengraphdb/skills install` and `ogdb init --agent`) frames its "Performance you can expect" table as `OpenGraphDB 0.3.0 baseline`, the table header is `| OpenGraphDB 0.3.0 |`, "When you hit limits" reads "Honest list of what 0.3.0 does **not** do well", and the kernel-single-writer note pins to 0.3.0. `documentation/BENCHMARKS.md` itself was bumped at `aff476f` to "0.5.1 — Competitive Benchmark Baseline" with the patch-release note that the 0.4.0 N=5 medians are authoritative for 0.5.1 — but the SKILL.md prose was not swept along. The skill is the most-AI-visible surface in the repo.
- **Patch sketch:** Replace `0.3.0` with `0.5.1` at L267, L274, L277, L290, L356, and update the prose framing to mirror BENCHMARKS.md L3's patch-release note: "carrying forward the 0.4.0 N=5 medianed numbers — zero perf-relevant code in the 0.4.0 → 0.5.1 window." Same fix for `skills/opengraphdb/references/benchmarks-snapshot.md:1, 19` (title + table header).

---

### F05 — HIGH — `skills/opengraphdb/references/cypher-coverage.md` headlines 0.4.0

- **Location:** `skills/opengraphdb/references/cypher-coverage.md:1, 3, 14-15`
- **Problem:** Title `# OpenGraphDB Cypher coverage (0.4.0)`, body "Authoritative feature × status grid for Cypher in OpenGraphDB 0.4.0", and a 0.3.0→0.4.0 changelog note. Same skill bundle as F04, same install path. v0.5.x added no Cypher language changes (verified: 0.5.0 + 0.5.1 changelog "Added" sections list demo subcommand, AMBER palette, SPA bundling, install fixes — no Cypher), so the *content* is still correct, but the version stamp is misleading.
- **Patch sketch:**
  ```diff
  -# OpenGraphDB Cypher coverage (0.4.0)
  -Authoritative feature × status grid for Cypher in OpenGraphDB 0.4.0. Sources of
  +# OpenGraphDB Cypher coverage (0.5.1)
  +Authoritative feature × status grid for Cypher in OpenGraphDB 0.5.1 (no Cypher-language changes since 0.4.0). Sources of
  ```

---

### F06 — HIGH — `npm @opengraphdb/skills` still claims Copilot support; SKILL.md dropped it

- **Location:** `skills/README.md:3, 18, 83-89, 149` and `skills/src/install.ts:11, 22, 123, 126, 138`, vs. `skills/opengraphdb/SKILL.md:19` and `crates/ogdb-cli/src/init_agent.rs` (cleanup commit `10c0d3a`)
- **Problem:** Commit `10c0d3a docs(skills): drop copilot from compatibility — implementation supports 6 agents` updated `SKILL.md` and `init_agent.rs` to advertise only 6 agents (`[claude-code, cursor, continue.dev, aider, goose, codex]`). But `skills/README.md` (the npm package's user-facing readme) still:
  - L3: lists "VS Code Copilot" in the supported tools sentence
  - L18, L86, L149: ships `npx @opengraphdb/skills install copilot` examples
  - L83-89: a full "VS Code Copilot" section explaining the install
  And `skills/src/install.ts` still implements `"copilot"` as a `Platform` and writes `.github/copilot-instructions.md`. Result: a user reading the npm README runs `install copilot`, gets a working install of a skill bundle whose own SKILL.md compatibility metadata says copilot is not a supported agent. The two surfaces drifted in opposite directions.
- **Patch sketch:** Decide which surface is correct, then converge:
  - **If copilot IS supported** (npm install path works), revert `10c0d3a` for the SKILL.md `agents:` line and put `copilot` back; sync `init_agent.rs` AGENTS table.
  - **If copilot is NOT supported** (commit `10c0d3a` was the source of truth), strip copilot from `skills/README.md:3, 18, 83-89, 149` and remove the `"copilot"` arm from `skills/src/install.ts:11, 22, 123, 126, 138`. Add a regression gate: `grep -L "copilot" skills/README.md skills/src/install.ts skills/opengraphdb/SKILL.md` should return all three — every file mentions copilot or none does.

---

### F07 — HIGH — `CONTRIBUTING.md` coverage gate (93% / 3000) does not match `scripts/coverage.sh` (80% / 5000)

- **Location:** `CONTRIBUTING.md:47` vs `scripts/coverage.sh:37-38`
- **Problem:** Contributing guide tells contributors `93% line coverage, ≤ 3000 uncovered lines as of v0.4.0`. The actual gate in `scripts/coverage.sh` is `--fail-under-lines 80 --fail-uncovered-lines 5000`. The script's own comment (L27-29) explains why: "fail-under threshold is lower than the prior ogdb-core/cli value because the split crates have minimal tests." A contributor following CONTRIBUTING will be confused when their PR passes the gate at 81% or fails their own pre-flight check expecting 93%.
- **Patch sketch:**
  ```diff
  -`ogdb-core` and `ogdb-cli` must stay at or above the current ratchet (declared in `scripts/coverage.sh` — 93% line coverage, ≤ 3000 uncovered lines as of v0.4.0). The gate ratchets DOWN as test coverage grows; never up. The gate command:
  +Coverage gate (declared in `scripts/coverage.sh`): **80% line coverage, ≤ 5000 uncovered lines** workspace-wide (excluding `ogdb-bench`, `ogdb-e2e`, `ogdb-eval`, `ogdb-fuzz`, `ogdb-tck`). Threshold was lowered from the prior 93%/3000 ogdb-core/cli value when the monolith split landed split-crates with minimal tests; M14 tracks raising it. The gate ratchets in only one direction — **DOWN never up** — to lock in coverage growth.
  ```
  Add a regression gate in `scripts/check-design-vs-impl.sh`: `grep -q "fail-under-lines $(grep -oE 'at or above.*?coverage' CONTRIBUTING.md | grep -oE '[0-9]+')" scripts/coverage.sh`.

---

### F08 — HIGH — `CHANGELOG.md` has no `[0.5.0]` section despite a `v0.5.0` git tag

- **Location:** `CHANGELOG.md:8-100` (section headers + footer)
- **Problem:** `git tag` lists `v0.3.0`, `v0.4.0`, `v0.5.0`, `v0.5.1`. CHANGELOG section headers are `[Unreleased] / [0.5.1] / [0.4.0] / [0.3.0] / [0.2.0] / [0.1.0]` — the `[0.5.0]` section was skipped entirely; all v0.5.0 features were folded into `[0.5.1] - 2026-05-05` (which is supposed to be a patch, see F08-related: the [0.5.1] body's "Added" subsection lists the `ogdb demo` subcommand, the AMBER-TERMINAL palette sweep, the bundled SPA via `include_dir!`, and the cross-platform `FileExt` shim — those are minor-version additions, not patch fixes). This violates Keep-A-Changelog (one section per released tag) and the project's own `docs/VERSIONING.md` Release Checklist step 3 ("move entries from `Unreleased` into a new `## [X.Y.Z] - YYYY-MM-DD` section").
- **Additionally** the footer's compare links don't include `[0.5.1]` or `[0.5.0]`, and `[Unreleased]` still says `compare against v0.4.0 once pushed` — should compare against `v0.5.1`. The 2026-05-01 dated comment block at the footer is also stale (today's HEAD landed 2026-05-05).
- **Patch sketch:** Split the current `[0.5.1]` section into:
  ```markdown
  ## [0.5.1] - 2026-05-05
  ### Fixed
  - (the four install.sh / release.yml / README install fixes, only)

  ## [0.5.0] - <date the v0.5.0 tag was cut>
  ### Added
  - `ogdb demo <path>` subcommand …
  - AMBER-TERMINAL palette …
  - `ogdb-cli` embeds the built playground SPA …
  - Cross-platform `platform_io::FileExt` shim …
  - `CODE_OF_CONDUCT.md` and `SECURITY.md` …
  - `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}` …
  ### Changed
  - (everything currently under [0.5.1] Changed)
  ### Removed
  - (everything currently under [0.5.1] Removed)
  ```
  Footer: add `[0.5.1]: …/compare/v0.5.0...v0.5.1` and `[0.5.0]: …/compare/v0.4.0...v0.5.0`; bump `[Unreleased]` to compare against `v0.5.1`. Refresh the "Push status as of …" comment to today's date.

---

### F09 — HIGH — `benchmarks/rag/RESULTS.md` headline says `v0.2.0` (3 minor releases stale)

- **Location:** `benchmarks/rag/RESULTS.md:5`
- **Problem:** Tracked, public, user-facing RAG accuracy + latency results doc declares `OpenGraphDB: v0.2.0`. v0.2.0 was tagged 2026-02-27 per CHANGELOG; we're now at v0.5.1 (2026-05-05), past `[0.3.0]`, `[0.4.0]`, `[0.5.0]`, `[0.5.1]`. Numbers (Recall@5 0.419, latency, etc.) are all anchored to a long-superseded build. Either re-run on current binary or mark the doc historical / move it under a `historical/` subtree the way root `IMPLEMENTATION-READY.md:3` does.
- **Patch sketch:** Add a top banner (matching `IMPLEMENTATION-READY.md:3-6` pattern):
  ```diff
  +**Status:** historical (frozen v0.2.0 RAG-bench baseline; numbers do not reflect 0.3.0 / 0.4.0 / 0.5.x perf or accuracy).
  +**Current state:** see `documentation/BENCHMARKS.md` § Row 7 (hybrid retrieval) and § Row 8 (rerank) for the live numbers; the BEIR / NDCG@10 RAG-accuracy baseline is tracked as a deferred item there.
  +**Why kept:** documents the original RAG-bench harness shape and the BM25-vs-vector-vs-RRF accuracy ranking; not a current source of truth for any number.
  +
   # RAG Benchmark Results
  ```
  Or rebaseline by running `cargo bench -p ogdb-bench --bench rag_benchmark` on current main and updating the table.

---

### F10 — HIGH — `documentation/COMPATIBILITY.md` CLI/`v0.4.x` examples + missing v0.5.0 fixture

- **Location:** `documentation/COMPATIBILITY.md:54-55, 44`
- **Problem:** The CLI-surface section pins examples to `0.4.*`: "Subcommand contracts stable within a minor. `ogdb serve --http :8080` will keep meaning the same thing in any `0.4.*` patch release" and "`--help`-reachable flags stable across `0.4.*`." Since the current minor is 0.5.x, contributors and downstream CI hardness authors reading this guide today won't know whether the 0.5.x line carries the same guarantee.

  The upgrade-fixture-test bullet (L44) says "Future releases add a v0.5.0 fixture beside it" — but v0.5.0 has shipped (`git tag` confirms), and `ls crates/ogdb-core/tests/upgrade_fixture_*` shows only `upgrade_fixture_v0_4_0_opens_on_current.rs`. The promised v0.5.0 fixture was not added when v0.5.0 was cut, even though the policy doc anticipated it. This is both a doc miss AND a missing test gate.
- **Patch sketch:**
  ```diff
  -- **Subcommand contracts stable within a minor.** `ogdb serve --http :8080` will keep meaning the same thing in any `0.4.*` patch release.
  -- **`--help`-reachable flags stable across `0.4.*`.** Flags may be added in patches; existing flags do not change name, short form, or behavior.
  +- **Subcommand contracts stable within a minor.** `ogdb serve --http :8080` will keep meaning the same thing in any `0.5.*` patch release (and in any future `0.N.*`).
  +- **`--help`-reachable flags stable across the active minor (`0.5.*`).** Flags may be added in patches; existing flags do not change name, short form, or behavior across the same minor.
  ```
  Then ship `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` (mirror the v0.4.0 test) so the L44 promise becomes real.

---

### F11 — MEDIUM — `documentation/ai-integration/llm-to-cypher.md` cites "0.4.0" twice

- **Location:** `documentation/ai-integration/llm-to-cypher.md:17`
- **Problem:** Body says "There is no `db.schema_summary()` method in 0.4.0 — earlier drafts of this page cited a name that was never shipped." Method `Database::schema_catalog()` exists in current code (verified at `crates/ogdb-core/src/lib.rs:8594, 9285, 12097`); the negative claim is still true. But the version stamp is two minors stale; a reader on 0.5.1 sees "0.4.0" and wonders if the situation changed in 0.5.x.
- **Patch sketch:** `s/in 0\.4\.0/in 0\.5\.1 (and was never shipped in any earlier release)/` — keeps the historical warning while making the version stamp current.

---

### F12 — MEDIUM — `ARCHITECTURE.md` aspirational "v0.5.1 follow-up" now points at the current version

- **Location:** `ARCHITECTURE.md:176`
- **Problem:** "True incremental insert (vs. the current full rebuild on `embedding`-touching commits) is tracked as a v0.5.1 backend-swap follow-up" — but we ARE at v0.5.1 and it has not shipped (the v0.5.0 + v0.5.1 changelog "Added" sections list no `usearch` / `hnsw_rs` swap). Stale aspirational target now describes the current version. `documentation/BENCHMARKS.md` has the same pattern at the row-6 mutation-p99 caveat.
- **Patch sketch:** Bump the target to `v0.6.0` (the next minor): `s/v0\.5\.1 backend-swap follow-up/v0\.6\.0 backend-swap follow-up/`. Same fix applies anywhere "v0.5.1 follow-up" appears as a forward-looking marker (BENCHMARKS row 6, DESIGN.md L2153 already correctly says "v0.5.1 backend-swap candidates" but should also bump).

---

### F13 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md` "post-v0.5 minor" target now ambiguous

- **Location:** `documentation/SECURITY-FOLLOWUPS.md:19-21`
- **Problem:** "Target: post-v0.5 minor" and "Release-notes wording for v0.5:" — when written, "v0.5" was a future target. Now that v0.5.0 + v0.5.1 are out and the pyo3 0.21 → 0.24 migration was NOT included, the doc reads ambiguously: did the wording-for-v0.5 ship? If it did, where? (Looking at CHANGELOG.md `[0.5.1]` body: no `pyo3` mention.) Either the doc target slipped, or the wording was supposed to land in a v0.5.x release-notes section that doesn't exist (see also F08: there's no `[0.5.0]` section at all).
- **Patch sketch:** Change "Target: post-v0.5 minor" → "Target: v0.6 minor (slipped from original v0.5 target — pyo3 binding migration was not in scope for the 0.4.0 → 0.5.x line)." Add the actual ship-status: "Status as of 2026-05-05: ignore still in `deny.toml`, pyo3 still at 0.21." Same for the "Release-notes wording for v0.5" sentence — change to "Release-notes wording when shipped".

---

### F14 — MEDIUM — Cookbook claim "every HTTP snippet … is exercised" misses the `AT TIME` `POST /query`

- **Location:** `documentation/COOKBOOK.md:3-5` (the claim) vs `documentation/COOKBOOK.md:271-275` (the snippet) and `frontend/e2e/cookbook-snippets-runnable.spec.ts:240-252` (the recipe-4 test that only covers `temporal_diff`)
- **Problem:** Recipe 4 has TWO HTTP snippets — `POST /mcp/invoke` for `temporal_diff` (covered, line 240) and `POST /query` with `MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b` (line 271 of cookbook, NOT covered). The cookbook front-matter promises "Every HTTP snippet on this page is exercised by `frontend/e2e/cookbook-snippets-runnable.spec.ts` on every PR, so the docs cannot silently rot away from the running binary." Recipe-4 second snippet violates that.
- **Patch sketch:** Add a third recipe-4 test:
  ```ts
  test('recipe 4: POST /query with AT TIME returns 200', async () => {
    readCookbook()
    const { status } = await postJson('/query', {
      query: 'MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b',
    })
    expect(status).toBe(200)
  })
  ```
  Or, if the AT-TIME snippet is intentionally illustrative-only, weaken the front-matter claim from "Every HTTP snippet … is exercised" → "Every HTTP snippet that does not depend on a specific historical timestamp is exercised."

---

### F15 — MEDIUM — `docs/evaluation-runs/history.jsonl` cites non-existent `docs/BENCHMARKS.md`

- **Location:** `docs/evaluation-runs/history.jsonl` lines 8, 23, 38, 53, 68, 83 (and the comment field of every `ai_agent-hybrid_retrieval-*` row)
- **Problem:** Each row's `notes` field reads `…NDCG@10 DEFERRED: no BEIR corpus in-tree — see docs/BENCHMARKS.md`. `docs/BENCHMARKS.md` does not exist; the file lives at `documentation/BENCHMARKS.md`. (CHANGELOG.md:71 has the same `docs/BENCHMARKS.md` typo in the v0.4.0 retrospective bullet.) Also, both `docs/evaluation-runs/` (containing only `history.jsonl`) and `documentation/evaluation-runs/` (containing the `baseline-*.json` set) coexist — the docs/ tree has one orphan file while the active baselines moved to documentation/. Same issue: a doc/documentation tree-split that confuses anyone walking the eval data.
- **Patch sketch:** Either (a) rewrite the `notes` field in `history.jsonl` to point at `documentation/BENCHMARKS.md` (sed across all rows), or (b) move `docs/evaluation-runs/history.jsonl` to `documentation/evaluation-runs/history.jsonl` and remove the docs/evaluation-runs/ subtree. Fix CHANGELOG.md:71 in the same pass: `s|docs/BENCHMARKS\.md|documentation/BENCHMARKS.md|g` and `s|docs/evaluation-runs/baseline-2026-04-25\.json|documentation/evaluation-runs/baseline-2026-04-25.json|g`.

---

### F16 — MEDIUM — `[Unreleased]` placeholder bullet is technically a non-entry

- **Location:** `CHANGELOG.md:10` and `scripts/workflow-check.sh:31-44` (the gate)
- **Problem:** AGENTS.md:13 reads "Every completed change must have an entry in `Unreleased`." The post-v0.5.1 BENCHMARKS bump (commit `aff476f`, the only commit since v0.5.1) is a docs-only change with NO matching `[Unreleased]` bullet. The gate `scripts/workflow-check.sh` accepts the placeholder `- _(No entries yet — track ongoing work in PR drafts; see [0.5.1] below for the latest shipped surface.)_` as the required ≥1 bullet — its layer-1 check only counts lines starting with `- ` regardless of content, and its layer-2 check only fires for `feat(` commits (the BENCHMARKS bump is `docs(`). So the gate passes by exploiting a placeholder, not because the rule is satisfied.
- **Patch sketch:** Add an Unreleased bullet for the BENCHMARKS headline-bump in the same commit that bumped it:
  ```diff
  -- _(No entries yet — track ongoing work in PR drafts; see [0.5.1] below for the latest shipped surface.)_
  +- `documentation/BENCHMARKS.md` (commit `aff476f`): headline + scope sentence bumped 0.4.0 → 0.5.1; added a 2026-05-05 patch-release note explaining that the 0.4.0 → 0.5.0 → 0.5.1 window carries zero perf-relevant code changes and the 0.4.0 N=5 medians remain authoritative; re-baseline tracked as a v0.6.0 follow-up.
  ```
  Optionally tighten `scripts/workflow-check.sh` Layer-1 to reject the literal `(No entries yet` placeholder, so the gate enforces the AGENTS rule for non-`feat(` commits too.

---

### F17 — LOW — `documentation/BENCHMARKS.md` body still calls itself the "0.4.0 sheet"

- **Location:** `documentation/BENCHMARKS.md:36, 64, 79`
- **Problem:** L1 was bumped to "OpenGraphDB 0.5.1 — Competitive Benchmark Baseline" (commit `aff476f`), and the patch-release note at L3 explains the carry-forward. But L36 still reads "This document is the public competitive-comparison sheet for OpenGraphDB 0.4.0", L64 still says "OpenGraphDB version: 0.4.0", and the L79 row table header is "OpenGraphDB 0.4.0". The L1+L3 framing is correct; the body section headers were not swept along. Reader-impact is low (top-of-doc note covers the gap), but inconsistency is a doc-rot smell.
- **Patch sketch:** `s/OpenGraphDB 0\.4\.0/OpenGraphDB 0.5.1/` on the three body lines, plus a parenthetical "(numbers carried forward from 0.4.0 N=5 medianed baseline; see top-of-doc patch-release note)" on the row-table header.

---

### F18 — LOW — `IMPLEMENTATION-READY.md` cites BENCHMARKS at "0.4.0 N=5 median" — should refresh to 0.5.1 carry-forward

- **Location:** `IMPLEMENTATION-READY.md:80-91, 128`
- **Problem:** Doc is correctly marked "historical" at L3 (great), but the `Reference benchmark` block (L80-91) still says "superseded by `ogdb-eval` in 0.4.0 … 0.4.0 N=5 median + warm-up driver methodology" and L128 says "since superseded by `documentation/BENCHMARKS.md` per CHANGELOG 0.4.0". These references to 0.4.0 are technically correct (those changes shipped in 0.4.0), but a reader on 0.5.1 sees "0.4.0" and wonders if the methodology changed since.
- **Patch sketch:** No content change needed if the doc is truly historical. If keeping current, add a parenthetical: "(0.4.0 N=5 median + warm-up driver methodology, carried forward unchanged through 0.5.1)".

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 1     | F01 |
| HIGH     | 9     | F02, F03, F04, F05, F06, F07, F08, F09, F10 |
| MEDIUM   | 6     | F11, F12, F13, F14, F15, F16 |
| LOW      | 2     | F17, F18 |

**Headline:** the v0.5.0 → v0.5.1 release shipped a real binary but the documentation surface around it (SECURITY policy, SPEC version stamp, frontend hero, master skill bundle, CHANGELOG section split, COMPATIBILITY upgrade fixture, contributor coverage threshold) was not swept along with the version bump. F01 is a BLOCKER because the SECURITY policy as written declares the current shipped line *unsupported* — the most consequential possible reader misdirection in any doc in this tree. F03 is doubly load-bearing because the regression test pins the wrong version, locking the drift in.

**Process recommendation (out of scope of this report but worth flagging):** the v0.5.x release runbook needs a doc-sweep checklist that touches: SECURITY.md table, SPEC.md header, HeroSection.tsx + its e2e pins, skills/opengraphdb/SKILL.md + references/, CONTRIBUTING.md ratchet line, COMPATIBILITY.md examples, the upgrade-fixture file, and the CHANGELOG section split + footer. F08 specifically is a missing release-runbook step: every tag should get its own CHANGELOG section before the next tag is cut.
