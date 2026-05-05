# EVAL-DOCS-COMPLETENESS-CYCLE18

- **Workspace HEAD:** `91ee552` (origin/main, post cycle-17's seven-commit fix-set: `64929c8` BENCHMARKS row-scope prose, `b5bf977` CI gate-wiring + structural meta-meta-test, `0061176` Bolt v0.5 follow-up → v0.6.0 + structural gate, `b5d10c9` README simplify + drop Neo4j table + ship QUICKSTART.md, `463c3d0` CHANGELOG `docs/`→`documentation/` path fix + path-resolution gate, `e585f66` BENCHMARKS verdict-legend tone-down, `91ee552` install.sh demo-claim correction across 4 files).
- **Worktree:** a fresh detached worktree off `origin/main`.
- **Reviewer scope:**
  1. Confirm the four cycle-17 HIGHs (F01 Bolt follow-up, F02 CHANGELOG path drift, F03 BENCHMARKS row-scope prose, F04 npm-URL gate not in CI) are mechanically closed by the cycle-17 fix-set.
  2. Audit the seven cycle-17 commits for new drift — README simplification (`b5d10c9`) dropping the dense Neo4j table (orphan refs?), QUICKSTART.md anchor + version-stamp consistency (new file), BENCHMARKS verdict-legend tone-down side-effects (`e585f66` introduced new vocabulary — "DIRECTIONAL INDICATOR (pending apples-to-apples)" + restructured 3 wins → 1 verified + 2 caveated; check whether downstream docs mirror this), and verify that install.sh demo-claim correction (`91ee552`) propagated across **every** doc surface the post-install workflow touches.
  3. Re-status cycle-17's MEDIUMs (F05–F08) and LOWs (F09–F10) — none of them are touched by the cycle-17 commit list, so all are carried forward.
- **Prior cycle report:** `git show origin/eval/c17-docs-b994aa7:documentation/EVAL-DOCS-COMPLETENESS-CYCLE17.md` — 0B + 4H + 4M + 2L. The 4 HIGHs are mechanically closed (verified below); the 4 MEDIUMs + 2 LOWs are unchanged.

## Methodology

In-tree gates first (every one passes; this report enumerates drift the gates do not yet cover):

- `bash scripts/check-public-doc-tmp-leak.sh` → 0 hits
- `bash scripts/check-design-vs-impl.sh` → 0 hits
- `bash scripts/workflow-check.sh` → 0 hits
- `bash scripts/check-changelog-tags.sh` → 0 hits
- `bash scripts/check-benchmarks-version.sh` → "ok (0.5.1; headline + § 2 column header agree)"
- `bash scripts/check-followup-target-not-current.sh` → "ok (workspace=0.5.1; all 'vX.Y follow-up' tokens name a future minor)"
- `bash scripts/check-changelog-paths.sh` → "ok (12 unique doc paths checked; all resolve or whitelisted)"
- `bash scripts/check-doc-anchors.sh` → 0 hits
- `bash scripts/check-doc-rust-blocks.sh` → "OK — all extracted runnable blocks compile"
- `bash scripts/check-shipped-doc-coverage.sh` → "OK"
- `bash scripts/check-binding-readmes.sh` → "ok"
- `bash scripts/check-skills-copilot-removed.sh` → 0 hits
- `bash scripts/test-all-check-scripts-wired.sh` → "ok (every scripts/check-*.sh is referenced from scripts/test.sh)"

Cycle-17 closure verification:

- **F01 (Bolt v0.5 follow-up → v0.6.0)**: `0061176` swept three file targets + added `scripts/check-followup-target-not-current.sh` structural gate; `git grep -nE 'v0\.5 follow-up' documentation/ SPEC.md DESIGN.md ARCHITECTURE.md README.md CHANGELOG.md` returns 0 hits. Closed.
- **F02 (CHANGELOG `docs/` → `documentation/` path drift)**: `463c3d0` corrected the two `[0.4.0]` bullet paths + added `scripts/check-changelog-paths.sh` whitelist gate; the gate now passes, asserting every `(docs|documentation)/[A-Z][^[:space:]]+\.md` reference resolves or is whitelisted. Closed.
- **F03 (BENCHMARKS row-scope headline drift)**: `64929c8` bumped L5 + L154 from "rows 3, 4, 5, 6, 10" → "all 14 rows" + recorded the cycle-9/cycle-15/cycle-16 attribution; `check-benchmarks-version.sh` was tightened to assert headline + table-column-header agreement. Closed.
- **F04 (npm-URL gate not wired into CI)**: `b5bf977` added `scripts/check-npm-package-github-url.sh` + `scripts/test-check-npm-package-github-url.sh` lines to `scripts/test.sh` and shipped `scripts/test-all-check-scripts-wired.sh` — a structural meta-meta-test that fails if any `scripts/check-*.sh` is unreferenced from `scripts/test.sh`. The meta-meta-test passes. Closed and is now self-policing.

Then audited the seven cycle-17 commits for new drift:

- `b5d10c9` (README simplify) — dropped the dense 7-row Neo4j-vs-OpenGraphDB table from `README.md` and added `documentation/QUICKSTART.md` (new file). I grepped `README.md` + `documentation/` + `skills/` for orphan references to the dropped table ("Why OpenGraphDB instead of Neo4j", "comparison table") — only `CHANGELOG.md:42` mentions it, and that bullet is the historical `[0.4.0]` `### Added` entry that *correctly* records what 0.4.0 shipped. No drift on that axis. **However**, the new files (`README.md` rewritten + `documentation/QUICKSTART.md` shipped) introduced **two HIGH-class drifts**: F03 (`ogdb init --agent claude` syntax taught in two places — `--agent` is a SetTrue boolean) and F04 (QUICKSTART § 2 still claims the install.sh-seeded demo "ships with a small movies dataset" — directly contradicts the simultaneous `91ee552` correction).
- `e585f66` (BENCHMARKS verdict tone-down) — touched only `documentation/BENCHMARKS.md`. Audited the three downstream surfaces that mirror the BENCHMARKS verdicts (`skills/opengraphdb/SKILL.md`, `skills/opengraphdb/references/benchmarks-snapshot.md`, `documentation/MIGRATION-FROM-NEO4J.md`) — none were updated. See F02. The verdict legend in BENCHMARKS now distinguishes "verified WIN", "caveated WIN", "DIRECTIONAL INDICATOR (pending apples-to-apples)", "scale-mismatched"; the skill bundle docs that get installed onto user agents and the public Neo4j-migration guide still speak in the cycle-15 vocabulary ("DIRECTIONAL WIN", "crushing", "3 wins / 2 losses / 6 novel").
- `91ee552` (install demo-claim correction) — explicit four-file sweep: `CHANGELOG.md`, `README.md`, `documentation/QUICKSTART.md` step §1, and `scripts/install.sh` (banner + bootstrap). The user instructed me to verify nothing was missed. **Two gaps:** (a) F04 — `documentation/QUICKSTART.md:46` (step §2, the "First connection" section) still tells the reader they will see a populated movies dataset on the install.sh-seeded file; (b) F01 — even after the four-file sweep, the *banner promise itself* is functionally broken: the path the install.sh banner directs the user to (`~/.opengraphdb/demo.ogdb`) is never actually populated by `ogdb demo` — `ogdb demo`'s default path is a *different* directory (`~/.ogdb/`, `crates/ogdb-cli/src/lib.rs:3728-3730`), and `ogdb demo <existing-path>` short-circuits the seed step at `lib.rs:3765`.
- `463c3d0` (CHANGELOG path fix) — diff inspected; matches advertised scope. No drift.
- `0061176` (Bolt follow-up sweep) — diff inspected. The structural gate (`scripts/check-followup-target-not-current.sh`) is scoped to the regex `\bv[0-9]+\.[0-9]+(\.[0-9]+)?[[:space:]]+follow-up\b` — it does not match adjacent idioms like "post-v0.5 task" or "next minor". So `documentation/SECURITY-FOLLOWUPS.md:26` (which uses "post-v0.5") is not protected by the new gate and is still drifted. (This is cycle-17 F08 carry-forward, which the gate's narrow scope leaves uncovered.)
- `b5bf977` (CI wire-in) — diff inspected; meta-meta-test now passes. No drift.
- `64929c8` (BENCHMARKS headline) — diff inspected. The L33 deltas-table attribution "(full audit, cycle-15)" was *not* extended even though the cycle-17 fix-set is logically the natural place to land that — that's cycle-17 F09 carry-forward.

Then cross-checked:

- `git grep -nE 'ogdb init --agent [a-z]+'` to find every documented invocation that treats `--agent` as taking a value: 2 hits in shipped docs (`README.md:44`, `documentation/QUICKSTART.md:124`), both added by `b5d10c9`. The CLI parses `--agent` as `ArgAction::SetTrue` (`crates/ogdb-cli/src/lib.rs:227-232`); the agent ID is selected by `--agent-id <ID>` (`lib.rs:240-246`). See F03.
- `crates/ogdb-cli/src/lib.rs::handle_demo` (L3757-3805) only seeds MovieLens when `!Path::new(&db_path).exists()` (L3765); `crates/ogdb-cli/tests/demo_subcommand.rs:64` only covers the fresh-tempdir path — the install.sh post-install path (file already exists, empty) is uncovered by tests. See F01.
- `git grep -nE '(DIRECTIONAL WIN|crushing|3 wins / 2 losses / 6 novel)'` — 4 hits in shipped docs (skills × 3 + MIGRATION × 1) all mirroring the pre-`e585f66` BENCHMARKS verdict vocabulary. See F02.

## Findings

### F01 — HIGH — `scripts/install.sh:178` + `:189` banner promises "run `ogdb demo` to load MovieLens + launch playground" but `ogdb demo` does **not** load MovieLens into the install.sh-created file — `ogdb demo`'s default path is `~/.ogdb/demo.ogdb` while install.sh creates `~/.opengraphdb/demo.ogdb`, and `ogdb demo <existing-path>` short-circuits the seed step

- **Severity:** HIGH. **New drift introduced by cycle-17 `91ee552`.** The four-file sweep correctly described the new install-time *invariant* ("creates an empty database; run `ogdb demo` afterward") but did not verify the post-install workflow actually achieves what the banner promises. Two compounding bugs in the cycle-17 banner text:

  1. **Path mismatch between install.sh and `ogdb demo`.** `scripts/install.sh:17` defaults `OGDB_HOME=$HOME/.opengraphdb` and creates `~/.opengraphdb/demo.ogdb`. `crates/ogdb-cli/src/lib.rs:3728-3731` defines `default_demo_db_path()` as `format!("{home}/.ogdb/demo.ogdb")` (note: `.ogdb`, *not* `.opengraphdb`). So when the user copy-pastes `ogdb demo` from the banner, the seed lands at a *different* directory; install.sh's `$OGDB_HOME/demo.ogdb` stays empty.

  2. **`ogdb demo <existing-path>` skips the seed.** Even if the user passes the install.sh path explicitly (`ogdb demo ~/.opengraphdb/demo.ogdb`), `crates/ogdb-cli/src/lib.rs:3765` (`if !Path::new(&db_path).exists()`) short-circuits the seed step because `ogdb init` already created the file. Result: `handle_serve_http` runs on an empty file; the playground opens to an empty graph.

  Both ways, the banner promise — that running `ogdb demo` after install loads MovieLens into the empty database the banner just announced — is impossible to fulfill without manual file deletion (`rm ~/.opengraphdb/demo.ogdb` first, then `ogdb demo ~/.opengraphdb/demo.ogdb`). The cycle-17 sweep fixed the *announcement* of what install.sh produces but introduced a contradiction with `ogdb demo`'s actual behavior.

- **Locations:**
  ```
  scripts/install.sh:17       OGDB_HOME="${OGDB_HOME:-$HOME/.opengraphdb}"
  scripts/install.sh:178      c_grn "creating empty demo database at $OGDB_HOME/demo.ogdb (run \`ogdb demo\` to load MovieLens + launch playground)"
  scripts/install.sh:189          database    $OGDB_HOME/demo.ogdb (empty — run \`ogdb demo\` to load MovieLens + launch playground)
  README.md:39                This drops the `ogdb` binary at `~/.local/bin/ogdb` and creates a fresh empty database at `~/.opengraphdb/demo.ogdb`. Run `ogdb demo` afterward to load the MovieLens dataset and open the playground in your browser.
  documentation/QUICKSTART.md:11  One line installs the binary, drops it on your `PATH`, and creates a fresh empty demo database (run `ogdb demo` afterward to load the MovieLens dataset and launch the playground)
  crates/ogdb-cli/src/lib.rs:3728-3731  fn default_demo_db_path() { let home = std::env::var("HOME") ...; format!("{home}/.ogdb/demo.ogdb") }
  crates/ogdb-cli/src/lib.rs:3765       if !Path::new(&db_path).exists() {  /* seed only here */
  crates/ogdb-cli/tests/demo_subcommand.rs:64  fresh-tempdir test only — does not exercise the install.sh post-install state
  ```
- **Verified:**
  ```
  $ grep -n "OGDB_HOME=" scripts/install.sh
  17:OGDB_HOME="${OGDB_HOME:-$HOME/.opengraphdb}"
  $ grep -nE 'fn default_demo_db_path|format!.*demo.ogdb' crates/ogdb-cli/src/lib.rs
  3728:fn default_demo_db_path() -> String {
  3730:    format!("{home}/.ogdb/demo.ogdb")
  ```
  `~/.opengraphdb/` ≠ `~/.ogdb/`. The `ogdb demo` test (`crates/ogdb-cli/tests/demo_subcommand.rs:64`) creates a fresh `tempfile::tempdir()` and asserts MovieLens labels appear; there is no companion test exercising "demo runs against an already-existing empty file" — the actual install.sh post-install state.

- **Patch sketch:** Two fixes (one each side):

  1. *Make the install.sh banner truthful by making `ogdb demo` re-seed empty databases.* In `crates/ogdb-cli/src/lib.rs::handle_demo`, replace the `!Path::new(&db_path).exists()` short-circuit with a "seed if file doesn't exist OR is freshly-init'd-empty" check (e.g. `node_count == 0 && edge_count == 0`). Add a regression test:
     ```rust
     // crates/ogdb-cli/tests/demo_subcommand.rs
     #[test]
     fn demo_seeds_into_existing_empty_init_file() {
         let dir = tempfile::tempdir().unwrap();
         let db = dir.path().join("demo.ogdb");
         // Pre-create empty via ogdb init (matches install.sh path).
         Command::new(env!("CARGO_BIN_EXE_ogdb")).args(["init", &db.display().to_string()]).status().unwrap();
         // Now `ogdb demo <path>` must populate it.
         /* spawn ogdb demo, hit /schema, assert Movie + Genre labels present */
     }
     ```

  2. *Align install.sh and `ogdb demo` on the same demo path.* Either change `default_demo_db_path()` to `~/.opengraphdb/demo.ogdb` (matching install.sh's `OGDB_HOME`), or change install.sh to write to `~/.ogdb/demo.ogdb` (matching the binary default). The second is a smaller diff. Add a new gate:
     ```bash
     # scripts/check-install-demo-path-matches-binary-default.sh
     INSTALL_PATH=$(grep -oE 'OGDB_HOME="?\$\{OGDB_HOME:-\$HOME/[^}"]+' scripts/install.sh | head -1 | sed 's|.*\$HOME/||')
     BINARY_DEFAULT=$(grep -oE 'format!\("\{home\}/[^"]+' crates/ogdb-cli/src/lib.rs | head -1 | sed 's|.*\{home\}/||' | sed 's|/demo.ogdb||')
     [[ "$INSTALL_PATH" == "$BINARY_DEFAULT" ]] || { echo "drift: install.sh OGDB_HOME=$INSTALL_PATH but ogdb default=$BINARY_DEFAULT"; exit 1; }
     ```
     and wire into `scripts/test.sh` so the cycle-17 91ee552 promise is mechanically pinned.

  Either fix alone closes the user-visible gap; the gate stops it from regressing.

---

### F02 — HIGH — Cycle-17 `e585f66` toned down the BENCHMARKS verdict legend (DIRECTIONAL WIN → DIRECTIONAL INDICATOR (pending apples-to-apples), dropped "crushing" language, restructured the scorecard from "3 wins / 2 losses / 6 novel" to "1 verified WIN / 2 caveated WIN / 2 losses / 6 novel-or-directional") but did **not** propagate to the four downstream surfaces that mirror the verdicts; the skill bundle that gets installed onto user agents now contradicts the public BENCHMARKS sheet

- **Severity:** HIGH. **New drift introduced by cycle-17 `e585f66`.** The skill bundle (`skills/opengraphdb/SKILL.md` + `references/benchmarks-snapshot.md`) is what `ogdb init --agent` writes into the user's Claude / Cursor / Aider config; the public Neo4j-migration guide is what a Neo4j-shop reader reaches first. After `e585f66`, all four surfaces speak in the cycle-15 vocabulary that BENCHMARKS itself has explicitly retracted. A user asking their agent "is OpenGraphDB faster than Neo4j on point reads?" gets back "DIRECTIONAL WIN — 80× under Memgraph p99, 2 000× under Neo4j" from the skill snapshot, while the same row in BENCHMARKS now says "DIRECTIONAL INDICATOR (pending apples-to-apples) — until then this is a lower-bound feasibility signal, not a verified WIN". This is the same drift class as cycle-15 F02 / cycle-16 F08 / cycle-17 F03 — partial sweep with stale companion docs — but at the highest reader-impact tier (agent-facing).

- **Locations:**
  ```
  skills/opengraphdb/SKILL.md:285
    | Graph-feature rerank batch p95 (100 candidates × 1-hop) | **1.35 μs** (153 μs/batch) | p95 < 50 ms | ✅ crushing — 27 000× under bar |

  skills/opengraphdb/references/benchmarks-snapshot.md:25
    | 3 | Point read `neighbors()` p50/p95/p99 @ 10k nodes, cold | **7.1 / 11.2 / 13.4 μs** (119k qps) | p95 < 5 ms (SF10 warm) | ⚠️ DIRECTIONAL WIN — 80× under Memgraph Pokec p99, 2 000× under Neo4j. Scale mismatch: Pokec is 1.6M nodes; we ran 10k. |

  skills/opengraphdb/references/benchmarks-snapshot.md:26
    | 4 | 2-hop traversal p50/p95/p99 @ 10k nodes, cold | **8.6 / 17.2 / 18.1 μs** (90k qps) | p95 < 100 ms | ⚠️ DIRECTIONAL WIN — clears SF10 IC threshold by 3 000×. |

  skills/opengraphdb/references/benchmarks-snapshot.md:46
    Strict bucketing: **3 wins / 2 losses / 6 novel.**

  documentation/MIGRATION-FROM-NEO4J.md:121-152
    ## 5. Performance characteristics — wins and losses
    Numbers below are verbatim from `documentation/BENCHMARKS.md` Section 2 ...
    **Wins (apples-to-apples or clears spec threshold):** [lists rows 7, 10, 13]
    ...
    **Honesty footer.** BENCHMARKS rows 3, 4, 5, 11, and 12 are scale-mismatched ...
  ```
  Also note: rows 3 and 4 in `benchmarks-snapshot.md` carry **stale numerics** in addition to stale verdicts — `7.1 / 11.2 / 13.4 μs` and `8.6 / 17.2 / 18.1 μs` are the cycle-15-or-earlier figures, while BENCHMARKS § 2 (post `f72f7cd` + `cf97159`) now reports `5.8 / 6.8 / 11.8 μs` (row 3) and `22.9 / 25.8 / 36.0 μs` (row 4). The snapshot doc was last touched alongside cycle-15's `cf0bbdb` rebaseline but the row 3/4 cells did not move with the row 7-14 sweep, and cycle-16 `f72f7cd`'s row 1+2 rebaseline likewise didn't touch the snapshot.

- **Verified:**
  ```
  $ git grep -nE '(DIRECTIONAL WIN|crushing|3 wins / 2 losses / 6 novel)' \
        documentation/ skills/ README.md SPEC.md DESIGN.md ARCHITECTURE.md CHANGELOG.md \
        ':!documentation/EVAL-*'
  documentation/MIGRATION-FROM-NEO4J.md:126:**Wins (apples-to-apples or clears spec threshold):**
  skills/opengraphdb/SKILL.md:285:... | ✅ crushing — 27 000× under bar |
  skills/opengraphdb/references/benchmarks-snapshot.md:25:... | ⚠️ DIRECTIONAL WIN — 80× under Memgraph ...
  skills/opengraphdb/references/benchmarks-snapshot.md:26:... | ⚠️ DIRECTIONAL WIN — clears SF10 IC threshold by 3 000×. |
  skills/opengraphdb/references/benchmarks-snapshot.md:46:Strict bucketing: **3 wins / 2 losses / 6 novel.**
  ```
  And current BENCHMARKS verdict legend (`documentation/BENCHMARKS.md:107`):
  > Verdict legend: ✅ win / ❌ loss / 🟡 novel / 🟡 directional indicator (smaller-tier signal, not apples-to-apples) / ⚠️ scale-mismatched

- **Patch sketch:**
  1. *Sweep skill bundle* (the file that `ogdb init --agent` actually deposits into `~/.claude/skills/opengraphdb/`):
     - `skills/opengraphdb/SKILL.md:285` — replace "✅ crushing — 27 000× under bar" with the cycle-17 row 10 wording: "✅ caveated WIN — clears competitive bar by orders of magnitude; boost is synthetic Σ neighbour_id, not learned dot-product".
     - `skills/opengraphdb/references/benchmarks-snapshot.md:25-26` — both numbers and verdicts: replace with current row 3/4 figures from BENCHMARKS § 2 (5.8/6.8/11.8 μs, 22.9/25.8/36.0 μs) and the new "🟡 DIRECTIONAL INDICATOR (pending apples-to-apples)" verdict text.
     - `skills/opengraphdb/references/benchmarks-snapshot.md:46` — replace "3 wins / 2 losses / 6 novel" with "1 verified WIN / 2 caveated WIN / 2 losses / 6 novel-or-directional" matching the post-`e585f66` BENCHMARKS § 2.1 scorecard.
  2. *Sweep MIGRATION-FROM-NEO4J*:
     - L126 — change section heading "Wins (apples-to-apples or clears spec threshold)" → "Wins (1 verified, 2 caveated)" and split the row list: 13 → verified; 7 + 10 → caveated.
     - L149 — extend the honesty footer from "rows 3, 4, 5, 11, and 12 are scale-mismatched" to disambiguate the new BENCHMARKS distinction: rows 3+4 are "directional-indicator (pending apples-to-apples at SF10)"; rows 5, 11, 12 are "scale-mismatched (mini fixtures)".
  3. *Add a structural gate* (`scripts/check-benchmarks-vocabulary-mirror.sh`): assert that any token in {`DIRECTIONAL WIN`, `crushing`, `3 wins / 2 losses / 6 novel`} appears in **either zero files** (closed) **or every BENCHMARKS-mirroring file** (intentional historical quote with `<!-- HISTORICAL -->` marker). This is the same generalized "partial-sweep" pattern cycle-17 F03 caught — the gate generalizes to any verdict-vocabulary refresh.

---

### F03 — HIGH — `README.md:44` + `documentation/QUICKSTART.md:124` teach `ogdb init --agent claude` syntax — but `--agent` is a SetTrue boolean flag (`crates/ogdb-cli/src/lib.rs:227-232`); the agent ID is selected by `--agent-id <ID>`; the literal command treats `claude` as a database file path

- **Severity:** HIGH. **New drift introduced by cycle-17 `b5d10c9`.** The README is the project landing page and the QUICKSTART is a pinned five-minute walkthrough — first-time-user copy-paste targets. The taught syntax silently does the wrong thing: `--agent` is parsed as a boolean (turn agent-setup mode on), and the trailing `claude` token slots into the `path: Option<String>` positional slot of `InitCommand` (`lib.rs:217`), which then flows into `init_agent::InitAgentOpts::db` (`lib.rs:986`). The user's `~/.opengraphdb/demo.ogdb` (or whatever was wired by install.sh) is silently replaced as the target database — the agent setup runs against a database file at literal path `./claude`, which doesn't exist, so `init_agent` either errors or creates one in CWD depending on how it handles the missing-file case. Either failure mode is confusing.

  Reader-impact is direct: a user copy-pastes from the README, runs `ogdb init --agent claude`, and either gets an error, a stray `./claude` file in their CWD, or a mis-targeted MCP registration. The README's inline comment "# or: cursor, aider, goose" explicitly invites the reader to swap the value, locking in the misconception that `--agent` takes an enum.

- **Locations:**
  ```
  README.md:44                           ogdb init --agent claude   # or: cursor, aider, goose
  documentation/QUICKSTART.md:124        ogdb init --agent claude
  crates/ogdb-cli/src/lib.rs:227-232     #[arg(long, action = ArgAction::SetTrue, ...)] agent: bool,
  crates/ogdb-cli/src/lib.rs:240-246     #[arg(long = "agent-id", value_name = "ID", requires = "agent", help = "With --agent, force a specific agent id (claude, cursor, aider, continue, goose, codex)")] agent_id: Option<String>,
  crates/ogdb-cli/src/lib.rs:983-994     match command { Commands::Init(cmd) => { if cmd.agent { let opts = init_agent::InitAgentOpts { db: cmd.path.or_else(...), ..., agent_id: cmd.agent_id, ... };  ... } }
  ```
- **Verified:**
  ```
  $ grep -nE 'ogdb init --agent [a-z]+' \
        README.md documentation/ skills/ npm/ scripts/ \
        ':!documentation/EVAL-*'
  README.md:44:ogdb init --agent claude   # or: cursor, aider, goose
  documentation/QUICKSTART.md:124:ogdb init --agent claude
  ```
  Other shipped invocations are correct: `npm/cli/README.md:11,15,47` use bare `ogdb init --agent`; `skills/opengraphdb/references/debugging.md:83` uses `ogdb init --agent --force`; `scripts/install.sh:205` uses `ogdb init --agent --port "$OGDB_PORT" --db "$OGDB_HOME/demo.ogdb"`. All correct because they treat `--agent` as a boolean.
- **Patch sketch:**
  ```diff
  --- a/README.md
  +++ b/README.md
  @@ -41,7 +41,7 @@
   ### 2. Wire your AI agent

   ```bash
  -ogdb init --agent claude   # or: cursor, aider, goose
  +ogdb init --agent --agent-id claude   # or: --agent-id cursor / aider / goose / continue / codex; omit --agent-id to auto-detect

  --- a/documentation/QUICKSTART.md
  +++ b/documentation/QUICKSTART.md
  @@ -121,7 +121,7 @@
   OpenGraphDB ships with a built-in integration so coding agents (Claude, Cursor, Aider, Goose) can query your graph for you. One command does the wiring:

   ```bash
  -ogdb init --agent claude
  +ogdb init --agent --agent-id claude   # or: omit `--agent-id` to auto-detect the first installed agent
   ```

  -Replace `claude` with `cursor`, `aider`, or `goose` as needed.
  +Replace `claude` with `cursor`, `aider`, `continue`, `goose`, or `codex` as needed; or drop `--agent-id` to wire the first detected agent.
  ```
  Add regression gate (`scripts/check-init-agent-syntax.sh`): grep every shipped `.md` for `ogdb init --agent\s+[a-z]+\b` (matches when the next token is a bareword, NOT another flag); assert zero hits (anything that follows `--agent` directly must be either nothing or another `-`-prefixed flag). Same template as `check-skills-copilot-removed.sh`. Wire into `scripts/test.sh`.

---

### F04 — HIGH — `documentation/QUICKSTART.md:46` § 2 step "First connection" still claims "The demo ships with a small movies dataset" — directly contradicts cycle-17 `91ee552`'s simultaneous correction in QUICKSTART step §1 (L11), which now says the install.sh-seeded file is empty

- **Severity:** HIGH. **Missed-sweep by cycle-17 `91ee552`.** The user prompt for this evaluation explicitly directed me to verify "install.sh demo-claim correction propagated everywhere (91ee552 swept 4 files; verify nothing was missed)". This is the missed file. `91ee552` corrected QUICKSTART step §1 (L11) from "seeds a demo database" → "creates a fresh empty demo database (run `ogdb demo` afterward to load the MovieLens dataset and launch the playground)" — but step §2 (L40-46), four lines below the corrected step §1, still tells the reader they will see populated movies-dataset output:

  > Open the demo database and ask it what's inside:
  > ```bash
  > ogdb info ~/.opengraphdb/demo.ogdb
  > ```
  > You'll see node counts, edge counts, and labels. **The demo ships with a small movies dataset.**

  A user who follows the QUICKSTART top-to-bottom: (a) sees step §1's corrected "creates a fresh empty demo database" message, (b) reaches step §2, (c) is told the same file "ships with a small movies dataset", (d) runs `ogdb info`, (e) sees `0 nodes / 0 edges / no labels` — directly contradicting step §2's claim. Same drift class as the four files cycle-17 91ee552 fixed; the cycle-17 reviewer caught the install.sh banner + README + CHANGELOG + QUICKSTART step §1 surface but missed QUICKSTART step §2 four lines below.

  This finding compounds with F01 — *even if* the user works around F01 by running `rm ~/.opengraphdb/demo.ogdb && ogdb demo ~/.opengraphdb/demo.ogdb`, step §2 of QUICKSTART would *then* correctly show populated output, but step §2 makes no mention of needing to run `ogdb demo` first; it simply asserts the dataset is there.

- **Location:** `documentation/QUICKSTART.md:38-46`
- **Verified:**
  ```
  $ grep -nE 'demo ships with|small movies dataset|ships with a small' \
        documentation/ README.md
  documentation/QUICKSTART.md:46:You'll see node counts, edge counts, and labels. The demo ships with a small movies dataset.
  ```
  Compared to the corrected QUICKSTART step §1 (L11) — which now explicitly says "fresh empty demo database (run `ogdb demo` afterward to load the MovieLens dataset and launch the playground)" — and to install.sh L189 banner — which now explicitly tags the file as "(empty — run `ogdb demo` to load MovieLens + launch playground)" — L46 is the one surface that still asserts "ships with" populated data.

- **Patch sketch:**
  ```diff
  --- a/documentation/QUICKSTART.md
  +++ b/documentation/QUICKSTART.md
  @@ -38,15 +38,18 @@
   ## 2. First connection

  -Open the demo database and ask it what's inside:
  +Once you've run `ogdb demo` (per Step 1 above) to load the MovieLens dataset, you can ask the demo database what's inside:

   ```bash
   ogdb info ~/.opengraphdb/demo.ogdb
   ```

  -You'll see node counts, edge counts, and labels. The demo ships with a small movies dataset.
  +You'll see node counts, edge counts, and labels — the MovieLens dataset that `ogdb demo` just loaded. (If you skipped `ogdb demo`, this command will show 0 nodes / 0 edges; run `ogdb demo` first.)

  -For a more interactive experience, start the server:
  +`ogdb demo` already started a server for you on `http://localhost:8080/`. If you want to re-launch the playground later (without re-seeding):

   ```bash
   ogdb serve --http ~/.opengraphdb/demo.ogdb
   ```
  ```
  Add to the `scripts/check-changelog-paths.sh` family: a sibling `scripts/check-quickstart-demo-claim.sh` that asserts `documentation/QUICKSTART.md` does not contain the substring "ships with a small movies dataset" (the cycle-17 91ee552 sweep removed equivalent strings from the four siblings; this one needs the same rule).

---

### F05 — MEDIUM — `documentation/COMPATIBILITY.md:44` still says "Future releases add a v0.5.0 fixture beside it" — v0.5.0 fixture exists since cycle-15

- **Carry-forward from cycle-17 F05 — not addressed by any cycle-17 commit.** Severity unchanged: the v0.5.0 fixture file `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` exists and is verified; the prose contradicts shipped state. Patch sketch identical to cycle-17 F05.

---

### F06 — MEDIUM — `documentation/COMPATIBILITY.md:94` § 6 release-time enforcement runbook only enumerates `upgrade_fixture_v0_4_0_opens_on_current` — v0.5.0 fixture not in the runbook

- **Carry-forward from cycle-17 F06 — not addressed by any cycle-17 commit.** Patch sketch identical to cycle-17 F06.

---

### F07 — MEDIUM — `documentation/COMPATIBILITY.md:3` doc-level Status stamp still says "active as of v0.4.0 · 2026-05-01"; § 3 examples were advanced 0.4.* → 0.5.* in cycle-15 `c904418` without bumping the stamp

- **Carry-forward from cycle-17 F07 — not addressed by any cycle-17 commit.** Patch sketch identical to cycle-17 F07. The post-cycle-17 stamp should read e.g. "active as of v0.5.1 · 2026-05-05 (last reviewed cycle-18; cycle-17 closed all four HIGHs flagged in cycle-16 + cycle-17)".

---

### F08 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md:26` release-notes blockquote still reads "tracked as a post-v0.5 task"; cycle-17 `0061176` swept the `vX.Y follow-up` idiom but its structural gate doesn't catch the adjacent `post-vX.Y` idiom

- **Carry-forward from cycle-17 F08 — not addressed by any cycle-17 commit.** Notable cycle-17 attribution: `0061176`'s structural gate (`scripts/check-followup-target-not-current.sh`) is regex-scoped to `\bv[0-9]+\.[0-9]+(\.[0-9]+)?[[:space:]]+follow-up\b` — which matches "v0.5 follow-up" but **not** "post-v0.5 task". The gate is correct for the F01 case it was built for; it just doesn't generalize to this adjacent idiom. Tighten the gate's regex alternation:
  ```diff
  -PATTERN='\bv[0-9]+\.[0-9]+(\.[0-9]+)?[[:space:]]+follow-up\b'
  +PATTERN='\b(v|post-v)[0-9]+\.[0-9]+(\.[0-9]+)?([[:space:]]+(follow-up|task|item))?\b'
  ```
  with a same-or-future-minor assertion. Then sweep the L26 prose to "v0.6.0 task (slipped from the original v0.5 target)".

---

### F09 — LOW — `documentation/BENCHMARKS.md:33` deltas-table header attribution "(full audit, cycle-15)" is stale — cycle-16 `f72f7cd` extended the table with rows 1+2 and cycle-17 made no further extension; the natural cycle to update it was cycle-17

- **Carry-forward from cycle-17 F09 — not addressed by any cycle-17 commit.** Bookkeeping drift. Patch sketch identical to cycle-17 F09:
  ```diff
  -> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15).** The
  +> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15 + cycle-16).** The
  ```

---

### F10 — LOW — `frontend/e2e/qa-followups.spec.ts:3` cites a private scratch-worktree QA-REPORT.md path under a tempdir-style prefix — gate scope (`scripts/check-public-doc-tmp-leak.sh`) doesn't cover `frontend/e2e/`

- **Carry-forward from cycle-17 F10 — not addressed by any cycle-17 commit.** Reader-impact bounded; either drop the path-citation, move the audit report to `documentation/audits/`, or extend `scripts/check-public-doc-tmp-leak.sh` to also cover `frontend/e2e/`.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 4     | F01, F02, F03, F04 |
| MEDIUM   | 4     | F05, F06, F07, F08 |
| LOW      | 2     | F09, F10 |

### Severity changes vs. cycle-17

- **Closed in cycle-17:** F01 (Bolt v0.5 follow-up → v0.6.0, by `0061176` + structural gate), F02 (CHANGELOG `docs/`→`documentation/` path drift, by `463c3d0` + path-resolution gate), F03 (BENCHMARKS row-scope headline drift, by `64929c8` + tightened gate), F04 (npm-URL gate not in CI, by `b5bf977` + structural meta-meta-test). All four mechanically verified — gates pass; grep finds zero residual hits.
- **New HIGH (cycle-17-introduced by `91ee552`):** F01 (this report) — install.sh banner promises `ogdb demo` will load MovieLens but the path mismatch (`~/.opengraphdb/` vs `~/.ogdb/`) and the `!exists()` guard make this impossible to fulfill.
- **New HIGH (cycle-17-introduced by `e585f66`):** F02 (this report) — BENCHMARKS verdict tone-down didn't propagate to skill bundle (3 hits) + MIGRATION-FROM-NEO4J (1 hit); agents installed via `ogdb init --agent` now answer with vocabulary BENCHMARKS itself has retracted.
- **New HIGH (cycle-17-introduced by `b5d10c9`):** F03 (this report) — README + QUICKSTART teach `ogdb init --agent claude` syntax that isn't supported by the CLI parser; `--agent` is a boolean flag.
- **New HIGH (cycle-17-introduced — missed-sweep in `91ee552`):** F04 (this report) — QUICKSTART step §2 still claims "demo ships with a small movies dataset" four lines below the cycle-17-corrected step §1.
- **Carry-forward MEDIUMs:** F05–F08 unchanged from cycle-17 F05–F08; cycle-17 took no action on these. F08's gap is partially explained by `0061176`'s narrowly-scoped regex (matches `vX.Y follow-up` but not `post-vX.Y task`).
- **Carry-forward LOWs:** F09 (BENCHMARKS deltas attribution) + F10 (qa-followups.spec.ts /tmp leak) unchanged.

### Headline

Cycle-17 closed all four cycle-17 HIGHs cleanly (mechanical gates verify) and shipped two new structural meta-tests — the changelog-paths gate and the every-check-script-must-be-wired meta-meta-test — that genuinely advance the project's drift-resistance posture. **However, four of the seven cycle-17 commits introduced new HIGH-class drift of their own**, three of them in the project's most reader-facing surfaces (install.sh banner, README, QUICKSTART, agent-installed skill bundle). Three of the four new HIGHs are textbook cases of **partial sweep without companion-doc verification** — the same lesson cycle-15 → cycle-16 → cycle-17 has been repeating:

- `91ee552` swept four files but missed QUICKSTART step §2 (F04) and didn't verify that the post-install workflow it described actually works (F01).
- `e585f66` toned down BENCHMARKS but didn't propagate to the four downstream surfaces that mirror it (F02).
- `b5d10c9` shipped a new QUICKSTART that taught misparsed CLI syntax (F03), echoed in the simplified README — a syntax error that the cycle-17 reviewer would catch by `cargo run -p ogdb-cli -- init --agent claude` once.

**Process recommendation for cycle-19:** every cycle-17-style cross-file fix commit should land alongside (a) a *mirror-check gate* — assert the corrected text appears in every file the original drift was scattered across, with a documented `<!-- HISTORICAL -->` opt-out marker for legitimate historical references in CHANGELOG-style files, and (b) a *workflow-verification step* — whatever the doc claims the user will do, run that exact sequence in CI. The first generalizes cycle-17 F03's "partial-sweep" lesson into a structural pattern; the second would have caught F01 (`ogdb demo` against an existing-empty file) at the cycle-17 review pass.
