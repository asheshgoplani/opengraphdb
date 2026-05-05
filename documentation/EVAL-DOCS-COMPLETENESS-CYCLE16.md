# EVAL-DOCS-COMPLETENESS-CYCLE16

- **Workspace HEAD:** `8496878` (origin/main, post cycle-15 16-commit convergence — 1B + 9H + 6M + 2L all closed Phase-1 + Phase-2)
- **Worktree:** `/tmp/wt-c16-docs` (detached off origin/main)
- **Reviewer scope:** NEW drift introduced by cycle-15's 16 fix commits — orphan refs, stale anchors, version-stamp drift across the freshly-bumped 0.5.1 surface, README install consistency, AGENTS/CONTRIBUTING/SECURITY freshness, cookbook recipe runnability, frontend / npm-package GitHub URLs vs git remote.
- **Prior cycle report:** `git show origin/eval/c15-docs-aff476f:documentation/EVAL-DOCS-COMPLETENESS-CYCLE15.md` — 1 BLOCKER (F01) + 9 HIGH (F02–F10) + 6 MED (F11–F16) + 2 LOW (F17–F18); convergence cascade landed in commits `01b2554` → `8496878`.

## Methodology

In-tree gates first (every one passes; this report enumerates drift the gates do not yet cover):

- `bash scripts/check-public-doc-tmp-leak.sh` → 0 hits
- `bash scripts/check-design-vs-impl.sh` → 0 hits
- `bash scripts/workflow-check.sh` → 0 hits (post-`8496878` placeholder rejection too)
- `bash scripts/check-changelog-tags.sh` → 0 hits
- `bash scripts/check-benchmarks-version.sh` → "ok (0.5.1; headline + § 2 column header agree)"
- `bash scripts/check-contributing-coverage-claim.sh` → 0 hits
- `bash scripts/check-security-supported-version.sh` → "ok (0.5.1 → 0.5.x supported)"
- `bash scripts/check-skills-copilot-removed.sh` → 0 hits (gate scope is `skills/README.md` + `skills/src/install.ts` only — see F01 + F09)
- `bash scripts/check-doc-anchors.sh` → 0 hits
- `bash scripts/check-doc-rust-blocks.sh` → "OK — all extracted runnable blocks compile"
- `bash scripts/check-shipped-doc-coverage.sh` → "OK"
- `bash scripts/check-binding-readmes.sh` → "ok"
- `bash scripts/changelog-check.sh` → 0 hits

Then audited:

- `git grep` for `/Users/ashesh` and `/home/ashesh-goplani` → 0 hits (clean)
- `git grep -nE '/tmp/wt-'` → 1 hit, `frontend/e2e/qa-followups.spec.ts:3` (F10)
- `git grep` for `0.4.x` / `0.3.x` / `0.2.0` / `0.1.x` literals across `*.md` after excluding historical CHANGELOG bodies and cycle-15 patch-release framing
- `git grep` for `copilot` across all tracked files → 5 surfaces (skills/, mcp/, scripts/) cross-checked against the post-cycle-15 SKILL.md compatibility metadata (six agents, no copilot)
- `git remote get-url origin` (`asheshgoplani/opengraphdb`) cross-checked against every `github.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+` URL in tracked `*.md` / `*.json` / `*.toml` (excluding sponsorship URLs and upstream third-party project links)
- `documentation/COMPATIBILITY.md` prose vs. the v0.5.0 fixture file added by cycle-15 commit `c904418` (`crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs`)
- README install command vs `scripts/install.sh` env-resolver vs `.github/workflows/release.yml` install-asset upload (consistent — no finding)
- Cookbook front-matter "every HTTP snippet is exercised" claim vs `frontend/e2e/cookbook-snippets-runnable.spec.ts` test list (cycle-15 F14 fix verified — recipe-4 `AT TIME` is now covered at line 254)
- Frontend GitHub URLs (HeroSection, ClaimsPage, DocPage, LandingNav, DisconnectedState) vs `git remote get-url origin` (consistent — no finding)

## Findings

### F01 — HIGH — `skills/package.json` description + keywords still advertise Copilot; drifts from cycle-15 d4bda6f Copilot-removal sweep

