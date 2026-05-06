# Recursive docs honesty audit — 2026-05-06

**Auditor:** staff/principal engineer pass against `origin/main` @ `23e8327` (detached worktree at `/tmp/wt-audit-docs`).
**Scope:** every user-facing doc — README, CHANGELOG, ARCHITECTURE/DESIGN/SPEC, all of `documentation/**`, `skills/*/SKILL.md`, `scripts/competitor-bench/README.md`, plus the binary `--help` text it ships.
**Method:** built `cargo build --release -p ogdb-cli`, then pulled apart claims-vs-reality across seven parallel sub-audits — benchmarks, README/onboarding, cookbook+recipes, SKILL.md+MIGRATION, links/commands/TODOs, architectural docs, CHANGELOG. Zero agents were allowed to skim. Every Cypher snippet that was tested was actually run against the binary.
**Reproducer for this report:** all evidence is in the worktree above; each finding cites file + line + actual command output where applicable.

---

## BLOCKERS — claims that are demonstrably false

These will burn a new user or an AI agent on first contact.

### B1. The README's flagship MovieLens query returns zero rows against the database the README itself tells you to load
- README `lines 71-75` instructs:
  > `ogdb query ~/.ogdb/demo.ogdb "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name, m.title LIMIT 5"`
  >
  > _You should see five people and the movies they acted in. That's it — you have a working graph database._
- After `ogdb demo` (which loads 8019 nodes + 1981 edges into `~/.ogdb/demo.ogdb`), the actual result is `row_count=0`.
- `MATCH (n) RETURN labels(n)` and `MATCH ()-[r]->() RETURN type(r)` both return `null` — i.e. label/type-pattern matching against the seeded data is silently broken.
- This is the **literal first thing the README promises a user will see**. They will see nothing and assume the install failed.

### B2. Binary identity drift: `ogdb` vs `opengraphdb`
- Every doc and every install script names the CLI `ogdb`. The shipped binary's `--help` says `usage: opengraphdb [OPTIONS] <COMMAND>` and the Examples block uses `opengraphdb init my.ogdb`.
- The `--help` footer also points at `https://github.com/openGraphDB/openGraphDB` (capitalised, different repo) while every public surface uses `asheshgoplani/opengraphdb`.
- Net effect: a user copy-pasting from `--help` runs the wrong binary name and follows a dead docs link.

### B3. SKILL.md teaches agents APIs that don't work
SKILL.md is the document Claude / Cursor agents load directly into their prompts. Each lie here causes thousands of broken-query sessions.
- `skills/opengraphdb/SKILL.md:117` documents `ogdb serve --mcp` — the binary errors with `unexpected argument '--mcp'`. Real flags: `--bolt --http --grpc` only; MCP is the separate `ogdb mcp --stdio` subcommand.
- `skills/opengraphdb/SKILL.md:170-171` ships an aggregation example `MATCH (p:Person)-[:WROTE]->(b:Book) RETURN p.name, count(b) AS books ORDER BY books DESC LIMIT 10` — actual: `semantic analysis error: unbound variable: books`. ORDER BY does not see RETURN aliases.
- `skills/opengraphdb/SKILL.md:247` documents `agent_store_episode` with `summary` + `embedding`; real schema is `{agent_id, session_id, content, embedding, timestamp}` — wrong field name (`content` vs `summary`) plus three missing required fields. Verified against `crates/ogdb-cli/src/lib.rs:3035`.
- `skills/opengraphdb/SKILL.md:149` claims `UNION` and `EXISTS` as supported. `MATCH (n) UNION MATCH (n) RETURN n.name` → `unsupported query`; `WHERE EXISTS((n)-[:KNOWS]->())` → `unsupported query`.

### B4. MIGRATION-FROM-NEO4J.md tells Neo4j users to write Cypher that doesn't parse
- `documentation/MIGRATION-FROM-NEO4J.md:219` lists the OGDB column for vector/text indexes as `CALL vector.create_index(...)` and `CALL text.create_index(...)`. Both return `unexpected token while parsing clause at line 1, column 1` from CLI **and** HTTP — `CALL` is not implemented at all. The Migration doc's reason for existing is to tell Neo4j users "here is the OGDB equivalent." There is no Cypher equivalent today; index DDL only exists via the MCP tool surface.
- COOKBOOK Recipe 6 shares the same `CALL …` lie.

### B5. CHANGELOG.md `[Unreleased]` already shipped in v0.5.1
- 14 bullets sit under `[Unreleased]` (CHANGELOG.md:8-29) including the BENCHMARKS 0.4.0→0.5.1 sweep (`aff476f`), SECURITY/SPEC/skills version bumps, and even the meta-bullet describing splitting the `[0.5.1]` section. These are version-stamping things that already shipped in v0.5.1 and do not belong under Unreleased. Either v0.5.1's `### Fixed` is incomplete by ~10 entries, or Unreleased should be empty.

