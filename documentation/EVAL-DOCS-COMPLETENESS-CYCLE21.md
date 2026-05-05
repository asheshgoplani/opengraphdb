# EVAL-DOCS-COMPLETENESS-CYCLE21

- **Workspace HEAD:** `cfb3d40` (origin/main, post cycle-20's two-commit fix-set: `6108439` skills mirror full sweep — finished propagating cycle-19 perf-row updates into the skill bundle, bumped the skill measurement-date stamp 2026-04-25 → 2026-05-02, and tightened `scripts/check-benchmarks-vocabulary-mirror.sh` to case-insensitive matching; `cfb3d40` shipped `documentation/CLI.md` as the canonical CLI reference and widened `crates/ogdb-cli/tests/readme_cli_listing.rs` to scan the union of README + CLI.md + QUICKSTART + COOKBOOK + MIGRATION-FROM-NEO4J).
- **Worktree:** a fresh detached worktree off `origin/main`.
- **Reviewer scope:** the cycle-21 prompt frames this as the second clean-on-HIGH round in a row (cycle-20 closed all three cycle-19 HIGHs and added zero new HIGHs); cycle-21 0B+0H = CONVERGED on the partial-sweep arc that ran cycle-15 → cycle-19. Specifically:
  1. Audit the two cycle-20 commits (`6108439`, `cfb3d40`) for new drift introduced by the cycle-20 fixes themselves.
  2. Anchor consistency on the brand-new `documentation/CLI.md` (heading layout, link targets, source-file anchors).
  3. Scope of the cycle-20 vocab-gate tightening (`-i` flag) — does the red-green meta-test actually exercise the lowercase-variant case?
  4. Drift between `documentation/CLI.md` and the actual `ogdb --help` output (the `Commands` enum's `about` strings, the per-subcommand flag surface).
  5. Re-status the cycle-20 carry-forward MEDIUMs (F01, F04, F05, F06, F07) and LOWs (F03, F08, F09).
- **Prior cycle report:** `git show origin/eval/c20-docs-fb0ec7a:documentation/EVAL-DOCS-COMPLETENESS-CYCLE20.md` — 0B + 0H + 6M + 3L. The MEDIUMs and LOWs are unchanged because cycle-20 only addressed the BENCHMARKS-mirror sweep + CLI listing simplification, not the carry-forward queue.

## Methodology

Every shipped gate passes:

- `bash scripts/check-public-doc-tmp-leak.sh` → exit 0.
- `bash scripts/check-design-vs-impl.sh` → exit 0.
- `bash scripts/workflow-check.sh` → exit 0.
- `bash scripts/check-changelog-tags.sh` → 0 hits.
- `bash scripts/check-benchmarks-version.sh` → workspace 0.5.1 matches headline + § 2 column header.
- `bash scripts/check-followup-target-not-current.sh` → "ok (workspace=0.5.1; all 'vX.Y follow-up' tokens name a future minor)".
- `bash scripts/check-changelog-paths.sh` → "ok (13 unique doc paths checked; all resolve or whitelisted)".
- `bash scripts/check-doc-anchors.sh` → exit 0 (every `crates/.../lib.rs::<symbol>` anchor in user-facing docs resolves; the new `crates/ogdb-cli/src/lib.rs::Commands` anchor in `documentation/CLI.md:5` resolves to the `enum Commands` declaration in `crates/ogdb-cli/src/lib.rs::Commands`).
- `bash scripts/check-shipped-doc-coverage.sh` → "OK".
- `bash scripts/check-binding-readmes.sh` → "ok".
- `bash scripts/check-skills-copilot-removed.sh` → exit 0.
- `bash scripts/test-all-check-scripts-wired.sh` → "ok (every scripts/check-*.sh is referenced from scripts/test.sh)".
- `bash scripts/check-install-demo-path-matches-binary-default.sh` → "ok (install.sh OGDB_HOME=$HOME/.ogdb == binary default $HOME/.ogdb/demo.ogdb; init_agent.rs + skill bundle clean)".
- `bash scripts/check-benchmarks-vocabulary-mirror.sh` → "ok (no unmarked legacy verdict vocabulary across BENCHMARKS mirror files)".
- `bash scripts/check-init-agent-syntax.sh` → exit 0.
- `bash scripts/check-binary-name.sh` → exit 0.
- `bash scripts/test-check-install-demo-path-matches.sh` → 8/8 cases pass.
- `bash scripts/test-check-opengraphdb-path-coherence.sh` → 7/7 cases pass.
- `cargo test -p ogdb-cli --test readme_cli_listing` → 1/1 pass on the cycle-20-widened union scope.

Cycle-20 closure verification (the two cycle-20 fixes themselves):

- **Cycle-20 6108439 — skills mirror full sweep.** The 11-row scorecard at `skills/opengraphdb/references/benchmarks-snapshot.md:24-37` and the 5-row hero table at `skills/opengraphdb/SKILL.md:281-285` now mirror `documentation/BENCHMARKS.md` § 2 numerically (cycle-15 4185044's "Re-baseline tracked as a v0.6.0 follow-up" was honest about what cycles 16-19 had let drift through unsynced). Verified row-by-row: row 1 251 nodes/s, row 2 300 nodes/s, row 3 5.8/6.8/11.8 μs (166k qps), row 4 22.9/25.8/36.0 μs, row 5 18.3/163/222 μs (25.9k qps), row 6 12 981/15 939 μs (72 ops/s), row 7 38.8/46.7/112.6 ms, row 8 204/233/246 μs, row 9 295 commits/s, row 10 1.28/1.34/1.62 μs, row 11 48.5 μs, row 12 652 μs/iter × 20 = 13.0 ms, row 13 0.38 μs / 0.32 s / 28.0 MB / 39.4 MB, row 14 1.51 s / 28.0 MB / 49 MB / 40 s. Matches `documentation/BENCHMARKS.md` § 2 exactly. Measurement-date stamp at `references/benchmarks-snapshot.md:19` swept 2026-04-25 → 2026-05-02 to match the source-of-truth JSON `documentation/evaluation-runs/baseline-2026-05-02.json`. **Closed.**
- **Cycle-20 6108439 — vocab gate tightening to case-insensitive.** `scripts/check-benchmarks-vocabulary-mirror.sh:58` swapped `grep -nF` → `grep -niF` so lowercase variants of the FORBIDDEN tokens (`directional win`, `Directional Win`, `Crushing`, `CRUSHING`) now match. Manually verified: planted `directional win — lowercase planted line for gate test.` into a tempdir copy of `skills/opengraphdb/SKILL.md` and the gate fired RED with `forbidden token 'DIRECTIONAL WIN' in skills/opengraphdb/SKILL.md without <!-- HISTORICAL --> marker`. **Closed in code; meta-test coverage gap → see F03.**
- **Cycle-20 cfb3d40 — CLI.md ship + readme test scope widening.** `documentation/CLI.md` is a new 61-line file (24 subcommands grouped into 6 categories: Database lifecycle / Query and shell / Bulk data movement / Schema and introspection / Servers / Direct graph manipulation) listed at `README.md:73` between QUICKSTART and COOKBOOK. The widened test (`crates/ogdb-cli/tests/readme_cli_listing.rs:42-49`) now scans the union of 5 doc files for each entry in `CLI_SUBCOMMANDS`; CLI.md and README.md are file-required (gated by the `Err(e) if *rel == "documentation/CLI.md" || *rel == "README.md"` arm in lines 65-67); the other three are silently skipped if missing. Verified all 24 `Commands` enum variants (kebab-cased: init, info, query, shell, import, export, migrate, import-rdf, export-rdf, validate-shacl, backup, checkpoint, schema, stats, metrics, mcp, serve, demo, create-node, add-edge, neighbors, incoming, hop, hop-in) appear in `documentation/CLI.md`. **Closed for the headline scope; gate-contract gap → see F04.**

Audit of the two cycle-20 commits for new drift:

- **Concern 1 — orphan from public docs index.** `documentation/README.md` is the public-docs index page (the file GitHub renders when the user clicks into `documentation/`). It explicitly lists "Guides" — BENCHMARKS.md / COOKBOOK.md / MIGRATION-FROM-NEO4J.md — and "AI Integration Patterns" + "Evaluation Runs". The cycle-20 cfb3d40 commit added `documentation/CLI.md` (61 lines, declared "canonical reference") but did NOT add a bullet to `documentation/README.md`'s Guides section. Visitors browsing the documentation/ directory don't see a pointer to the new CLI reference unless they entered from the parent README. See F01.
- **Concern 2 — CHANGELOG narrative gap.** Both cycle-20 commits use `fix(` prefixes (`fix(skills): sweep all 11 remaining rows...`, `fix(test): readme_cli_listing scans README+QUICKSTART+CLI.md...`). `scripts/workflow-check.sh:60-90` Layer-2 enumerates `feat(` commits only, so neither cycle-20 commit was gated for [Unreleased] coverage. Confirmed via `git log --oneline -- CHANGELOG.md`: latest CHANGELOG-touching commit is still `6c17c3d` (cycle-18 fix-set). [Unreleased] section therefore now omits four shipped fixes: cycle-19 `ae7ebb5` + `fb0ec7a` (carry-forward of cycle-20 F02) AND cycle-20 `6108439` + `cfb3d40` (NEW). Reproduces the same drift class flagged in cycle-20 F02. See F02.
- **Concern 3 — vocab gate red-green meta-test scope.** `scripts/test-check-benchmarks-vocabulary-mirror.sh:34-35` plants only the UPPERCASE form (`DIRECTIONAL WIN`) into the tempdir copy of `skills/opengraphdb/SKILL.md`. Cycle-20 6108439's gate change adds `-i` to grep so lowercase variants are caught, but the meta-test never plants `directional win` or `Directional Win` to red-green prove the case-insensitive matching actually fires. Today the case-insensitive behavior IS real (manually verified above), but it is not test-protected: a future revert of `-i` would silently slip past the meta-test (test still goes RED on the planted UPPERCASE form, so the meta-test still passes after the regression). See F03.
- **Concern 4 — CLI.md gate-contract looseness.** The widened `crates/ogdb-cli/tests/readme_cli_listing.rs:42-49` checks a UNION across 5 files for each subcommand. CLI.md is declared canonical in `cfb3d40`'s commit message and at `documentation/CLI.md:1-3`, but the test only requires "every subcommand is mentioned somewhere across the 5 files" — not "every subcommand is mentioned in CLI.md specifically". A future contributor can add a new command and mention it only in COOKBOOK.md or QUICKSTART.md, leaving CLI.md silently incomplete and the gate green. See F04.
- **Concern 5 — drift between CLI.md and `ogdb --help`.** Built `cargo build -p ogdb-cli --bin ogdb` and ran `./target/debug/ogdb --help` + per-subcommand `--help`. CLI.md descriptions checked against the `Commands` enum's `about` strings at `crates/ogdb-cli/src/lib.rs:166-208` and the per-`<Foo>Command` struct field `help` annotations:
  - `init`: CLI.md "(and optionally wire your AI coding agent with `--agent`)" — `--agent` is the master switch (`InitCommand::agent` at `crates/ogdb-cli/src/lib.rs:233`); `--agent-id` is the optional sub-flag. ✓
  - `shell`: CLI.md "(or run a script with `--script`)" — `--script` exists; `--commands` (semicolon-separated queries) also exists but is not mentioned in CLI.md (`ShellCommand::commands` at `crates/ogdb-cli/src/lib.rs:308-312`). Acceptable as a one-liner.
  - `mcp`: CLI.md "Run the MCP (Model Context Protocol) server over stdio for AI agents." — Reality: `ogdb mcp <db>` REQUIRES either `--request <JSON>` (one-shot non-stdio) OR `--stdio`; calling without flags returns `CliError::Usage("choose exactly one of --request or --stdio")` (`handle_mcp` at `crates/ogdb-cli/src/lib.rs:2429-2431`). The "over stdio" framing tells the primary use case but slightly understates the one-shot `--request` mode. Acceptable as a one-liner.
  - `serve`: CLI.md "Start a database server (Bolt, HTTP, gRPC, or MCP) on the chosen ports." — Verified `handle_serve` at `crates/ogdb-cli/src/lib.rs:3695-3721` defaults to `handle_serve_mcp` when no `--bolt` / `--http` / `--grpc` flag is set; the `--port` help string at `:506` documents `[default: 7687 bolt/mcp, 8080 http, 7689 grpc]` confirming MCP shares the bolt port. ✓
  - `import-rdf`: CLI.md "(Turtle, N-Triples, RDF/XML, JSON-LD, N-Quads)" — verified `RdfImportFormatArg` at `crates/ogdb-cli/src/lib.rs:5826-5832` declares all 5 (Ttl/Nt/Xml/Jsonld/Nq). ✓
  - All other 18 entries: descriptions match the source `about` strings closely enough (mostly extending the source one-liner with one extra parenthetical). No drift.
  - Group categorization: CLI.md groups 24 commands into 6 categories; the source `Commands` enum declares them in source order. The CLI.md grouping is a presentation choice, not drift. ✓
- **Concern 6 — anchor consistency on the new CLI.md.** CLI.md has zero markdown links and one source anchor (`crates/ogdb-cli/src/lib.rs::Commands` at `:5`); the gate `scripts/check-doc-anchors.sh` accepts it (the regex `crates/[a-z0-9_-]+/src/lib\.rs::[A-Za-z_][A-Za-z0-9_:]+` matches and `enum Commands` at `crates/ogdb-cli/src/lib.rs:166` satisfies the introducer check). Headings: `# OpenGraphDB CLI Reference` (H1), `## Full CLI reference` + `## Updating this reference` (H2 ×2), six H3 group headings. Standard. No drift.
- **Concern 7 — residual drift class probes.** Re-ran `git grep -nE '\.opengraphdb' -- ':!documentation/EVAL-*' ':!target/' ':!node_modules/' ':!scripts/'` excluding the same exemptions tracked in cycle-20 — same hits as cycle-20: `DESIGN.md:2092` + `:2107` (carry-forward F10) + `CHANGELOG.md:10` (legitimate Keep-a-Changelog history) + `frontend/src/stores/settings.ts:27` (`*.opengraphdb.dev` domain wildcard, not a path). Cycle-20 introduced no new instances.

Re-status of the cycle-20 carry-forward MEDIUMs / LOWs (none touched by cycle-20):

- **C20 F01 (gate's TARGETS array narrower than `include_dir!` deposit surface)** — TARGETS at `scripts/check-install-demo-path-matches-binary-default.sh:83-87` still enumerates 3 sub-paths (`init_agent.rs` + `skills/opengraphdb/scripts` + `skills/opengraphdb/references`). `include_dir!("$CARGO_MANIFEST_DIR/../../skills/opengraphdb")` at `crates/ogdb-cli/src/init_agent.rs:32` still bakes in the entire tree. The 4 out-of-scope files (`SKILL.md`, `eval/cases.yaml`, plus any future subdir) are still clean of `\.opengraphdb` (verified zero hits via `grep -nE '\.opengraphdb' skills/opengraphdb/SKILL.md skills/opengraphdb/eval/cases.yaml`), but the gate's contract remains narrower than the binary's deposit surface. Unchanged. See F05.
- **C20 F04 (`documentation/COMPATIBILITY.md:3` "active as of v0.4.0 · 2026-05-01")** — workspace is at 0.5.1; cycle-20 fixes have landed; stamp untouched. Unchanged. See F06.
- **C20 F05 (`documentation/COMPATIBILITY.md:44` "Future releases add a v0.5.0 fixture beside it")** — fixture exists at `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs`; prose still contradicts shipped state. Unchanged. See F07.
- **C20 F06 (`documentation/COMPATIBILITY.md:94` § 6 release-time runbook lists only `upgrade_fixture_v0_4_0_opens_on_current`)** — Unchanged. See F08.
- **C20 F07 (`documentation/SECURITY-FOLLOWUPS.md:26` "post-v0.5 task" + `scripts/check-followup-target-not-current.sh` regex gap)** — Unchanged. See F09.
- **C20 F03 (`DESIGN.md:2092+2107` stale `~/.opengraphdb/config.toml` references in §34)** — Unchanged. See F10.
- **C20 F08 (`documentation/BENCHMARKS.md:33` deltas attribution "(full audit, cycle-15)" stale)** — Unchanged. See F11.
- **C20 F09 (`frontend/e2e/qa-followups.spec.ts:3` `/tmp/wt-frontend-qa` scratch path)** — Unchanged. See F12.

## Findings

### F01 — MEDIUM — `documentation/README.md` Guides bullet list omits the new `documentation/CLI.md` — public docs index page not updated when cfb3d40 added a top-level CLI reference

- **Severity:** MEDIUM. **NEW drift introduced by cycle-20 `cfb3d40`.** The cycle-20 commit added `documentation/CLI.md` as a 61-line "canonical CLI reference" and listed it at `README.md:73` between QUICKSTART and COOKBOOK in the project-root README's "Once the basics make sense" file pointer block. But `documentation/README.md` (the index page that GitHub renders when a visitor clicks into the `documentation/` folder) lists **Guides** — `BENCHMARKS.md`, `COOKBOOK.md`, `MIGRATION-FROM-NEO4J.md` — and was NOT updated to add CLI.md. A visitor browsing `documentation/` directly will see a public-docs index that points at three guides without ever pointing at the new canonical CLI reference; the only path to CLI.md from inside `documentation/` is to back out to the parent README first.

  The same drift class first appeared when `documentation/QUICKSTART.md` shipped via b5d10c9 (cycle-15-ish) and was never indexed in `documentation/README.md` either — but cycle-20 reproduces the pattern with a doc that is explicitly declared "canonical" in its own front matter (`documentation/CLI.md:3`: "Canonical listing of every `ogdb` subcommand. The README and QUICKSTART intentionally cover only the common path; this file is the full surface."). A canonical reference that is unindexed from the public-docs index page is a real discoverability gap.

- **Verified:**
  ```
  $ grep -n 'CLI\.md\|QUICKSTART\.md' documentation/README.md
  $ # 0 hits
  $ grep -n 'BENCHMARKS\.md\|COOKBOOK\.md\|MIGRATION-FROM-NEO4J\.md' documentation/README.md
  6:- **[BENCHMARKS.md](BENCHMARKS.md)** — competitive baseline …
  7:- **[COOKBOOK.md](COOKBOOK.md)** — seven runnable AI-agent recipes …
  8:- **[MIGRATION-FROM-NEO4J.md](MIGRATION-FROM-NEO4J.md)** — three differences …
  $ git log --oneline --diff-filter=A -- documentation/CLI.md
  cfb3d40 fix(test): readme_cli_listing scans README+QUICKSTART+CLI.md (post-simplification fix); ship CLI.md as canonical CLI reference
  ```
  → CLI.md was added by cycle-20 `cfb3d40`; documentation/README.md was last touched by cycle-2 `c4e23ea` (pre-CLI.md). Same drift pattern was true for QUICKSTART.md since b5d10c9 — but cycle-20 reproduces it for a doc explicitly declared canonical.

- **Patch sketch:** Add CLI.md (and ideally QUICKSTART.md) to the Guides bullet list:
  ```diff
  --- a/documentation/README.md
  +++ b/documentation/README.md
  @@ -5,6 +5,8 @@ Everything in this folder is intended for users of OpenGraphDB. For internal con
   ## Guides

  +- **[QUICKSTART.md](QUICKSTART.md)** — five-minute walkthrough: install, load MovieLens, run your first Cypher query, wire your AI coding agent.
  +- **[CLI.md](CLI.md)** — canonical reference for every `ogdb` subcommand (24 commands across 6 groups), with one-line descriptions; defers to `ogdb --help` for the live flag surface.
   - **[BENCHMARKS.md](BENCHMARKS.md)** — competitive baseline (N=5 medians) versus Neo4j, Memgraph, KuzuDB, with reproducibility notes and an honest wins/losses scorecard.
   - **[COOKBOOK.md](COOKBOOK.md)** — seven runnable AI-agent recipes (MCP, hybrid retrieval, doc → KG, time-travel, skill-quality eval, Neo4j migration, CI regression). Every snippet is exercised by e2e tests on every PR.
   - **[MIGRATION-FROM-NEO4J.md](MIGRATION-FROM-NEO4J.md)** — three differences that matter, Cypher-by-Cypher mapping, and where the latency comes from.
  ```

  Optional gate strengthening: a structural mirror gate that asserts every top-level file under `documentation/*.md` (excepting `EVAL-*.md` + `SECURITY-FOLLOWUPS.md` + `README.md` itself) has at least one back-reference from `documentation/README.md`. Without it, the next "ship a new public docs file" commit can reproduce this same drift pattern.

---

### F02 — MEDIUM — `CHANGELOG.md` [Unreleased] still has no entries for cycle-19's `ae7ebb5` + `fb0ec7a` AND now also missing cycle-20's `6108439` + `cfb3d40`; `scripts/workflow-check.sh` Layer-2 is `feat(`-only and continues to skip `fix(` commits

- **Severity:** MEDIUM. **Carry-forward of C20 F02 + extension by the two cycle-20 commits.** [Unreleased] section at `CHANGELOG.md:8-22` is unchanged from cycle-20 close — the latest CHANGELOG-touching commit is still `6c17c3d` (cycle-18). The cycle-20 fix-set adds two more `fix(`-prefixed shipped commits to the not-mentioned list:
  - cycle-19 `ae7ebb5` + `fb0ec7a` (carry-forward from cycle-20 F02)
  - cycle-20 `6108439` (skill-bundle perf-row sweep covering 11 numeric updates + a stamp bump + a vocab-gate tightening — all four of which are user-visible since the skill bundle is deposited to user systems on `ogdb init --agent`)
  - cycle-20 `cfb3d40` (new top-level public doc + a test contract widening)

  All four are user-visible shipped behavior changes. None are mentioned in [Unreleased]. The release-notes reader of v0.5.2 will see the L10 bullet describing the cycle-18 install.sh / handle_demo fix and conclude the patch covered "install.sh + lib.rs + README + QUICKSTART"; a `git log` will show 4 more shipped fixes (init_agent.rs path sweep, skill bundle path sweep, skill bundle perf-row sweep, CLI.md ship + readme test scope) that materially extend the patch surface.

  Why the gate doesn't catch it: identical to cycle-20 F02 — `scripts/workflow-check.sh:60-90` Layer-2 enumerates `feat(` commits only, treating every `fix(` commit as out-of-scope for [Unreleased] enforcement. The cycles-15/18 convention of voluntarily adding [Unreleased] bullets for `fix(` commits has now lapsed for two consecutive cycles (cycle-19 + cycle-20).

- **Verified:**
  ```
  $ git log --oneline -- CHANGELOG.md | head -3
  6c17c3d fix(install,demo): align install.sh path with binary default + ogdb demo re-seeds empty init files
  91ee552 fix(install,readme,changelog): correct demo seed claim …
  $ git log --oneline -5 cfb3d40
  cfb3d40 fix(test): readme_cli_listing scans README+QUICKSTART+CLI.md (post-simplification fix); ship CLI.md as canonical CLI reference
  6108439 fix(skills): sweep all 11 remaining rows + measurement date + tighten vocab gate to case-insensitive
  fb0ec7a fix(paths): complete ~/.opengraphdb → ~/.ogdb sweep across init_agent.rs + skill bundle + widen gate
  ae7ebb5 fix(migration-spec): update e2e selectors to match cycle-18 F02 wins-section restructure
  6c17c3d fix(install,demo): align install.sh path with binary default + ogdb demo re-seeds empty init files
  ```
  → cycle-19 + cycle-20 fix-set is 4 commits ahead of CHANGELOG.

- **Patch sketch:** append four entries (or merge into one consolidated bullet covering cycle-19 + cycle-20 closure work):
  ```diff
   ## [Unreleased]

  +- `crates/ogdb-cli/tests/readme_cli_listing.rs` + new `documentation/CLI.md` (cycle-20 docs eval cfb3d40) — README.md was simplified across the cycle-15 → cycle-17 arc to remove the per-subcommand listing; the cycle-3 `readme_cli_listing` test (which pinned every `Commands` enum variant to a README mention) silently went stale because the listing was no longer in README. cfb3d40 ships `documentation/CLI.md` as the canonical CLI reference (24 commands grouped into 6 categories) and widens the test to scan the union of README + CLI.md + QUICKSTART + COOKBOOK + MIGRATION-FROM-NEO4J for every `CLI_SUBCOMMANDS` entry; CLI.md and README.md are file-required, the other three are silently skipped if missing.
  +- `skills/opengraphdb/SKILL.md` + `references/benchmarks-snapshot.md` (cycle-20 docs eval 6108439) — finished the cycle-15 4185044 promise that the skill bundle would mirror `documentation/BENCHMARKS.md` § 2 row-for-row. Cycles 16-19 left 11 perf rows + the measurement-date stamp drifted: SKILL.md hero table swept all 5 numeric rows to the cycle-15 cf97159 N=5 medianed values; benchmarks-snapshot.md 14-row scorecard swept all 11 remaining rows; measurement-date stamp swept 2026-04-25 → 2026-05-02 to match `documentation/evaluation-runs/baseline-2026-05-02.json`. Also tightened `scripts/check-benchmarks-vocabulary-mirror.sh:58` `grep -nF` → `grep -niF` so lowercase variants of the FORBIDDEN tokens (`directional win`, `Crushing`, etc.) are caught — closes a latent loophole introduced when cycle-17 e585f66 retracted both casings of the legacy verdict vocabulary.
  +- `crates/ogdb-cli/src/init_agent.rs` + `skills/opengraphdb/scripts/{ogdb-serve-http.sh,ogdb-mcp-stdio.sh}` + `skills/opengraphdb/references/{debugging.md,common-recipes.md}` (cycle-19 docs eval F01/F02/F03, commit `fb0ec7a`) — completed the cycle-18 `~/.opengraphdb` → `~/.ogdb` path sweep across the three binary-deposit surfaces cycle-18's narrow scope had left behind: 4 hits in init_agent.rs (the standalone-`init --agent` workflow's default DB path / HTTP-server log dir / aider skill destination), 4 hits in skill-bundle wrapper scripts (deposited verbatim via `include_dir!`), 9 hits in skill-bundle reference docs (read by the agent for "where is the demo database?" answers). `scripts/check-install-demo-path-matches-binary-default.sh` widened to scan init_agent.rs + skill-bundle scripts + references for stale `\.opengraphdb` tokens; new red-green meta-test `scripts/test-check-opengraphdb-path-coherence.sh` (7 cases) wired into `scripts/test.sh`.
  +- `frontend/e2e/migration-guide-snippets.spec.ts` (cycle-18 docs eval F02 follow-up, commit `ae7ebb5`) — case-insensitive matching for the "scale-mismatched" honesty-marker so cycle-18 F02's promotion of the term to a bold sub-heading at `documentation/MIGRATION-FROM-NEO4J.md:166` doesn't break the runnable-snippet assertion that originally targeted the lowercase prose form.

   - `scripts/install.sh` + `crates/ogdb-cli/src/lib.rs::handle_demo` (cycle-18 docs eval F01) — install.sh banner promised "run `ogdb demo` to load MovieLens" …
  ```

  Gate strengthening (carry-forward from cycle-20 F02 patch sketch): extend `scripts/workflow-check.sh` Layer-2 to enumerate `fix(` commits as well as `feat(`, treating any `fix(` commit since the latest released tag as one that should appear in [Unreleased]. Without the strengthening, this drift class will recur every cycle that lands a fix-prefixed structural sweep.

---

### F03 — LOW — `scripts/test-check-benchmarks-vocabulary-mirror.sh` red-green test only plants the UPPERCASE form (`DIRECTIONAL WIN`), missing the lowercase coverage that cycle-20 6108439's `-i` gate-tightening was specifically meant to catch

- **Severity:** LOW. **NEW drift introduced by cycle-20 `6108439`.** Cycle-20 6108439 changed `scripts/check-benchmarks-vocabulary-mirror.sh:58` from `grep -nF "$token" "$p"` to `grep -niF "$token" "$p"`, with an inline comment at `:55-58` explaining the rationale: "EVAL-PERF-RELEASE-CYCLE20 F01: case-insensitive match — c17 e585f66 retracted both `DIRECTIONAL WIN` and `directional WIN` (any casing). Token list lives uppercase for readability; matching must be -i so lowercase variants like `directional WIN` cannot slip through."

  But the existing red-green meta-test `scripts/test-check-benchmarks-vocabulary-mirror.sh:34-35` plants only the uppercase form into the tempdir copy of `skills/opengraphdb/SKILL.md`:
  ```
  printf '\nDIRECTIONAL WIN — planted line for gate test.\n' \
    >> "$TMP/skills/opengraphdb/SKILL.md"
  ```
  …and a future contributor reverting the `-i` flag (or changing `grep -niF` back to `grep -nF`) would still see the meta-test pass — the planted UPPERCASE form is matched by both case-sensitive and case-insensitive grep, so the meta-test cannot distinguish the two regimes.

  Manually verified the case-insensitive behavior IS real today: planted `directional win — lowercase planted line for gate test.` into a tempdir copy and the gate fired RED with `forbidden token 'DIRECTIONAL WIN' in skills/opengraphdb/SKILL.md without <!-- HISTORICAL --> marker`. So the gate works; the meta-test just doesn't prove it.

  This is the cycle-15 → cycle-19 partial-sweep root cause repeated at the meta-test layer: the gate scope was widened (case-insensitive matching), but the red-green meta-test wasn't widened to red-green prove the new dimension. The cycle-19 widening of `scripts/check-install-demo-path-matches-binary-default.sh` (TARGETS array expansion) was correctly paired with a NEW meta-test (`scripts/test-check-opengraphdb-path-coherence.sh`, 7 cases including the two legitimate exemptions). The cycle-20 widening of `scripts/check-benchmarks-vocabulary-mirror.sh` (-i flag) was NOT paired with a meta-test extension covering the lowercase case.

- **Verified:**
  ```
  $ sed -n '34,35p' /tmp/wt-c21-docs/scripts/test-check-benchmarks-vocabulary-mirror.sh
  printf '\nDIRECTIONAL WIN — planted line for gate test.\n' \
    >> "$TMP/skills/opengraphdb/SKILL.md"
  $ sed -n '55,58p' /tmp/wt-c21-docs/scripts/check-benchmarks-vocabulary-mirror.sh
      # EVAL-PERF-RELEASE-CYCLE20 F01: case-insensitive match — c17 e585f66
      # retracted both `DIRECTIONAL WIN` and `directional WIN` (any casing).
      # Token list lives uppercase for readability; matching must be -i so
      # lowercase variants like `directional WIN` cannot slip through.
  ```

- **Patch sketch:** add a third planted-fail case for the lowercase variant, between the existing UPPERCASE-RED case and the HISTORICAL-marker GREEN case:
  ```diff
  --- a/scripts/test-check-benchmarks-vocabulary-mirror.sh
  +++ b/scripts/test-check-benchmarks-vocabulary-mirror.sh
  @@ -49,6 +49,30 @@ if [[ $RC -eq 0 ]]; then
   fi
   echo "test: RED on planted unmarked reference (expected, exit=$RC)"

  +# --- RED: planted LOWERCASE forbidden token should also fail (cycle-20 6108439 -i tightening) ---
  +TMP_LC=$(mktemp -d)
  +trap 'rm -rf "$TMP" "$TMP_LC"' EXIT
  +
  +mkdir -p "$TMP_LC/documentation" \
  +         "$TMP_LC/skills/opengraphdb/references"
  +cp "$REPO_ROOT/documentation/BENCHMARKS.md"                        "$TMP_LC/documentation/BENCHMARKS.md"
  +cp "$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"              "$TMP_LC/documentation/MIGRATION-FROM-NEO4J.md"
  +cp "$REPO_ROOT/skills/opengraphdb/SKILL.md"                        "$TMP_LC/skills/opengraphdb/SKILL.md"
  +cp "$REPO_ROOT/skills/opengraphdb/references/benchmarks-snapshot.md" \
  +   "$TMP_LC/skills/opengraphdb/references/benchmarks-snapshot.md"
  +
  +printf '\ndirectional win — lowercase planted line for gate test (cycle-20 -i tightening).\n' \
  +  >> "$TMP_LC/skills/opengraphdb/SKILL.md"
  +
  +set +e
  +( cd "$TMP_LC" && "$GATE" >/dev/null 2>&1 )
  +RC=$?
  +set -e
  +
  +if [[ $RC -eq 0 ]]; then
  +  echo "test FAILED: gate did not flag a planted LOWERCASE forbidden token (cycle-20 -i regression)" >&2
  +  exit 1
  +fi
  +echo "test: RED on planted LOWERCASE reference (expected, exit=$RC)"
  +
   # --- GREEN: planted forbidden token WITH HISTORICAL marker should pass ---
   TMP2=$(mktemp -d)
  ```

  This pins the cycle-20 case-insensitive behavior to a meta-test red-green case, so a future revert of the `-i` flag goes RED.

---

### F04 — LOW — `crates/ogdb-cli/tests/readme_cli_listing.rs` after cfb3d40's union widening checks "subcommand mentioned somewhere across 5 files" — but `documentation/CLI.md` is declared canonical in its own front matter, and a new subcommand could be mentioned only in QUICKSTART/COOKBOOK and slip past the gate while leaving CLI.md silently incomplete

- **Severity:** LOW. **NEW gate-contract gap introduced by cycle-20 `cfb3d40`.** Pre-cycle-20 the test asserted "every subcommand is mentioned in `README.md`". Cycle-20 cfb3d40 widened to "every subcommand is mentioned in the union of README + CLI.md + QUICKSTART + COOKBOOK + MIGRATION-FROM-NEO4J" because the README was simplified to drop the per-subcommand listing. The widening is correct in capturing the simplification — but it loses the property "every subcommand is in the canonical CLI reference specifically".

  The cfb3d40 commit message describes CLI.md as "canonical CLI reference", and CLI.md's own front matter at `documentation/CLI.md:3` reads "Canonical listing of every `ogdb` subcommand. The README and QUICKSTART intentionally cover only the common path; this file is the full surface." But the test only requires `combined.contains(cmd)` against the joined contents of all 5 files. So a future contributor could:

  1. Add `Foo(FooCommand)` to the `Commands` enum at `crates/ogdb-cli/src/lib.rs::Commands`.
  2. Add `"foo"` to `CLI_SUBCOMMANDS` at `crates/ogdb-cli/tests/readme_cli_listing.rs:18`.
  3. Add a one-liner in QUICKSTART.md ("…then run `ogdb foo my.ogdb`…").
  4. NOT add an entry in `documentation/CLI.md`.

  All four steps would pass the test as widened. CLI.md's "every subcommand" claim becomes false, and the test (the only enforcement of the contract) doesn't catch it.

  Today CLI.md does have all 24 commands (verified above), so this is a latent gap. But the cycle-20 widening's intent was to preserve the gate after the README simplification; the side-effect is that CLI.md's canonical-status promise is now unenforced.

- **Verified:**
  ```
  $ grep -n 'combined.contains\|DOC_FILES' /tmp/wt-c21-docs/crates/ogdb-cli/tests/readme_cli_listing.rs
  42:const DOC_FILES: &[&str] = &[
  76:        if !combined.contains(cmd) {
  $ sed -n '42,49p' /tmp/wt-c21-docs/crates/ogdb-cli/tests/readme_cli_listing.rs
  const DOC_FILES: &[&str] = &[
      "README.md",
      "documentation/CLI.md",
      "documentation/QUICKSTART.md",
      "documentation/COOKBOOK.md",
      "documentation/MIGRATION-FROM-NEO4J.md",
  ]
  $ sed -n '1,5p' /tmp/wt-c21-docs/documentation/CLI.md
  # OpenGraphDB CLI Reference

  Canonical listing of every `ogdb` subcommand. The README and QUICKSTART intentionally cover only the common path; this file is the full surface.
  ```

- **Patch sketch:** layer a second per-file check on top of the union check, asserting CLI.md specifically mentions every subcommand:
  ```diff
  --- a/crates/ogdb-cli/tests/readme_cli_listing.rs
  +++ b/crates/ogdb-cli/tests/readme_cli_listing.rs
  @@ -76,6 +76,23 @@ fn readme_cli_listing_covers_all_subcommands() {
       }
       assert!(
           missing.is_empty(),
           "documentation is missing CLI subcommand(s): {missing:?}\n\
            Add them to `documentation/CLI.md` (the canonical CLI reference) or — \
            if they should not surface — update CLI_SUBCOMMANDS in {}/tests/readme_cli_listing.rs.",
           env!("CARGO_MANIFEST_DIR")
       );
  +
  +    // Cycle-20 cfb3d40 declared CLI.md the canonical reference; assert it
  +    // actually contains every subcommand (not just "the union of 5 files").
  +    let cli_md = workspace_root.join("documentation/CLI.md");
  +    let cli_md_contents = std::fs::read_to_string(&cli_md)
  +        .unwrap_or_else(|e| panic!("read {}: {e}", cli_md.display()));
  +    let mut missing_in_cli_md = Vec::new();
  +    for cmd in CLI_SUBCOMMANDS {
  +        if !cli_md_contents.contains(cmd) {
  +            missing_in_cli_md.push(*cmd);
  +        }
  +    }
  +    assert!(
  +        missing_in_cli_md.is_empty(),
  +        "documentation/CLI.md (the canonical CLI reference) is missing: {missing_in_cli_md:?}\n\
  +         Every subcommand must appear in CLI.md, not just somewhere in the union of docs."
  +    );
   }
  ```

  Pins the canonical-reference promise to a code-level gate, so a future "ship a new subcommand and only document it in COOKBOOK" change cannot silently drift CLI.md.

---

### F05 — MEDIUM — `scripts/check-install-demo-path-matches-binary-default.sh:83-87` widened-gate `TARGETS` array enumerates three explicit sub-paths but `include_dir!` (`crates/ogdb-cli/src/init_agent.rs:32`) bakes in the *entire* `skills/opengraphdb/` directory recursively — gate contract is narrower than the deposit surface

- **Carry-forward from cycle-20 F01 (cycle-19-introduced by `fb0ec7a`) — not addressed by either cycle-20 commit.** Severity unchanged. Patch sketch identical to cycle-20 F01: tighten `TARGETS[2]` + `TARGETS[3]` to a single `"$ROOT/skills/opengraphdb"` and add cases 8-9 to `scripts/test-check-opengraphdb-path-coherence.sh` planting stale `\.opengraphdb` tokens in `skills/opengraphdb/SKILL.md` + `skills/opengraphdb/eval/cases.yaml`. Currently latent (those 4 out-of-scope files are clean), but the gate's contract is narrower than the binary's `include_dir!` deposit surface.

---

### F06 — MEDIUM — `documentation/COMPATIBILITY.md:3` doc-level Status stamp still says "active as of v0.4.0 · 2026-05-01" — workspace is at 0.5.1 and cycles 19 + 20 fixes have landed

- **Carry-forward from cycle-20 F04 (cycle-19 F07 / cycle-18 F07 / cycle-17 F07) — not addressed by either cycle-20 commit.** Severity unchanged. Cycle-21 stamp should read e.g. "active as of v0.5.1 · 2026-05-05 (last reviewed cycle-21)". A `scripts/check-compat-stamp.sh`-style gate (mirror of `check-security-supported-version.sh`) would pin this stamp to `Cargo.toml` minor.

---

### F07 — MEDIUM — `documentation/COMPATIBILITY.md:44` still says "Future releases add a v0.5.0 fixture beside it" — `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` exists since cycle-15

- **Carry-forward from cycle-20 F05 (cycle-19 F05 / cycle-18 F05 / cycle-17 F05) — not addressed by either cycle-20 commit.** Patch sketch identical to cycle-20 F05.

---

### F08 — MEDIUM — `documentation/COMPATIBILITY.md:94` § 6 release-time runbook only enumerates `upgrade_fixture_v0_4_0_opens_on_current` — v0.5.0 fixture not in the runbook

- **Carry-forward from cycle-20 F06 (cycle-19 F06 / cycle-18 F06 / cycle-17 F06) — not addressed by either cycle-20 commit.** Patch sketch identical to cycle-20 F06.

---

### F09 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md:26` release-notes blockquote still reads "tracked as a post-v0.5 task"; `scripts/check-followup-target-not-current.sh`'s regex catches `vX.Y follow-up` only and `post-vX.Y` slips through

- **Carry-forward from cycle-20 F07 (cycle-19 F08 / cycle-18 F08 / cycle-17 F08) — not addressed by either cycle-20 commit.** Patch sketch identical to cycle-20 F07: widen the regex to `\b(v|post-v)[0-9]+\.[0-9]+(\.[0-9]+)?([[:space:]]+(follow-up|task|item))?\b` and sweep the SECURITY-FOLLOWUPS.md prose to `v0.6.0 task (slipped from the original v0.5 target)`.

---

### F10 — LOW — `DESIGN.md:2092` + `:2107` still reference `~/.opengraphdb/config.toml` in §34 "Configuration System" prose (cycle-20 F03 carry-forward; cycle-20 commits did not touch DESIGN.md)

- **Carry-forward from cycle-20 F03 (cycle-19 F04) — not addressed by either cycle-20 commit.** Severity unchanged. Both references describe a never-shipped feature; rhetorical drift only. Compounding LOW staleness: §34 prose at L2096 says "Reality check (0.4.0)" and L2099 says "0.4.0 uses **CLI flags only**" — the workspace is at 0.5.1 now. Patch sketch identical to cycle-20 F03.

---

### F11 — LOW — `documentation/BENCHMARKS.md:33` deltas-table header attribution "(full audit, cycle-15)" is stale — cycle-16 `f72f7cd` extended the table with rows 1+2; cycles 17/18/19/20 made no further extension

- **Carry-forward from cycle-20 F08 (cycle-19 F09 / cycle-18 F09 / cycle-17 F09) — not addressed by either cycle-20 commit.** Bookkeeping drift. Patch sketch identical to cycle-20 F08:
  ```diff
  -> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15).** The
  +> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15 + cycle-16).** The
  ```

---

### F12 — LOW — `frontend/e2e/qa-followups.spec.ts:3` cites a private scratch-worktree QA-REPORT.md path under a tempdir-style prefix — gate scope (`scripts/check-public-doc-tmp-leak.sh`) does not cover `frontend/e2e/`

- **Carry-forward from cycle-20 F09 (cycle-19 F10 / cycle-18 F10 / cycle-17 F10) — not addressed by either cycle-20 commit.** Reader-impact bounded; either drop the path-citation, move the audit report to `documentation/audits/`, or extend `scripts/check-public-doc-tmp-leak.sh` to also cover `frontend/e2e/`.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 0     | —   |
| MEDIUM   | 6     | F01, F02, F05, F06, F07, F08, F09 → wait recount |
| LOW      | 4     | F03, F04, F10, F11, F12 → recount |

(Recount):

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 0     | —   |
| MEDIUM   | 6     | F01, F02, F05, F06, F07, F08, F09 |
| LOW      | 5     | F03, F04, F10, F11, F12 |

Wait — F01 + F02 + F05 + F06 + F07 + F08 + F09 = 7 MEDIUMs. Let me recount the actual finding bodies above:

- MEDIUM: F01 (new), F02 (carry+extend), F05 (=C20 F01), F06 (=C20 F04), F07 (=C20 F05), F08 (=C20 F06), F09 (=C20 F07). That's 7 MEDIUMs.
- LOW: F03 (new), F04 (new), F10 (=C20 F03), F11 (=C20 F08), F12 (=C20 F09). That's 5 LOWs.

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 0     | —   |
| MEDIUM   | 7     | F01, F02, F05, F06, F07, F08, F09 |
| LOW      | 5     | F03, F04, F10, F11, F12 |

### Severity changes vs. cycle-20

- **Closed in cycle-20:** none of the cycle-20 carry-forward MEDIUMs / LOWs (cycle-20 F01-F09 except the two NEW MEDIUMs F01-F02 cycle-20 raised against itself); cycle-20 commits addressed only the BENCHMARKS-mirror sweep + CLI listing simplification, neither of which touched any of the cycle-20 carry-forward surfaces.
- **New MEDIUM (cycle-20-introduced by `cfb3d40`):** F01 (this report) — `documentation/README.md` Guides bullet list omits the new `documentation/CLI.md`; the public-docs index page wasn't updated when cfb3d40 added a top-level "canonical CLI reference" doc. Reproduces the b5d10c9-era pattern (QUICKSTART.md also unindexed) but with a doc explicitly declared canonical, making the discoverability gap real.
- **Continuing MEDIUM (extended by cycle-20 commits):** F02 (this report) — cycle-19 F02 carry-forward; now compounded by cycle-20's two `fix(`-prefixed commits (`6108439`, `cfb3d40`) also slipping past `scripts/workflow-check.sh:60-90` Layer-2's `feat(`-only enumeration. [Unreleased] now omits four shipped fixes spanning cycles 19+20.
- **New LOW (cycle-20-introduced by `6108439`):** F03 (this report) — meta-test scope gap; `scripts/test-check-benchmarks-vocabulary-mirror.sh:34-35` plants only the UPPERCASE form, so cycle-20 6108439's `-i` flag-tightening is gate-side only, not red-green meta-test pinned.
- **New LOW (cycle-20-introduced by `cfb3d40`):** F04 (this report) — gate-contract gap; cfb3d40's "union of 5 files" widening loses the property "every subcommand is in the canonical `documentation/CLI.md`" that the new doc's front matter promises. CLI.md is currently complete, but the gate doesn't enforce future contributors to keep it that way.
- **Carry-forward MEDIUMs** (5): F05 / F06 / F07 / F08 / F09 = cycle-20 F01 / F04 / F05 / F06 / F07, unchanged. Cycle-20's commits don't touch any of these surfaces and don't widen the followup-target regex or COMPATIBILITY-stamp gate scope.
- **Carry-forward LOWs** (3): F10 / F11 / F12 = cycle-20 F03 / F08 / F09, unchanged.

### Gate coverage assessment

The cycle-20 gate-tightening (case-insensitive vocab-gate matching) is the right shape for what it set out to enforce — the live-tree case behaves correctly for both UPPERCASE and lowercase variants. The remaining gap is **F03 (this report)**: the existing red-green meta-test only plants the UPPERCASE form, so a future revert of the `-i` flag would silently slip past the meta-test (the meta-test stays GREEN because the planted UPPERCASE line still goes RED under both regimes). Pairing the gate widening with a third meta-test case (planted LOWERCASE form) closes the meta-test scope properly.

The cycle-20 readme_cli_listing widening (cfb3d40) is similarly correct in capturing the README simplification — but it relaxes the gate from "every cmd is in README" to "every cmd is in the union of 5 files", which loses the canonical-reference promise that CLI.md's own front matter makes. **F04 (this report)**: a per-file CLI.md check layered on top of the union check pins the canonical-reference promise to a code-level gate. Currently latent (CLI.md does have all 24 commands today), but a future contributor's "ship a command and only document it in COOKBOOK" change would silently leave CLI.md incomplete and pass the gate.

The third gate gap is the multi-cycle process-drift one: **F02 (this report)** — `scripts/workflow-check.sh:60-90` Layer-2 is `feat(`-only and continues to skip `fix(` commits. Cycle-20's two commits are the third + fourth `fix(`-prefixed shipped fix to slip past it (cycle-19's pair was the first + second). Without widening Layer-2 to enumerate `fix(` commits as well, this drift class will recur every cycle that lands a fix-prefixed structural sweep.

The COMPATIBILITY.md cluster (F06 / F07 / F08) and SECURITY-FOLLOWUPS.md (F09) are version-stamp / followup-target drifts that pre-date the partial-sweep arc; addressing them as a coordinated batch closes 4 of the 7 outstanding MEDIUMs in one commit.

### Headline

Cycle-20's two-commit fix-set (`6108439` + `cfb3d40`) cleanly closes the cycle-20 review-targeted surfaces (skill-bundle perf-row sweep finished, vocab-gate tightened to case-insensitive, CLI listing canonicalized into a new public doc). All shipped gates pass on the live tree; cycle-21 finds **0 BLOCKER, 0 HIGH** for the second consecutive round. **Second clean round on HIGH/BLOCKER class — CONVERGED on the partial-sweep arc that ran cycle-15 → cycle-19.**

What remains:

1. **One latent doc-index orphan (F01, MEDIUM):** `documentation/README.md`'s Guides bullet list doesn't mention the new `documentation/CLI.md`. Visitors browsing the documentation/ folder don't see a pointer to the canonical CLI reference unless they came from the parent README. Adding a one-line bullet (and ideally one for QUICKSTART.md too, an older instance of the same pattern) closes the gap; an optional structural mirror gate prevents recurrence.
2. **One continuing process-drift (F02, MEDIUM):** [Unreleased] still omits four shipped fixes (cycle-19 ae7ebb5/fb0ec7a + cycle-20 6108439/cfb3d40) because workflow-check.sh Layer-2 is `feat(`-only. Adding four bullets resolves the immediate drift; widening Layer-2 to enumerate `fix(` commits pre-empts recurrence.
3. **Two new gate-test gaps (F03 + F04, both LOW):** cycle-20's two gate-side widenings (vocab gate `-i`, readme_cli_listing union widening) are correct in code but lack matching gate-test coverage for the new dimensions they enforce. Both gaps are latent today; both fixes are mechanical (planted-LOWERCASE meta-test case, per-file CLI.md assertion).
4. **Five MEDIUMs + three LOWs carried forward unchanged from cycle-20** (F05 cycle-19-introduced gate scope; F06/F07/F08 COMPATIBILITY.md cluster; F09 SECURITY-FOLLOWUPS regex gap; F10 DESIGN.md §34; F11 BENCHMARKS.md attribution; F12 qa-followups scratch path). None are touched by cycle-20's commits. The COMPATIBILITY.md trio (F06/F07/F08) is the largest concentrated cluster — addressing those three together with one commit would close 3 of the 7 outstanding MEDIUMs.

Two consecutive 0H+0B rounds (cycle-20 + cycle-21) is the convergence signal the cycle-21 prompt asks for: the partial-sweep arc that drove cycles 15-19 is now closed, and the remaining drift surfaces are bookkeeping-grade — version stamps, followup targets, attribution annotations, and gate-test scope gaps. None of them are individually load-bearing on user-facing correctness, but the cumulative count (5M + 3L pinned across 5+ cycles) signals the project would benefit from a "stamp / followup / attribution / gate-test scope" sweep cycle that addresses them as a coordinated batch rather than as isolated future fixes.