- **Location:** `skills/package.json:4` (description) + `skills/package.json:17` (keywords)
- **Problem:** Cycle-15 commit `d4bda6f docs(skills): drop copilot from npm package surface to match SKILL.md compatibility metadata` swept `skills/README.md` and `skills/src/install.ts` to drop the Copilot install arm, and added `scripts/check-skills-copilot-removed.sh` as a regression gate. **But the gate's `PATHS=(skills/README.md skills/src/install.ts)` array did not include `skills/package.json`** — and that file still ships:

  ```json
  "description": "AI coding skills for OpenGraphDB — install expert graph database knowledge into Claude Code, Cursor, Copilot, and Codex",
  ...
  "keywords": ["opengraphdb", "skills", "ai", "cypher", "graph-database", "claude", "copilot", "cursor", "codex", "mcp"],
  ```

  This is the **most user-visible surface in the npm bundle** — npmjs.com renders the `description` directly in package search results and the `keywords` drive npm-search match. After `npm publish`, every search hit for `@opengraphdb/skills` will carry the Copilot promise that the underlying skill bundle's compatibility metadata (`skills/opengraphdb/SKILL.md:19` `agents: [claude-code, cursor, continue.dev, aider, goose, codex]` — no Copilot) explicitly disclaims. Same drift cycle-15 F06 caught between README and SKILL.md; the partial fix only swept two of the four surfaces.
- **Patch sketch:**
  ```diff
  -  "description": "AI coding skills for OpenGraphDB — install expert graph database knowledge into Claude Code, Cursor, Copilot, and Codex",
  +  "description": "AI coding skills for OpenGraphDB — install expert graph database knowledge into Claude Code, Cursor, Continue.dev, Aider, Goose, and Codex",
  ...
  -  "keywords": ["opengraphdb", "skills", "ai", "cypher", "graph-database", "claude", "copilot", "cursor", "codex", "mcp"],
  +  "keywords": ["opengraphdb", "skills", "ai", "cypher", "graph-database", "claude", "cursor", "codex", "aider", "goose", "continue", "mcp"],
  ```
  Then extend `scripts/check-skills-copilot-removed.sh` `PATHS` array to include `skills/package.json` and `skills/src/index.ts` (see F09): `PATHS=(skills/README.md skills/src/install.ts skills/package.json skills/src/index.ts)`.

---

### F02 — HIGH — `skills/package.json` + `mcp/package.json` GitHub URLs point at `github.com/openGraphDB/openGraphDB` (wrong org); git remote is `asheshgoplani/opengraphdb`

- **Location:** `skills/package.json:20-21, 30` and `mcp/package.json:20-21, 34`
- **Problem:** Both npm packages declare:
  ```json
  "homepage": "https://github.com/openGraphDB/openGraphDB/tree/main/skills",
  "bugs": "https://github.com/openGraphDB/openGraphDB/issues",
  ...
  "repository": { "type": "git", "url": "https://github.com/openGraphDB/openGraphDB", "directory": "skills" }
  ```
  The actual remote is `git@github.com:asheshgoplani/opengraphdb.git` (verified: `git remote get-url origin`). The fictitious `github.com/openGraphDB/openGraphDB` repo does not exist (case-sensitive 404); after npm publishes, every "View Repository" / "Issues" / "Homepage" link on npmjs.com sends a user to a non-existent page. Cycle-15 explicitly verified frontend GitHub URLs (`HeroSection.tsx`, `ClaimsPage.tsx`, `DocPage.tsx`, `LandingNav.tsx`, `DisconnectedState.tsx`) match `asheshgoplani/opengraphdb` and reported "consistent" (cycle-15 report L21–22), but did not extend the audit to the two npm packages — and these are the two surfaces the public-facing npm registry actually publishes.

  Workspace `Cargo.toml:34-35` already has the right values (`repository = "https://github.com/asheshgoplani/opengraphdb"`, `homepage = "https://github.com/asheshgoplani/opengraphdb"`); the npm packages just drifted on their own copy.
