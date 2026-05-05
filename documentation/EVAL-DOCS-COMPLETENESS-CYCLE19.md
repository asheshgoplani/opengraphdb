# EVAL-DOCS-COMPLETENESS-CYCLE19

- **Workspace HEAD:** `6c17c3d` (origin/main, post cycle-18's three-commit fix-set: `1957b55` README + QUICKSTART `--agent-id` syntax + drop "demo ships with movies" contradiction; `28b49b6` skills + MIGRATION-FROM-NEO4J BENCHMARKS verdict tone-down + row 3/4 numerics; `6c17c3d` install.sh `OGDB_HOME` default `~/.opengraphdb` → `~/.ogdb` to match the binary, and `handle_demo` re-seeds an empty pre-existing init file).
- **Worktree:** a fresh detached worktree off `origin/main`.
- **Reviewer scope:**
  1. Confirm the four cycle-18 HIGHs (F01 install banner workflow gap; F02 BENCHMARKS verdict mirror; F03 `ogdb init --agent <bareword>` syntax; F04 QUICKSTART step §2 "demo ships with a small movies dataset" contradiction) are mechanically closed by the cycle-18 fix-set.
  2. Audit the three cycle-18 commits for new drift — primarily the `~/.opengraphdb` → `~/.ogdb` path bump in `6c17c3d` (does it propagate to **every** surface — README, CHANGELOG, QUICKSTART, init_agent.rs, skill bundle scripts, skill bundle references, DESIGN, npm/cli/README?), the verdict-tone-down propagation in `28b49b6` (does the new `1 verified WIN / 2 caveated WIN / 2 losses / 6 novel-or-directional` bucket agree across BENCHMARKS § 2.1 + skill snapshot + MIGRATION?), and the `--agent-id` syntax fix in `1957b55` (any other surface still teaching the bareword form?).
  3. Confirm the new gates the cycle-18 fix-set added catch what they advertise.
  4. Re-status cycle-18's MEDIUMs (F05–F08) and LOWs (F09–F10) — none of them are touched by the three cycle-18 commits, so all are carried forward.
- **Prior cycle report:** `git show origin/eval/c18-docs-91ee552:documentation/EVAL-DOCS-COMPLETENESS-CYCLE18.md` — 0B + 4H + 4M + 2L. The 4 HIGHs are mechanically closed (verified below); the 4 MEDIUMs + 2 LOWs are unchanged.

## Methodology

In-tree gates (every one passes):

- `bash scripts/check-public-doc-tmp-leak.sh` → 0 hits
- `bash scripts/check-design-vs-impl.sh` → 0 hits
- `bash scripts/workflow-check.sh` → 0 hits
- `bash scripts/check-changelog-tags.sh` → 0 hits
- `bash scripts/check-benchmarks-version.sh` → "ok (0.5.1; headline + § 2 column header agree)"
- `bash scripts/check-followup-target-not-current.sh` → "ok (workspace=0.5.1; all 'vX.Y follow-up' tokens name a future minor)"
- `bash scripts/check-changelog-paths.sh` → "ok (13 unique doc paths checked; all resolve or whitelisted)"
- `bash scripts/check-doc-anchors.sh` → 0 hits
- `bash scripts/check-doc-rust-blocks.sh` → "OK — all extracted runnable blocks compile"
- `bash scripts/check-shipped-doc-coverage.sh` → "OK"
- `bash scripts/check-binding-readmes.sh` → "ok"
- `bash scripts/check-skills-copilot-removed.sh` → 0 hits
- `bash scripts/test-all-check-scripts-wired.sh` → "ok (every scripts/check-*.sh is referenced from scripts/test.sh)"
- `bash scripts/check-install-demo-path-matches-binary-default.sh` (cycle-18 new) → "ok (install.sh OGDB_HOME=$HOME/.ogdb == binary default $HOME/.ogdb/demo.ogdb)"
- `bash scripts/check-benchmarks-vocabulary-mirror.sh` (cycle-18 new) → "ok (no unmarked legacy verdict vocabulary across BENCHMARKS mirror files)"
- `bash scripts/check-init-agent-syntax.sh` (cycle-18 new) → 0 hits

Cycle-18 closure verification:

- **F01 (install banner workflow gap)**: `6c17c3d` flipped `scripts/install.sh:17` from `${OGDB_HOME:-$HOME/.opengraphdb}` → `${OGDB_HOME:-$HOME/.ogdb}` (matching `crates/ogdb-cli/src/lib.rs::default_demo_db_path`'s `format!("{home}/.ogdb/demo.ogdb")`) **and** rewrote `crates/ogdb-cli/src/lib.rs::handle_demo` to seed when the file exists but is empty (`node_count == 0 && edge_count == 0`), not just when absent. New gate `scripts/check-install-demo-path-matches-binary-default.sh` pins the install.sh `OGDB_HOME` default to the binary `default_demo_db_path` directory. New regression test `crates/ogdb-cli/tests/demo_subcommand.rs::demo_seeds_into_existing_empty_init_file` exercises the install.sh post-install state ("file exists but is empty") and asserts MovieLens labels appear after `ogdb demo <path>`. Both halves verified mechanically. **Closed for the install.sh-driven workflow.** — but see F01 (this report) for the parallel `init_agent.rs::resolve_db_path` default that the path bump did not touch.
- **F02 (BENCHMARKS verdict mirror)**: `28b49b6` swept `skills/opengraphdb/SKILL.md:285` (rerank verdict crushing → caveated WIN), `skills/opengraphdb/references/benchmarks-snapshot.md:25-26` (rows 3, 4 numerics + verdicts), `:46` (scorecard), and rewrote `documentation/MIGRATION-FROM-NEO4J.md:121-152` (verified vs caveated split + two-class honesty footer). New `scripts/check-benchmarks-vocabulary-mirror.sh` asserts the four mirror files (BENCHMARKS, SKILL, snapshot, MIGRATION) carry zero unmarked occurrences of `DIRECTIONAL WIN` / `crushing` / `3 wins / 2 losses / 6 novel`; the gate reports 0 hits. Closed.
- **F03 (`ogdb init --agent <bareword>`)**: `1957b55` swept `README.md:44` and `documentation/QUICKSTART.md:124` from `--agent claude` → `--agent --agent-id claude` and shipped `scripts/check-init-agent-syntax.sh` (regex `ogdb init --agent[[:space:]]+[a-z][a-z0-9_-]*\b` across shipped `*.md`, EVAL-* excluded). Gate reports 0 hits. Red-green meta-test passes (clean tree green; planted bareword red; corrected form green). Closed.
- **F04 (QUICKSTART "demo ships with a small movies dataset")**: `1957b55` rewrote `documentation/QUICKSTART.md:38-51` so step §2 is gated on having run `ogdb demo` first ("Once you've run `ogdb demo` (per Step 1) to load MovieLens, you can ask the demo database what's inside…"); the contradiction with step §1 is gone. `git grep -nE 'demo ships with|small movies dataset|ships with a small' documentation/ README.md` returns 0 hits. Closed.

Then audited the three cycle-18 commits for new drift:

- `6c17c3d` (`OGDB_HOME` `~/.opengraphdb` → `~/.ogdb` + `handle_demo` empty-file re-seed). The diff covers: `scripts/install.sh:17`, README.md L39+L52, documentation/QUICKSTART.md L29+L43+L51, CHANGELOG.md, plus the `handle_demo` change and new gate. **Three surfaces the commit did not sweep:**
  1. `crates/ogdb-cli/src/init_agent.rs` — has a parallel default at L234 (`p.push(".opengraphdb")`), a log-dir at L274 (`home_dir()?.join(".opengraphdb")`), an aider skill destination at L454 (`home_dir()?.join(".opengraphdb").join("skill.md")`), and a stale doc-comment at L35 (`/// $HOME/.opengraphdb/demo.ogdb.`). The README and QUICKSTART tell the user to run `ogdb init --agent --agent-id claude` standalone — which goes through `resolve_db_path(None)` and lands on `~/.opengraphdb/demo.ogdb`, **not** the `~/.ogdb/demo.ogdb` install.sh creates. See F01.
  2. `skills/opengraphdb/scripts/ogdb-serve-http.sh` (lines 6, 9, 11) and `skills/opengraphdb/scripts/ogdb-mcp-stdio.sh` (line 9) — both default `OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"`. These wrappers are baked into the binary via `include_dir!` (`crates/ogdb-cli/src/init_agent.rs:29`) and `write_skill_bundle` deposits them verbatim onto every user system that runs `ogdb init --agent`. See F02.
  3. `skills/opengraphdb/references/debugging.md` (lines 16, 23, 28, 54, 60) and `skills/opengraphdb/references/common-recipes.md` (lines 31, 74, 86, 109) — every shipped path example uses `~/.opengraphdb/demo.ogdb`. The skill bundle is what the agent reads when it answers "where is the demo database?" so this drift propagates directly into agent responses. See F03.
  4. `DESIGN.md:2092` + `:2107` — both still say `~/.opengraphdb/config.toml` in the §34 "Configuration System" reality-check prose. The file never shipped (negative assertion), so this is rhetorical drift only. See F04.
  The new gate `scripts/check-install-demo-path-matches-binary-default.sh` is correct for what it pins (install.sh ↔ `default_demo_db_path` only) but its scope is too narrow — `init_agent.rs::resolve_db_path` is the *other* place the binary defines a default, and the skill bundle scripts are the *other* place the path is hardcoded for runtime use. The gate didn't catch any of F01–F03 because it never looks at those files.

- `28b49b6` (verdict tone-down propagation). I cross-checked the new bucket counts. BENCHMARKS § 2.1 (`documentation/BENCHMARKS.md:128-135`) reports `1 verified WIN / 2 caveated WIN (✅⚠️) / 3 losses (collapsed to 2 root-cause families in the strict bucketing footer) / 8 novel-or-directional`; the snapshot scorecard footer at `skills/opengraphdb/references/benchmarks-snapshot.md:46` reports `1 verified WIN / 2 caveated WIN / 2 losses / 6 novel-or-directional`. Both agree on the strict-bucket-footer line BENCHMARKS L135 lays out. MIGRATION-FROM-NEO4J § 5 carries the `1 verified, 2 caveated` split correctly (verified = row 13; caveated = rows 7 + 10). New gate `check-benchmarks-vocabulary-mirror.sh` correctly fails on planted forbidden tokens without `<!-- HISTORICAL -->` markers (red-green test passes). No drift.

- `1957b55` (`--agent-id` syntax + QUICKSTART step §2). Verified `git grep -nE 'ogdb init --agent [a-z]+' README.md documentation/ skills/ npm/ scripts/` returns zero shipped hits (the only matches are inside scripts/test-check-init-agent-syntax.sh's red-green planted fixture and the EVAL-* reports). Other shipped invocations are correct: `npm/cli/README.md:11,15,47` use bare `ogdb init --agent`; `scripts/install.sh:205` uses `ogdb init --agent --port "$OGDB_PORT" --db "$OGDB_HOME/demo.ogdb"`; `skills/opengraphdb/references/debugging.md:83` uses `ogdb init --agent --force`. No drift.

Then cross-checked:

- `git grep -nE '\.opengraphdb' --include='*.md' --include='*.sh' --include='*.rs' --include='*.toml' .` excluding `documentation/EVAL-*`, `target/`, `node_modules/`, and `mcp.opengraphdb.*` (legitimate API namespace) — 4 categories of remaining drift:
  - `crates/ogdb-cli/src/init_agent.rs:35,234,274,454` (functional defaults — F01)
  - `skills/opengraphdb/scripts/ogdb-serve-http.sh:6,9,11` + `skills/opengraphdb/scripts/ogdb-mcp-stdio.sh:9` (deposited wrappers — F02)
  - `skills/opengraphdb/references/debugging.md` (5 lines) + `skills/opengraphdb/references/common-recipes.md` (4 lines) (skill bundle docs — F03)
  - `DESIGN.md:2092,2107` (cosmetic prose about a never-shipped feature — F04)
- Verified the v0.5.0 upgrade fixture exists (`crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs`) — the cycle-15 carry-forward F05–F06 about COMPATIBILITY.md still mismatching shipped state remains.
- `git grep -nE 'post-v0\.5'` — `documentation/SECURITY-FOLLOWUPS.md:26` still uses the "post-v0.5 task" idiom; cycle-18 added no new gate covering this idiom (cycle-17 `0061176`'s gate matches `vX.Y follow-up` only). F08 still open.

## Findings

### F01 — HIGH — `crates/ogdb-cli/src/init_agent.rs:35,234,274,454` still hardcodes `~/.opengraphdb` for the default demo-db, the HTTP-server log dir, and the aider skill destination — cycle-18 `6c17c3d` flipped install.sh's `OGDB_HOME` from `~/.opengraphdb` → `~/.ogdb` and rebuilt the install workflow around the new path, but the code path that backs the README/QUICKSTART-recommended standalone invocation (`ogdb init --agent --agent-id claude`) still defaults to the old directory

- **Severity:** HIGH. **New drift introduced by cycle-18 `6c17c3d`.** The cycle-18 fix correctly aligned `scripts/install.sh:17` and `crates/ogdb-cli/src/lib.rs::default_demo_db_path` (and added a structural gate to pin them) — but `crates/ogdb-cli/src/init_agent.rs` carries a *separate*, parallel default at L234 (`resolve_db_path` returns `~/.opengraphdb/demo.ogdb` when `db == None`). The user-impact bug:

  1. README §2 ("Wire your AI agent") tells the user to run `ogdb init --agent --agent-id claude` (standalone — no `--db` flag, no install.sh wrapper).
  2. `resolve_db_path(None)` (init_agent.rs L229-237) returns `~/.opengraphdb/demo.ogdb`.
  3. `ensure_demo_db` (L239-256) creates `~/.opengraphdb/demo.ogdb` empty.
  4. The agent's MCP config gets wired to `~/.opengraphdb/demo.ogdb`.
  5. Per the README §1 / install.sh banner, the user runs `ogdb demo` (no path arg). `handle_demo` defaults to `~/.ogdb/demo.ogdb` (cycle-18 install.sh + lib.rs aligned this) — a *different* file. MovieLens lands at `~/.ogdb/demo.ogdb`.
  6. The agent queries via MCP → empty `~/.opengraphdb/demo.ogdb`. Same broken-end-state cycle-18 F01 was supposed to close, just via a different code path.

  Compounding bug 2: `init_agent.rs::start_http_server` (L270-299) writes server logs to `~/.opengraphdb/server.log` — the user is told (install.sh banner / README § 1.3) the data lives under `~/.ogdb/`, but logs end up in a stale dotdir. Compounding bug 3: `install_aider_skill` (L453) drops the aider skill at `~/.opengraphdb/skill.md` — same dotdir-drift class.

  The cycle-18 gate (`scripts/check-install-demo-path-matches-binary-default.sh`) is correct for what it pins but was scoped only to install.sh ↔ `default_demo_db_path`; it never inspects `init_agent.rs::resolve_db_path`. So this drift is invisible to the structural surface that's supposed to enforce path-coherence.

- **Locations:**
  ```
  crates/ogdb-cli/src/init_agent.rs:35     /// `$HOME/.opengraphdb/demo.ogdb`.
  crates/ogdb-cli/src/init_agent.rs:229    fn resolve_db_path(db: Option<String>) -> Result<PathBuf, String> {
  crates/ogdb-cli/src/init_agent.rs:234        p.push(".opengraphdb");
  crates/ogdb-cli/src/init_agent.rs:274    let log_dir = home_dir()?.join(".opengraphdb");
  crates/ogdb-cli/src/init_agent.rs:454    let skill_path = home_dir()?.join(".opengraphdb").join("skill.md");
  scripts/install.sh:17                     OGDB_HOME="${OGDB_HOME:-$HOME/.ogdb}"   # post-cycle-18
  crates/ogdb-cli/src/lib.rs:3730           format!("{home}/.ogdb/demo.ogdb")        # post-cycle-18 (already aligned)
  README.md:44                              ogdb init --agent --agent-id claude     # README's standalone pattern (no --db)
  ```

- **Verified:**
  ```
  $ git grep -n '\.opengraphdb' crates/ogdb-cli/src/init_agent.rs
  35:    /// `$HOME/.opengraphdb/demo.ogdb`.
  234:    p.push(".opengraphdb");
  274:    let log_dir = home_dir()?.join(".opengraphdb");
  454:    let skill_path = home_dir()?.join(".opengraphdb").join("skill.md");
  $ bash scripts/check-install-demo-path-matches-binary-default.sh
  check-install-demo-path-matches-binary-default: ok (install.sh OGDB_HOME=$HOME/.ogdb == binary default $HOME/.ogdb/demo.ogdb)
  ```
  The gate passes because it only inspects `lib.rs::default_demo_db_path` and `install.sh::OGDB_HOME`. It never sees `init_agent.rs::resolve_db_path`'s separate hardcode.

- **Patch sketch:**
  ```diff
  --- a/crates/ogdb-cli/src/init_agent.rs
  +++ b/crates/ogdb-cli/src/init_agent.rs
  @@ -32,7 +32,7 @@ pub struct InitAgentOpts {
       /// Database path to expose to the agent. Defaults to
  -    /// `$HOME/.opengraphdb/demo.ogdb`.
  +    /// `$HOME/.ogdb/demo.ogdb`.
       pub db: Option<String>,
  @@ -229,11 +229,11 @@ fn resolve_db_path(db: Option<String>) -> Result<PathBuf, String> {
       if let Some(d) = db {
           return Ok(PathBuf::from(d));
       }
       let mut p = home_dir()?;
  -    p.push(".opengraphdb");
  +    p.push(".ogdb");
       p.push("demo.ogdb");
       Ok(p)
   }
  @@ -271,7 +271,7 @@ fn start_http_server(db_path: &Path, port: u16) -> Result<(), String> {
       if port_in_use(port) {
           return Ok(());
       }
  -    let log_dir = home_dir()?.join(".opengraphdb");
  +    let log_dir = home_dir()?.join(".ogdb");
  @@ -451,7 +451,7 @@ fn install_aider_skill(opts: &InitAgentOpts) -> Result<(String, Option<String>),
  -    let skill_path = home_dir()?.join(".opengraphdb").join("skill.md");
  +    let skill_path = home_dir()?.join(".ogdb").join("skill.md");
  ```

  Generalize the cycle-18 gate so this regresses noisily. Either:

  - *Tighten `scripts/check-install-demo-path-matches-binary-default.sh`* to also parse `init_agent.rs` for any `home_dir()?.join("...")` literal whose first segment differs from the install.sh `OGDB_HOME` and `lib.rs::default_demo_db_path` directories; or
  - *Add a sibling `scripts/check-runtime-default-paths-coherent.sh`* with a configurable allowlist of "files that may reference `~/.opengraphdb`" (cycle-19 starts empty; future stale-path regressions trigger it).

  Add a Rust-level regression test in `crates/ogdb-cli/tests/init_agent_default_db.rs` that asserts `resolve_db_path(None)?` ends in `.ogdb/demo.ogdb` (or whatever the binary's `default_demo_db_path()` directory is, parsed from the source) — so the two CLI defaults stay coherent.

---

### F02 — HIGH — `skills/opengraphdb/scripts/ogdb-serve-http.sh:9,11` + `skills/opengraphdb/scripts/ogdb-mcp-stdio.sh:9` still default `OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"` — these wrappers are baked into the `ogdb` binary via `include_dir!` and `write_skill_bundle` deposits them verbatim onto every user's system at `ogdb init --agent` time, so a user agent that invokes the MCP wrapper hits a path install.sh never created

- **Severity:** HIGH. **New drift introduced by cycle-18 `6c17c3d`.** Same root cause as F01 (path bump didn't propagate) but in a different surface — the skill-bundle wrapper scripts, which (a) are baked into the shipped binary at compile time (`crates/ogdb-cli/src/init_agent.rs:29` `static SKILL_BUNDLE: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../skills/opengraphdb")`) and (b) get extracted onto the user's filesystem by `write_skill_bundle` (`crates/ogdb-cli/src/init_agent.rs:631-664`). When an agent's MCP config invokes the wrapper, the wrapper's `OGDB_DB` default lands at `~/.opengraphdb/demo.ogdb` — the file install.sh never creates and the user's `ogdb demo` never seeds.

  Note that `ogdb-serve-http.sh:11` ALSO defaults `OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"`, mirroring the F01 init_agent.rs:274 log-dir bug — same drift class, parallel surface.

  `skills/opengraphdb/references/debugging.md:8` explicitly tells users to run `bash scripts/ogdb-serve-http.sh` for debugging, which closes the loop on the user-impact: the documented debug recipe will start a server on `~/.opengraphdb/demo.ogdb` rather than the install.sh-created `~/.ogdb/demo.ogdb`.

- **Locations:**
  ```
  skills/opengraphdb/scripts/ogdb-serve-http.sh:6     # stdout/stderr to ~/.opengraphdb/server.log.
  skills/opengraphdb/scripts/ogdb-serve-http.sh:9     OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
  skills/opengraphdb/scripts/ogdb-serve-http.sh:11    OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"
  skills/opengraphdb/scripts/ogdb-mcp-stdio.sh:9      OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
  crates/ogdb-cli/src/init_agent.rs:29                static SKILL_BUNDLE: Dir<'_> = include_dir!(".../skills/opengraphdb");
  crates/ogdb-cli/src/init_agent.rs:631-664           fn write_skill_bundle  // deposits wrapper scripts onto user system
  ```

- **Verified:**
  ```
  $ git grep -n '\.opengraphdb' skills/opengraphdb/scripts/
  skills/opengraphdb/scripts/ogdb-serve-http.sh:6:# stdout/stderr to ~/.opengraphdb/server.log.
  skills/opengraphdb/scripts/ogdb-serve-http.sh:9:OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
  skills/opengraphdb/scripts/ogdb-serve-http.sh:11:OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"
  skills/opengraphdb/scripts/ogdb-mcp-stdio.sh:9:OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
  ```

- **Patch sketch:**
  ```diff
  --- a/skills/opengraphdb/scripts/ogdb-serve-http.sh
  +++ b/skills/opengraphdb/scripts/ogdb-serve-http.sh
  @@ -3 +3 @@
  -# stdout/stderr to ~/.opengraphdb/server.log.
  +# stdout/stderr to ~/.ogdb/server.log.
  @@ -6,3 +6,3 @@
  -OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
  +OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"
   OGDB_PORT="${OGDB_PORT:-8765}"
  -OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"
  +OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.ogdb}"

  --- a/skills/opengraphdb/scripts/ogdb-mcp-stdio.sh
  +++ b/skills/opengraphdb/scripts/ogdb-mcp-stdio.sh
  @@ -6 +6 @@
  -OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
  +OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"
  ```

  Add a structural gate `scripts/check-skill-bundle-paths.sh` that asserts `skills/opengraphdb/` (recursively) contains zero references to `\.opengraphdb` (the install.sh-deprecated dotdir). Wire into `scripts/test.sh`. This both closes F02 mechanically and would have caught it at the `6c17c3d` review pass had it existed.

---

### F03 — HIGH — `skills/opengraphdb/references/debugging.md` (5 hits at L16, L23, L28, L54, L60) + `skills/opengraphdb/references/common-recipes.md` (4 hits at L31, L74, L86, L109) teach the user/agent to refer to `~/.opengraphdb/demo.ogdb` — the path install.sh no longer creates after the cycle-18 path bump

- **Severity:** HIGH. **New drift introduced by cycle-18 `6c17c3d`.** The skill bundle is what `ogdb init --agent` deposits into the user's `~/.claude/skills/opengraphdb/`, `~/.cursor/...`, etc. — the agent **reads these files** to answer questions like "where is the demo database stored?" or "how do I debug a stuck OGDB instance?". Before cycle-18, all of these examples pointed at the same path install.sh created. After cycle-18, install.sh creates `~/.ogdb/demo.ogdb` but the agent's installed skill docs still tell it (and the user, via agent answers) to look at `~/.opengraphdb/demo.ogdb`. Reader-impact: every Cypher / `ogdb` shell command an agent suggests will reach for a stale path.

  This is the same "partial sweep, agent-facing surface" drift class as cycle-18 F02 (BENCHMARKS verdict tone-down didn't propagate to the skill bundle) — except here it's the path-bump propagation that stopped at the public docs and never reached the skill bundle.

- **Locations:**
  ```
  skills/opengraphdb/references/debugging.md:16    ogdb serve --http --port 8765 ~/.opengraphdb/demo.ogdb &
  skills/opengraphdb/references/debugging.md:23      ogdb mcp --stdio ~/.opengraphdb/demo.ogdb
  skills/opengraphdb/references/debugging.md:28    `ogdb info ~/.opengraphdb/demo.ogdb` to see the format version.
  skills/opengraphdb/references/debugging.md:54    2. `ogdb checkpoint ~/.opengraphdb/demo.ogdb` to flush the WAL.
  skills/opengraphdb/references/debugging.md:60    ogdb stats ~/.opengraphdb/demo.ogdb
  skills/opengraphdb/references/common-recipes.md:31   ogdb import ~/.opengraphdb/demo.ogdb ./docs/ --format markdown-folder \
  skills/opengraphdb/references/common-recipes.md:74   ogdb import ~/.opengraphdb/demo.ogdb people.csv \
  skills/opengraphdb/references/common-recipes.md:86   ogdb validate-shacl ~/.opengraphdb/demo.ogdb shapes.ttl
  skills/opengraphdb/references/common-recipes.md:109  ogdb serve --http --port 8080 ~/.opengraphdb/demo.ogdb
  ```

- **Verified:**
  ```
  $ git grep -nE '\.opengraphdb/demo\.ogdb' skills/opengraphdb/references/
  skills/opengraphdb/references/debugging.md:16:ogdb serve --http --port 8765 ~/.opengraphdb/demo.ogdb &
  ... [9 hits total across the two files] ...
  ```

- **Patch sketch:** mechanical sed across the two files.
  ```bash
  sed -i 's|~/\.opengraphdb/demo\.ogdb|~/.ogdb/demo.ogdb|g' \
      skills/opengraphdb/references/debugging.md \
      skills/opengraphdb/references/common-recipes.md
  ```

  Cover with the F02 patch's `scripts/check-skill-bundle-paths.sh` gate (extend it to `skills/opengraphdb/references/*.md`, not just `skills/opengraphdb/scripts/`). One gate covers F02 + F03 in one pass.

---

### F04 — LOW — `DESIGN.md:2092` + `:2107` reference `~/.opengraphdb/config.toml` in §34 "Configuration System" prose — the file never shipped (negative assertion about an aspirational feature), so the rhetorical reference to `.opengraphdb` is doubly stale post cycle-18 `6c17c3d`'s `~/.opengraphdb` → `~/.ogdb` runtime path bump

- **Severity:** LOW. **New drift introduced by cycle-18 `6c17c3d`** but with zero user-impact: the file at L2092 is described as part of an *original Decision-4 sketch* that never shipped, and L2107 is a "**No global `~/.opengraphdb/config.toml`**" negative assertion. The fact that the dotdir name in those negatives no longer matches the runtime data dir name is rhetorical drift only — neither file exists at any path. Cosmetic. Fold into the F02/F03 sweep so the project-wide `\.opengraphdb` count goes to zero (which simplifies the gate proposed in F02).

- **Location:**
  ```
  DESIGN.md:2092    > `~/.opengraphdb/config.toml` → env vars → CLI flags → per-database
  DESIGN.md:2107    - **No global `~/.opengraphdb/config.toml`** and no
  ```

- **Patch sketch:**
  ```diff
  --- a/DESIGN.md
  +++ b/DESIGN.md
  @@ -2092 +2092 @@
  -> `~/.opengraphdb/config.toml` → env vars → CLI flags → per-database
  +> `~/.ogdb/config.toml` → env vars → CLI flags → per-database
  @@ -2107 +2107 @@
  -- **No global `~/.opengraphdb/config.toml`** and no
  +- **No global `~/.ogdb/config.toml`** and no
  ```

---

### F05 — MEDIUM — `documentation/COMPATIBILITY.md:44` still says "Future releases add a v0.5.0 fixture beside it" — v0.5.0 fixture exists since cycle-15

- **Carry-forward from cycle-18 F05 (cycle-17 F05) — not addressed by any cycle-18 commit.** Severity unchanged: `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` exists and is verified; the prose contradicts shipped state. Patch sketch identical to cycle-18 F05.

---

### F06 — MEDIUM — `documentation/COMPATIBILITY.md:94` § 6 release-time enforcement runbook only enumerates `upgrade_fixture_v0_4_0_opens_on_current` — v0.5.0 fixture not in the runbook

- **Carry-forward from cycle-18 F06 (cycle-17 F06) — not addressed by any cycle-18 commit.** Patch sketch identical to cycle-18 F06.

---

### F07 — MEDIUM — `documentation/COMPATIBILITY.md:3` doc-level Status stamp still says "active as of v0.4.0 · 2026-05-01"; § 3 examples were advanced 0.4.* → 0.5.* in cycle-15 `c904418` without bumping the stamp

- **Carry-forward from cycle-18 F07 (cycle-17 F07) — not addressed by any cycle-18 commit.** Cycle-19 stamp should read e.g. "active as of v0.5.1 · 2026-05-05 (last reviewed cycle-19; cycle-18 closed all four cycle-18 HIGHs)".

---

### F08 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md:26` release-notes blockquote still reads "tracked as a post-v0.5 task"; cycle-17 `0061176` swept the `vX.Y follow-up` idiom but its structural gate doesn't catch the adjacent `post-vX.Y` idiom and cycle-18 took no action

- **Carry-forward from cycle-18 F08 (cycle-17 F08) — not addressed by any cycle-18 commit.** Cycle-18 added three new gates but none of them widens `scripts/check-followup-target-not-current.sh`'s regex. Patch sketch identical to cycle-18 F08:
  ```diff
  -PATTERN='\bv[0-9]+\.[0-9]+(\.[0-9]+)?[[:space:]]+follow-up\b'
  +PATTERN='\b(v|post-v)[0-9]+\.[0-9]+(\.[0-9]+)?([[:space:]]+(follow-up|task|item))?\b'
  ```
  Then sweep L26 prose to "v0.6.0 task (slipped from the original v0.5 target)".

---

### F09 — LOW — `documentation/BENCHMARKS.md:33` deltas-table header attribution "(full audit, cycle-15)" is stale — cycle-16 `f72f7cd` extended the table with rows 1+2 and cycle-17/cycle-18 made no further extension; the natural cycle to update it was cycle-17

- **Carry-forward from cycle-18 F09 (cycle-17 F09) — not addressed by any cycle-18 commit.** Bookkeeping drift. Patch sketch identical to cycle-18 F09:
  ```diff
  -> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15).** The
  +> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15 + cycle-16).** The
  ```

---

### F10 — LOW — `frontend/e2e/qa-followups.spec.ts:3` cites a private scratch-worktree QA-REPORT.md path under a tempdir-style prefix — gate scope (`scripts/check-public-doc-tmp-leak.sh`) doesn't cover `frontend/e2e/`

- **Carry-forward from cycle-18 F10 (cycle-17 F10) — not addressed by any cycle-18 commit.** Reader-impact bounded; either drop the path-citation, move the audit report to `documentation/audits/`, or extend `scripts/check-public-doc-tmp-leak.sh` to also cover `frontend/e2e/`.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 3     | F01, F02, F03 |
| MEDIUM   | 4     | F05, F06, F07, F08 |
| LOW      | 3     | F04, F09, F10 |

### Severity changes vs. cycle-18

- **Closed in cycle-18:** F01 (install banner workflow gap, by `6c17c3d`'s install.sh `OGDB_HOME` flip + `handle_demo` empty-file re-seed + `check-install-demo-path-matches-binary-default.sh` structural gate + `demo_seeds_into_existing_empty_init_file` regression test); F02 (BENCHMARKS verdict mirror, by `28b49b6`'s skill-bundle + MIGRATION-FROM-NEO4J sweep + `check-benchmarks-vocabulary-mirror.sh` structural gate); F03 (`ogdb init --agent <bareword>`, by `1957b55`'s README + QUICKSTART sweep + `check-init-agent-syntax.sh` structural gate); F04 (QUICKSTART step §2 contradiction, by `1957b55`'s rewrite). All four mechanically verified — gates pass; grep finds zero residual hits in their scoped surface. Three new structural gates wired into `scripts/test.sh`, all passing red-green.
- **New HIGH (cycle-18-introduced by `6c17c3d`):** F01 (this report) — `init_agent.rs::resolve_db_path` (4 hits, including doc comment + log dir + aider skill path) still defaults to `~/.opengraphdb/demo.ogdb`. The README's standalone `ogdb init --agent --agent-id claude` invocation lands the agent on a different file from the one install.sh creates and `ogdb demo` seeds.
- **New HIGH (cycle-18-introduced by `6c17c3d`):** F02 (this report) — the skill bundle wrapper scripts `ogdb-serve-http.sh` (3 hits) and `ogdb-mcp-stdio.sh` (1 hit) hardcode the old dotdir as default. These are baked into the binary via `include_dir!` and deposited verbatim onto every user system.
- **New HIGH (cycle-18-introduced by `6c17c3d`):** F03 (this report) — the skill bundle reference docs `debugging.md` (5 hits) and `common-recipes.md` (4 hits) teach the agent and user to refer to `~/.opengraphdb/demo.ogdb`.
- **New LOW (cycle-18-introduced by `6c17c3d`):** F04 (this report) — DESIGN.md §34 prose has two stale `~/.opengraphdb/config.toml` references in negative-assertion text about a never-shipped feature. Rhetorical only.
- **Carry-forward MEDIUMs:** F05–F08 unchanged from cycle-18 F05–F08; cycle-18 took no action on these. F08's gap remains unclosed — cycle-18's three new gates don't widen `scripts/check-followup-target-not-current.sh`'s regex.
- **Carry-forward LOWs:** F09 (BENCHMARKS deltas attribution) + F10 (qa-followups.spec.ts /tmp leak) unchanged.

### Gate coverage assessment

The three new gates cycle-18 shipped each correctly close the specific finding that motivated them, but two of the three have scope-too-narrow tells that the cycle-19 audit surfaced:

- `check-install-demo-path-matches-binary-default.sh` pins install.sh ↔ `lib.rs::default_demo_db_path` only. It does **not** pin `init_agent.rs::resolve_db_path` (F01) or the skill bundle scripts (F02). The user-impact bug it set out to prevent (install banner promise unfulfillable) re-emerges via `ogdb init --agent` (no `--db`) → `init_agent.rs` default → wrong path. The gate's own docstring describes the goal as "install.sh and `ogdb demo` agree on the demo path"; widening the gate to also enforce "any binary-internal default path the user can hit by following the README" — i.e. `init_agent.rs::resolve_db_path` — would have caught F01 at `6c17c3d` review time.
- `check-benchmarks-vocabulary-mirror.sh` is correctly scoped — it covers the four files where the BENCHMARKS verdict vocabulary appears, with a `<!-- HISTORICAL -->` opt-out marker for legitimate historical references. No drift.
- `check-init-agent-syntax.sh` is correctly scoped — it covers all shipped `*.md` files (excluding `EVAL-*` reports) and asserts no bareword token follows `--agent`. No drift.

### Headline

Cycle-18 closed all four cycle-18 HIGHs cleanly (mechanical gates verify) and shipped three new structural gates that genuinely advance the project's drift-resistance posture. **However, one of the three cycle-18 commits (`6c17c3d`'s `~/.opengraphdb` → `~/.ogdb` path bump) introduced three new HIGH-class drift surfaces of its own**, all in code/docs the path bump simply didn't sweep:

- `init_agent.rs` (F01) — the `ogdb init --agent` standalone code path (which the README explicitly tells users to invoke) carries its own default-DB resolver that wasn't updated.
- Skill bundle scripts (F02) — the `ogdb-serve-http.sh` and `ogdb-mcp-stdio.sh` wrappers that get deposited onto user systems carry the old dotdir default.
- Skill bundle reference docs (F03) — the `debugging.md` and `common-recipes.md` files that the agent reads to answer user questions teach the old dotdir.

This is the same **partial-sweep without companion-doc/code verification** pattern the project has been catching cycle after cycle:

- `cycle-15 F02` → BENCHMARKS partial sweep without skill mirror.
- `cycle-16 F08` → similar.
- `cycle-17 F03` → BENCHMARKS column-header drift.
- `cycle-18 F02` → BENCHMARKS verdict tone-down without skill mirror.
- `cycle-19 F01–F03` → `~/.opengraphdb` → `~/.ogdb` path bump without `init_agent.rs` / skill bundle mirror.

The cycle-18 gate `check-install-demo-path-matches-binary-default.sh` was the right shape but had the wrong scope — it pinned the *user-driven entry point* (install.sh) to *one of the binary's two defaults* (`lib.rs::default_demo_db_path`) but ignored the *other* binary default (`init_agent.rs::resolve_db_path`) and the *skill-bundle defaults* the same binary deposits.

**Process recommendation for cycle-20:** every cycle-N+1 path-bump or vocabulary-bump fix should land alongside a *mirror-check gate that enumerates every surface the bump might appear on* — not just the headline source. Concretely for the path-bump class: any commit that changes the data-dir name should land alongside a `scripts/check-runtime-default-paths-coherent.sh` gate that fails if any tracked file (excluding EVAL-* reports + intentionally-historical CHANGELOG entries) references the *old* dotdir. A single `git grep '\.opengraphdb'` would have caught F01–F04 at `6c17c3d` review time. The fix-set then either updates every file in the same commit or whitelists the file with an explicit `<!-- HISTORICAL -->` marker (the same pattern `check-benchmarks-vocabulary-mirror.sh` uses successfully). This generalizes the cycle-18 F02 lesson into a path-bump class invariant.