### B6. BENCHMARKS.md mislabels the measurement commit's version
- BENCHMARKS.md top-of-doc asserts: "the workspace bumped 0.4.0 → 0.5.0 → 0.5.1 carrying only install-script repair, binding bumps, and changelog-policy commits. Zero perf-relevant code changed in this window."
- Reality: `git log v0.4.0..v0.5.1 -- crates/ogdb-core crates/ogdb-cypher crates/ogdb-eval` returns **49 commits**, including the doc's own §1 self-described HNSW-rebuild gates (`6caf8c1` C2-A5 rebuild gate, `d85b665` core-F2 skip on no-node touched, `4678625` C3-B4 restore, `9c878dc` C3-B3 ingest_document fix, `7c9a3a5` cross-platform FileExt). All three HNSW commits are tagged into `v0.5.0` (`git tag --contains 6caf8c1` returns `v0.5.0, v0.5.1`).
- Compounding: `baseline-2026-05-02.json` reports `binary.version=0.4.0` but `git_sha=1afcee3`, and `git tag --contains 1afcee3` returns `v0.5.0, v0.5.1` — the measurement commit is **45 commits past tag v0.4.0**, inside the v0.5.0 history. Calling these "0.4.0 N=5 numbers carried forward" is what the binary self-reports but is not what the tree actually was.

---

## HIGH — drift, dead commands, broken cells

### Cypher reference docs ship 37 snippets with the wrong comment syntax
- `ogdb query` rejects SQL-style `-- comment`; only `// comment` is accepted.
- `grep -n '^-- ' inside ```cypher fences` finds **37 instances** across `DESIGN.md` (12), `SPEC.md` (11), `skills/opengraphdb/SKILL.md` (7), `skills/opengraphdb-v2/SKILL.md` (7). These are the docs a user copy-pastes from. Mechanical fix: `s/^-- /\/\/ /` inside cypher fences.

### Three different ports for the playground across three docs
- README:103 → "embedded UI on port 8080"
- QUICKSTART:14 → `http://localhost:8080/`
- `scripts/install.sh:188-193` banner → `http://127.0.0.1:${OGDB_PORT}/` with default `OGDB_PORT=8765`
- A user who installs via the curl path is told 8765; the docs they then read say 8080.

### npm package version drift
- `npm/cli/package.json` is `@opengraphdb/cli@0.4.0`. Binary, plugin, ogdb-cli crate, and BENCHMARKS doc all say 0.5.1. install.md path 4 (`npx @opengraphdb/cli init --agent`) installs a stale wrapper.

### Recipe 3 (doc-to-graph) response shape is fabricated
- COOKBOOK doc claims `/rag/ingest` returns `{document_id, entities_extracted, edges_extracted, duration_ms}`.
- Live response: `{content_count, document_node_id, reference_count, section_count, text_indexed, vector_indexed}`.
- Zero overlap in field names. Any sample code that parses the documented shape will fail.
- Same recipe documents `/query` rows as `[[2]]` (array-of-arrays); live shape is `[{"c":3}]` (array-of-objects, plus an undocumented `row_count`).

### WordNet recipe is largely unrunnable
- `documentation/recipes/wordnet-traversal.md`: 3 of 5 example queries fail with `unsupported query` or parse errors — variable-length `*1..15`, `MATCH p =`, plus plain undirected `(:Synset)-[:hypernymOf]-(:Synset)` patterns at lines 43/56/65. The page is presented as a runnable walkthrough; it is not.

### `ogdb reindex` documented but doesn't exist
- `DESIGN.md:1312` references `ogdb reindex` in present tense as a recovery fallback. `ogdb --help` lists no such subcommand.

### `ogdb demo` has no progress signal
- 10–25s silent run. No "loading MovieLens…", no completion banner. Combined with B1, the user has no way to tell whether they hit the broken query because they were impatient or because the database is genuinely loaded.

### Architectural-doc internal contradictions
- `SPEC.md §13.2` names the vector backend as **USearch**; `ARCHITECTURE.md §12 (Locked)` and `ogdb-core/src/lib.rs` doc-comment both name it as **`instant-distance`**. Code is the source of truth — SPEC is wrong.
- `SPEC.md §10` claims Bolt v1 is "Shipped" and v4/v5 is the next minor; `DESIGN.md §25` says v4/v5 is "v0.6.0 (slipped from v0.5)". Same facts, two pages, two different versions.

### One dead internal link
- `scripts/competitor-bench/README.md:4` → `../../documentation/.planning/neo4j-comparison/PLAN.md`. The `.planning/` directory is `.gitignore`'d; the link breaks for any reader.

### CHANGELOG compare-link footer is stale
- CHANGELOG.md:634-640 footer says `<not-yet-pushed: tag exists locally...>` for v0.5.1/v0.5.0/v0.4.0/v0.3.0. `gh release list` confirms v0.5.0 and v0.5.1 are both pushed. v0.4.0 and v0.3.0 have git tags but no GitHub Release.