- **Patch sketch:**
  ```diff
   // skills/package.json
  -  "homepage": "https://github.com/openGraphDB/openGraphDB/tree/main/skills",
  -  "bugs": "https://github.com/openGraphDB/openGraphDB/issues",
  +  "homepage": "https://github.com/asheshgoplani/opengraphdb/tree/main/skills",
  +  "bugs": "https://github.com/asheshgoplani/opengraphdb/issues",
  ...
  -    "url": "https://github.com/openGraphDB/openGraphDB",
  +    "url": "https://github.com/asheshgoplani/opengraphdb",
  ```
  Identical fix in `mcp/package.json:20-21, 34`. Add a regression gate `scripts/check-npm-package-github-url.sh` that asserts every `*/package.json` `repository.url` / `homepage` / `bugs` matches `git config --get remote.origin.url | sed -E 's@.*[:/]([^/]+/[^/.]+)(\.git)?$@https://github.com/\1@'`.

---

### F03 — MEDIUM — `documentation/COMPATIBILITY.md:44` still says "Future releases add a v0.5.0 fixture beside it"; cycle-15 added the fixture but left the prose forward-looking

- **Location:** `documentation/COMPATIBILITY.md:44`
- **Problem:** Cycle-15 F10 fix landed two parallel changes in commit `c904418`: (a) the policy doc's CLI examples were bumped from `0.4.*` → `0.5.*` (correct), and (b) the new file `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` was created to fulfill the "v0.5.0 fixture promise" (correct). But the doc prose at L44 still reads:

  > Upgrade test gate: `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` ships a checked-in v0.4.0 fixture and asserts the current binary opens it. Any format-version bump that breaks readability fails this test in CI. **Future releases add a v0.5.0 fixture beside it**; the test scaffold is designed to grow.

  The "Future releases add a v0.5.0 fixture beside it" sentence is now stale — the v0.5.0 fixture *has been added* (verified: `ls crates/ogdb-core/tests/upgrade_fixture_*` shows both files, and the v0.5.0 file's module doc explicitly says "This test fulfills that promise"). A reader on 0.5.1 sees the prose and wonders whether the v0.5.0 fixture exists; only by grepping the source tree will they confirm.
- **Patch sketch:**
  ```diff
  -- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` ships a checked-in v0.4.0 fixture and asserts the current binary opens it. Any format-version bump that breaks readability fails this test in CI. Future releases add a v0.5.0 fixture beside it; the test scaffold is designed to grow.
  +- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` and `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` ship checked-in v0.4.0 and v0.5.0 fixtures respectively and assert the current binary opens each. The v0.5.0 fixture is byte-identical to v0.4.0 because the five `*_FORMAT_VERSION` constants did not bump in the 0.4 → 0.5 window — the test scaffold remains in place to lock in policy. Any format-version bump that breaks readability fails this test in CI. Future releases (v0.6.x) add a v0.6.0 fixture beside it; the scaffold grows with each minor.
  ```

---

### F04 — MEDIUM — `documentation/COMPATIBILITY.md:94` release-time enforcement runbook lists only the v0.4.0 fixture test; v0.5.0 fixture not enumerated

- **Location:** `documentation/COMPATIBILITY.md:94` (§ 6 Release-time enforcement)
- **Problem:** § 6 declares "Every `v*` tag must" pass three explicit checks, including:

  > 3. Pass `cargo test -p ogdb-core --test upgrade_fixture_v0_4_0_opens_on_current` — the v0.4.0 baseline fixture still opens (Finding 12, this document).

  The matching v0.5.0 fixture test added by cycle-15 (`upgrade_fixture_v0_5_0_opens_on_current`) is **not** in this enforcement checklist. The `0.4.0` test alone is no longer sufficient for the policy stated at L40 ("the current binary continuing to read old format versions") — once the fixture-set grows, the runbook should require running every fixture test, not just the oldest one.
- **Patch sketch:**
  ```diff
  -3. Pass `cargo test -p ogdb-core --test upgrade_fixture_v0_4_0_opens_on_current` — the v0.4.0 baseline fixture still opens (Finding 12, this document).
  +3. Pass `cargo test -p ogdb-core --test 'upgrade_fixture_v0_*_opens_on_current'` — every checked-in upgrade fixture (currently `v0.4.0` and `v0.5.0`) still opens on the current binary. New minor releases add a `v0.X.0` fixture and add it to this gate (Finding 12, this document).
  ```
  Wire a regression check in `scripts/check-design-vs-impl.sh`: `git grep -l upgrade_fixture_v0_ crates/ogdb-core/tests | wc -l` should equal the number of `upgrade_fixture_v0_` entries enumerated in `documentation/COMPATIBILITY.md` § 6.

---

### F05 — MEDIUM — `documentation/COMPATIBILITY.md:3` doc-level stamp says "active as of v0.4.0 · 2026-05-01"; cycle-15 edited the doc body to bump 0.4.* → 0.5.* but did not refresh the stamp

- **Location:** `documentation/COMPATIBILITY.md:3`
- **Problem:** The header reads `**Status:** active as of v0.4.0 · 2026-05-01`. Cycle-15 commit `c904418` ("fix(compat): bump CLI stability examples to 0.5.\* + add v0.5.0 upgrade-fixture test") advanced the body of L54-55 to `0.5.*` but did not bump the header stamp. A contributor opening the doc today reads "active as of v0.4.0" and may assume the policy applies up to but not including v0.5.x — even though the body of § 3 explicitly governs `0.5.*`. Same class of stale-stamp drift cycle-15 F02 caught for `SPEC.md:5` (`Version: 0.3.0` → `0.5.1`).
- **Patch sketch:**
  ```diff
  -**Status:** active as of v0.4.0 · 2026-05-01
  +**Status:** active as of v0.5.1 · 2026-05-05 (last reviewed cycle-16; cycle-15 c904418 advanced § 3 examples 0.4.* → 0.5.* + added v0.5.0 upgrade-fixture)
  ```

---

### F06 — MEDIUM — `CHANGELOG.md:96-97` `[0.4.0] ### Added` references `docs/COOKBOOK.md` and `docs/MIGRATION-FROM-NEO4J.md`; cycle-15 commit `8496878` "fix docs/→documentation/ path refs" missed these

- **Location:** `CHANGELOG.md:96` and `CHANGELOG.md:97` (inside `[0.4.0]` `### Added`)
- **Problem:** Cycle-15 commit `8496878 fix(changelog): split [0.5.0]+[0.5.1], fix docs/→documentation/ path refs, real Unreleased bullets` explicitly advertised "fix docs/→documentation/ path refs" as scope. It corrected the `docs/BENCHMARKS.md` typo in the [0.4.0] retrospective and in `docs/evaluation-runs/history.jsonl` row notes — but missed **two adjacent bullets in the same `[0.4.0]` section**:

  ```
  L96: - `docs/COOKBOOK.md` — 7 runnable AI-agent recipes; backed by `frontend/e2e/...`
  L97: - `docs/MIGRATION-FROM-NEO4J.md` — 5-min honesty-first migration guide; backed by ...
  ```

  These files now live at `documentation/COOKBOOK.md` and `documentation/MIGRATION-FROM-NEO4J.md` (verified: `ls documentation/`). The same `[0.4.0]` `### Changed` block at L86 explicitly documents the move ("user-facing docs … moved from `docs/` to a new `documentation/` folder"). A reader following the L96/L97 references gets a 404 on the current tree.

  Note: L107 (`docs/IMPLEMENTATION-LOG.md`, `docs/TDD-METHODOLOGY.md`, `docs/VERSIONING.md`) is correct — those three files do still live at `docs/` (verified: `ls docs/`), so this finding is scoped to L96-97 only.
- **Patch sketch:**
  ```diff
  -- `docs/COOKBOOK.md` — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts` running every documented snippet (curl + Python + Node) against a live `target/release/ogdb serve --http` to catch API drift in `/mcp/invoke`, `/rag/search`, `/query`.
  -- `docs/MIGRATION-FROM-NEO4J.md` — 5-min honesty-first migration guide; backed by `frontend/e2e/migration-guide-snippets.spec.ts` running every Cypher + curl snippet against a live backend (covers LABEL syntax, `id()` function, `CREATE INDEX`, vector search, `/query` shape).
  +- `docs/COOKBOOK.md` (now at `documentation/COOKBOOK.md` after the v0.4.0 docs/ → documentation/ move; see § Changed above) — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts` running every documented snippet (curl + Python + Node) against a live `target/release/ogdb serve --http` to catch API drift in `/mcp/invoke`, `/rag/search`, `/query`.
  +- `docs/MIGRATION-FROM-NEO4J.md` (now at `documentation/MIGRATION-FROM-NEO4J.md` after the v0.4.0 docs/ → documentation/ move) — 5-min honesty-first migration guide; backed by `frontend/e2e/migration-guide-snippets.spec.ts` running every Cypher + curl snippet against a live backend (covers LABEL syntax, `id()` function, `CREATE INDEX`, vector search, `/query` shape).
  ```
  Or — cleaner — add a regression gate to `scripts/check-doc-anchors.sh`: every `(docs|documentation)/[A-Z][^[:space:]]+\.md` reference in `CHANGELOG.md` must resolve to a real file at the current path (`[[ -f $cite ]]`), with explicit `(now at …)` allow-listing for moves the same release.

---

### F07 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md:26` release-notes wording "tracked as a post-v0.5 task" is now ambiguous

- **Location:** `documentation/SECURITY-FOLLOWUPS.md:26` (inside the `> Release-notes wording when shipped:` blockquote)
- **Problem:** Cycle-15 F13 (`812068f`) bumped the action-item line above to `Target: v0.6 minor (slipped from original v0.5 target — pyo3 binding migration was not in scope for the 0.4.0 → 0.5.x line).` That fix is correct. **But the canned release-notes prose two lines below still reads:**

  > A pyo3 0.24 migration is tracked as a post-v0.5 task.

  That prose is what would ship in the v0.6 release notes if the migration lands. "post-v0.5" is now ambiguous — v0.5.0 and v0.5.1 are post-v0.5 too (and they shipped without the migration). The whole point of cycle-15 F13's renaming was to disambiguate; the canned wording was missed.
- **Patch sketch:**
  ```diff
  -  > default. A pyo3 0.24 migration is tracked as a post-v0.5 task. If you
  +  > default. A pyo3 0.24 migration is tracked as a v0.6.0 task (slipped from
  +  > the original v0.5 target — pyo3 0.21 → 0.24 is a major API migration that
  +  > the 0.4.0 → 0.5.x development window did not include). If you
  ```

---

### F08 — MEDIUM — Three forward-looking "v0.5 follow-up" stamps in COMPATIBILITY / SPEC / DESIGN are now stale (Bolt v4/v5 negotiation)

- **Location:** `documentation/COMPATIBILITY.md:67`, `SPEC.md:634`, `DESIGN.md:1628`
- **Problem:** Same forward-looking-target-now-current pattern cycle-15 F12 fixed for the HNSW `usearch`/`hnsw_rs` backend swap (which was bumped from "v0.5.1 follow-up" → "v0.6.0 follow-up" in commit `ca82055`). Three other docs still carry the same "v0.5 follow-up" stamp for **Bolt v4/v5 negotiation**, and v0.5.x has shipped without the negotiation:

  ```
  documentation/COMPATIBILITY.md:67  v4 / v5 negotiation is tracked as a v0.5 follow-up
  SPEC.md:634                        Bolt v1 protocol compatibility (v4/v5 negotiation is a v0.5 follow-up)
  DESIGN.md:1628                     v4/v5 negotiation is a v0.5 follow-up tracked
  ```

  Verified: `crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1` is still the only declared version, and the `[0.5.0]` + `[0.5.1]` CHANGELOG sections list no Bolt-protocol additions. The follow-up slipped — same fix as cycle-15 F12.
- **Patch sketch:** `s/v0\.5 follow-up/v0.6.0 follow-up (slipped from v0.5)/` on all three files. Wire a regression gate that asserts no `v0\.X follow-up` (where X is `<= current_minor`) survives in `documentation/`, `SPEC.md`, `DESIGN.md`, `ARCHITECTURE.md` — extending the cycle-15 F12 spirit beyond the single ARCHITECTURE.md surface.

---

### F09 — LOW — `skills/src/index.ts:10, 23` still print "copilot" as a valid platform; gate scope too narrow

- **Location:** `skills/src/index.ts:10` (code comment) and `skills/src/index.ts:23` (printed help string)
- **Problem:** The npm package's CLI entrypoint still says:

  ```typescript
  const platform = args[1]; // optional: claude, cursor, copilot, codex, or auto-detect
  ...
  console.log("Platforms: claude, cursor, copilot, codex (auto-detected if omitted)");
  ```

  L23 is **printed verbatim** to a user running `npx @opengraphdb/skills list` — they'll read "copilot" as a valid platform, then `npx @opengraphdb/skills install copilot` will fail because cycle-15 commit `d4bda6f` removed the `"copilot"` arm from `install.ts`. The user-facing failure mode is "the docs lie" — exactly what cycle-15 F06 was supposed to close. The gate `scripts/check-skills-copilot-removed.sh` only checks `skills/README.md` + `skills/src/install.ts`; this index.ts surface slipped through.
- **Patch sketch:**
  ```diff
  -  const platform = args[1]; // optional: claude, cursor, copilot, codex, or auto-detect
  +  const platform = args[1]; // optional: claude, cursor, codex, or auto-detect (six-agent set; see skills/opengraphdb/SKILL.md compatibility metadata)
  ...
  -  console.log("Platforms: claude, cursor, copilot, codex (auto-detected if omitted)");
  +  console.log("Platforms: claude, cursor, codex, aider, goose, continue (auto-detected if omitted)");
  ```
  And widen the gate (see F01 patch sketch) to `PATHS=(skills/README.md skills/src/install.ts skills/package.json skills/src/index.ts)`.

---

### F10 — LOW — `frontend/e2e/qa-followups.spec.ts:3` cites a private `/tmp/wt-frontend-qa/QA-REPORT.md` scratch path

- **Location:** `frontend/e2e/qa-followups.spec.ts:3` (top-of-file docblock)
- **Problem:** The test file's docstring reads:

  ```typescript
  /**
   * qa-followups.spec.ts — regression gates for the QA bugs found in the
   * 2026-04-30 frontend audit (/tmp/wt-frontend-qa/QA-REPORT.md).
   ...
  ```

  `/tmp/wt-frontend-qa/QA-REPORT.md` is a private scratch-worktree path on the original author's machine — same class of leak the public-doc-tmp-leak gate (`scripts/check-public-doc-tmp-leak.sh`) prevents in `documentation/` / `README.md` / etc. The gate's scope deliberately excludes `frontend/` (per L7: `SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)`), but the leak is still a tracked file with a path that returns 404 for any reader who isn't the author. Reader-impact is bounded (only contributors who open the test file and try to follow the link), hence LOW.
- **Patch sketch:** Either (a) drop the path-citation and replace with a self-contained summary of the audit, mirroring how the cycle-15 cleanup commits handled stale planning-doc references; (b) move the audit report into a tracked location (e.g., `documentation/audits/2026-04-30-frontend-qa.md`) and point the docstring there; or (c) extend the public-doc-tmp-leak gate to cover `frontend/e2e/` as well, since e2e specs are repository-tracked artifacts that ship with the source.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 2     | F01, F02 |
| MEDIUM   | 6     | F03, F04, F05, F06, F07, F08 |
| LOW      | 2     | F09, F10 |

**Headline:** cycle-15's 16-commit cascade closed all 18 prior findings (1B + 9H + 6M + 2L) but introduced two recurring failure modes worth flagging:

1. **Gate scope too narrow.** Cycle-15's regression gates pin specific files (`scripts/check-skills-copilot-removed.sh` covers `skills/README.md` + `skills/src/install.ts` only). The same drift class then survives in adjacent unaudited files — `skills/package.json` description + keywords (F01), `skills/src/index.ts` help output (F09). The gate's PATHS array needs to grow with the surface.

2. **Partial sweeps leave forward-looking prose stale.** Where cycle-15 fixed an *action item* (e.g., the v0.5.0 fixture file in F03+F04, or the SECURITY-FOLLOWUPS target in F07), the *prose advertising the action item as future* was left intact and is now contradictory. The same pattern shows up in F08 (Bolt v4/v5 still "v0.5 follow-up" in three files) — cycle-15 F12 fixed the HNSW backend swap to "v0.6.0" but did not extend to the Bolt surface.

**Process recommendation:** when fixing a forward-looking target ("v0.X follow-up", "Future releases will…"), the sweep should be `git grep "v0\.X follow-up\|Future releases\|Target: post-v0\.X"` across all docs, not just the file the original finding cited. And when adding a regression gate, the PATHS array should be derived from a `git grep` of the offending pattern, not hand-listed against the proximate finding.

**No BLOCKERs and no remaining policy contradictions** — the SECURITY supported-version policy, SPEC version stamp, frontend hero, master skill bundle, CHANGELOG section split, COMPATIBILITY upgrade fixture, contributor coverage threshold, and cookbook recipe coverage are all correctly converged. The cycle-16 findings are residual sweep gaps and forward-looking-prose drift, not new structural failures.