### Onboarding 5-minute claim is not credible
The README sells a 5-minute Quickstart. End-to-end test:
1. `curl | sh` — works.
2. `ogdb demo` — silent for 10–25s.
3. Try the README's MovieLens query — **zero rows**.
4. Discover the port banner says 8765 but the docs say 8080.
5. Re-read `--help`, see binary calls itself `opengraphdb` and points at `openGraphDB/openGraphDB` repo — not the one you cloned from.
6. Reach for the SKILL.md guidance to recover, hit B3 lies.
7. Fall back to QUICKSTART's friends.ttl path — that one works. (See OBSERVATIONS.)

The friends-graph QUICKSTART is the only path that runs end-to-end today. Everything else is at least one BLOCKER short.

---

## OBSERVATIONS — cosmetic / future-watch

- All 14 OGDB cells in BENCHMARKS § 2 round-trip cleanly against `baseline-2026-05-02.json` (verified row-by-row). Likewise §2.2 cells round-trip against `scripts/competitor-bench/results-2026-05-05/summary.json`. The numbers themselves are not fabricated — what's mis-labelled is the **version** they belong to (B6).
- 0.3.0→0.4.0 delta table inside BENCHMARKS rounds correctly against `baseline-2026-04-25.json`. Methodology claims (`multi_iter.rs::run_warmup_pass`, `median_aggregate` lower-median, `percentiles_extended` nearest-rank, governor probe + warning, `OGDB_EVAL_BASELINE_ITERS=5` default) all verified against code.
- COOKBOOK Recipes 1, 2, 4 (browse_schema/MCP, /rag/search, temporal_diff/AT TIME) PASS end-to-end as documented.
- `crates/` count is consistent: 18 dirs in `crates/`, 18 entries in `Cargo.toml [workspace] members`, 18 entries in DESIGN.md's tree, 18 in DESIGN.md's cargo block, README's "18-crate workspace map" is accurate.
- `IMPLEMENTATION-READY.md` is self-marked at line 3-6 as `Status: historical` — labelled honestly, could be deleted to reduce surface but it's not pretending to be current.
- `ogdb-core` has `#![warn(missing_docs)]` paired with `#![allow(missing_docs)]` and a self-declared **"CYCLE4-DOC-RATCHET: 290 pub items remain undocumented"**. There is no dedicated public-API reference for embed users. `docs.rs/ogdb-core` will render as a wall of signature-only items.
- `id(n)` returns `string:null` silently rather than erroring — agents won't notice.
- Variable-length `[*1..3]` works on simple chains but `[*2]` doesn't (per BENCHMARKS §2.2 footnote). The matcher is inconsistent — worth a focused gate.
- DESIGN.md is 2550 lines with several "Reality check (0.4.0)" inline retrofits (lines 60-83, 1570-1608, 2168-2180). Doing real work but at this volume reads as project archaeology; folding history into a "Decisions retired" appendix would shrink ~30%.
- CHANGELOG bullets at lines 10/11/51/52 each exceed 600 words with embedded SHAs — contributor-log voice, not a user-facing changelog.
- No TODO/FIXME/XXX/HACK markers in any user-facing doc. Clean on that axis.

---

## Top 10 fix list

Ordered by user-visible damage and ease of fix.

1. **(B1) Fix the MovieLens demo query.** Either repair label-pattern matching against the seeded data, or change the README headline query to one that returns rows on the demo DB. This is the very first thing every user runs.
2. **(B3) Repair SKILL.md.** Drop or fix `serve --mcp` (line 117), the broken aggregation example (170-171), the `agent_store_episode` schema (247), and the UNION/EXISTS claims (149). Every Claude/Cursor session loads this file.
3. **(B4) Stop documenting `CALL vector.create_index(...)` / `CALL text.create_index(...)`** in MIGRATION-FROM-NEO4J.md and COOKBOOK Recipe 6. Either implement `CALL` or replace those rows with the actual MCP / HTTP path users must take.
4. **(B2) Reconcile binary identity.** Pick one of `ogdb` / `opengraphdb` for the binary `--help` text and the after_help footer URL. Fix in the `clap` setup, not in docs.
5. **(B5) Empty `[Unreleased]`.** Move shipped entries into `[0.5.1]`. Cut a `[0.5.2]` section if there's truly something pending. The current state suggests the changelog is no longer trusted.
6. **(B6) Re-label or re-baseline BENCHMARKS.** Either delete the "0.4.0 carry-forward" framing and call them "pre-0.5.0 N=5", or run a real N=5 at `git rev-list -n 1 v0.5.1` and republish.
7. **HIGH-1 (37 SQL `-- ` comments).** Mechanical sweep `s/^-- /\/\/ /g` inside cypher fences across SPEC.md, DESIGN.md, both SKILL.md files.
8. **HIGH-3 (npm `@opengraphdb/cli` 0.4.0 → 0.5.1).** One-line bump in `npm/cli/package.json`; the install path documented in install.md is currently shipping stale code.
9. **Fix Recipe 3's response shape.** Either rewrite COOKBOOK Recipe 3 to match the live `{content_count, document_node_id, …}` envelope, or change the API to match the doc.
10. **Pick one playground port.** Reconcile README:103 (8080), QUICKSTART:14 (8080), and `install.sh` banner (8765). The install banner is the one a user sees first, so update the docs to match the banner — or change the default port to 8080.
