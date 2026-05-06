# Holistic audit of `@opengraphdb/skills` bundle

**Date**: 2026-05-06
**Scope**: `skills/` workspace — npm package layout, SKILL.md frontmatter, references, scripts, install behaviour for all 6 advertised agents, end-to-end "would a fresh user get value out of this on day 1" test.
**Methodology**: static read of every shipped file + dynamic checks (`npm install`, `npm run build`, `npm pack --dry-run`, simulated `node dist/index.js install <agent>` for `claude / cursor / codex / aider / goose / continue` against `HOME=/tmp/<fresh>`).

## Severity summary

| Severity | Count | Examples (top 3 finding titles) |
|---|---|---|
| **BLOCKER** | 5 | (1) Sub-skill SKILL.md files have no frontmatter — Claude Code will not auto-trigger them. (2) `installClaude()` drops `references/`, `scripts/`, `eval/` — 13 of 14 master-skill files never reach disk. (3) `ogdb.*` Cypher procedures documented in references do not exist in the engine (real namespace is `db.*`). |
| **HIGH** | 8 | (1) `install <aider\|goose\|continue>` errors out — but SKILL.md compatibility + `index.ts` help advertise these. (2) Three different agent-id conventions across SKILL.md / install.ts / `init_agent.rs::AGENTS`. (3) `documentation/ai-integration/cosmos-mcp-tool.md` referenced from SKILL.md but file is missing on disk. |
| **MEDIUM** | 7 | (1) `package.json` version `0.1.0` does not match repo `Cargo.toml` `0.5.1` or SKILL.md `metadata.version: 1.0.0`. (2) README.md "Install Specific Skills" example omits the master `opengraphdb` skill entirely. (3) `list` subcommand output omits the master skill. |
| **LOW** | 5 | (1) `eval/cases.yaml` is JSON in a `.yaml` file. (2) Install destination is project-local `.claude/skills/` (works, but unusual; `~/.claude/skills/` is the user-global convention). (3) `scripts/quickstart.sh` assumes a Cargo workspace 4 levels up — fails when installed inside a user repo. |

---

## Section 1 — Anthropic Skill 2.0 frontmatter compliance

**Reference**: `skill-creator/scripts/quick_validate.py` whitelist is `{name, description, license, allowed-tools, metadata, compatibility}`. `compatibility` must be a string ≤ 500 chars. `name` must be kebab-case ≤ 64 chars. `description` ≤ 1024 chars.

### Finding 1.1 — BLOCKER — Sub-skills have no YAML frontmatter at all

- **File**: `skills/ogdb-cypher/SKILL.md:1`, `skills/graph-explore/SKILL.md:1`, `skills/schema-advisor/SKILL.md:1`, `skills/data-import/SKILL.md:1`
- **Problem**: All four sub-skills begin with a markdown H1 (`# OpenGraphDB Cypher Skill` etc.) and have **zero YAML frontmatter**. Skill loaders gate auto-triggering on `name:` and `description:` fields. Without frontmatter these skills are dead weight on disk — Claude Code (and every other agent that follows the official skill spec) will not match them against user prompts.
- **Patch sketch** — for each sub-skill, prepend a frontmatter block, e.g. for `ogdb-cypher`:
  ```yaml
  ---
  name: ogdb-cypher
  description: Generate correct Cypher queries for OpenGraphDB. Use when user asks for Cypher generation, query authoring against a known schema, or query optimization. Trigger keywords - cypher, MATCH, MERGE, RETURN, WHERE, OpenGraphDB query.
  license: Apache-2.0
  ---
  ```
  Same shape for the other three sub-skills.

### Finding 1.2 — HIGH — Master `opengraphdb/SKILL.md` uses non-whitelisted frontmatter keys

- **File**: `skills/opengraphdb/SKILL.md:4` (`when_to_use`), `:20` (`allowed_tools`)
- **Problem**: `quick_validate.py` rejects any key outside `{name, description, license, allowed-tools, metadata, compatibility}`. Two of our keys violate this:
  - `when_to_use` — not in the whitelist (the master skill itself bakes the trigger criteria into `description`, so this block is redundant in spirit).
  - `allowed_tools` — must be `allowed-tools` (hyphen, not underscore).
- **Patch sketch**:
  ```yaml
  # rename
  -allowed_tools: [mcp__opengraphdb__*, Bash, Read]
  +allowed-tools: [mcp__opengraphdb__*, Bash, Read]
  # remove (fold into `description`)
  -when_to_use: |
  -  ...
  ```

### Finding 1.3 — HIGH — `compatibility` is an object but the validator expects a ≤500-char string

- **File**: `skills/opengraphdb/SKILL.md:16-19`
- **Problem**: We render compatibility as a YAML map (`ogdb_min`, `ogdb_max`, `agents`). The official validator wants a free-text string.
- **Patch sketch**:
  ```yaml
  compatibility: "Requires OpenGraphDB ≥ 0.4.0. Tested with Claude Code, Cursor, Continue.dev, Aider, Goose, Codex."
  ```
  Move the structured `ogdb_min` / `ogdb_max` / `agents` data to `metadata:` (which the spec does allow free-form sub-keys under).

### Finding 1.4 — LOW — Description is long but inside 1024-char ceiling

- **File**: `skills/opengraphdb/SKILL.md:3`
- **Problem**: 383 chars; readable, fine. Note for future: keep < 1024.

---

## Section 2 — Content quality

### Finding 2.1 — BLOCKER — `ogdb.*` Cypher procedures documented but the engine implements `db.*`

- **File**: `skills/opengraphdb/references/cypher-cheatsheet.md:55-95`, `skills/opengraphdb/references/common-recipes.md:38-69`, `skills/opengraphdb/references/migration-from-neo4j.md:17-21`
- **Problem**: References document procedures like `CALL ogdb.vector.knn(...)`, `CALL ogdb.text.search(...)`, `CALL ogdb.hybrid_retrieve({...})`, `CALL ogdb.temporal.diff(...)`, `CALL ogdb.rdf.import(...)`. Grepping `crates/ogdb-core/src/lib.rs::try_execute_builtin_call_query` shows the actual whitelist:
  ```
  db.index.vector.queryNodes
  db.index.fulltext.queryNodes
  db.index.hybrid.queryNodes
  db.agent.recall / db.agent.storeEpisode
  db.algo.shortestPath / db.algo.community.labelPropagation
  db.audit.log / db.indexes
  db.rag.buildSummaries / db.rag.retrieve
  ```
  Note: `cypher-coverage.md` (also in the bundle) correctly uses `db.*`. So we ship two reference files that contradict a third one. A user who reads `cypher-cheatsheet.md` first and copy-pastes `CALL ogdb.hybrid_retrieve({...})` into their query will get a parse error, lose trust, and bounce.
- **Patch sketch** — global rename in `cypher-cheatsheet.md`, `common-recipes.md`, `migration-from-neo4j.md`:
  ```
  ogdb.vector.knn(label, prop, q, k)         → db.index.vector.queryNodes(idx, q, k)
  ogdb.text.search(prop, q)                  → db.index.fulltext.queryNodes(idx, q)
  ogdb.hybrid_retrieve({...})                → db.index.hybrid.queryNodes(idx, vec, q, k)
  ogdb.temporal.diff(label, t1, t2)          → MCP tool `temporal_diff` (not Cypher)
  ogdb.rdf.import(path) / ogdb.rdf.export(…) → MCP tools / CLI (`ogdb import-rdf`)
  ```

### Finding 2.2 — HIGH — Master SKILL.md "See also" points at a doc that does not exist

- **File**: `skills/opengraphdb/SKILL.md:355`
- **Problem**: Cites `documentation/ai-integration/cosmos-mcp-tool.md`. Repo's `documentation/ai-integration/` only contains `embeddings-hybrid-rrf.md` and `llm-to-cypher.md`. (Cycle 15-34 churn around the cosmos.gl removal probably stranded this reference.)
- **Patch sketch**: drop the bullet, or replace with the actual MCP wiring section in `documentation/ai-integration/llm-to-cypher.md`.

### Finding 2.3 — MEDIUM — `references/common-recipes.md` recipe 6 documents a CSV import flag set the CLI does not expose

- **File**: `skills/opengraphdb/references/common-recipes.md:71-81`
- **Problem**: Shows `ogdb import ... --batch-size 10000 --continue-on-error`. These flags need verification against `crates/ogdb-cli/src/lib.rs` — if they don't exist (likely, given the bulk-import gap called out in `benchmarks-snapshot.md` row 1), this is a confidently-wrong recipe.
- **Patch sketch**: verify against `ogdb import --help`, then either correct the flags or replace with the documented HTTP `POST /import` path that the master SKILL.md actually points users at.

### Finding 2.4 — MEDIUM — `references/common-recipes.md` recipe 9 references a "playground SPA" that may not actually be served

- **File**: `skills/opengraphdb/references/common-recipes.md:103-110`
- **Problem**: "the HTTP server bundled with `ogdb init --agent` already serves the SPA / open http://127.0.0.1:8765/". The master SKILL.md is the source of truth for what the binary does and only mentions `ogdb serve --http` (no SPA bundling claim). Cross-doc inconsistency.
- **Patch sketch**: verify against the binary's behaviour; either confirm and add the same line to SKILL.md, or remove the recipe.

### Finding 2.5 — LOW — `references/debugging.md:82-84` "re-drop the bundle" command may not exist

- **File**: `skills/opengraphdb/references/debugging.md:82`
- **Problem**: `ogdb init --agent --force` — the `--force` flag has not been verified to exist. Worth a quick check; if not, either add it to the binary or drop the suggestion.

### Finding 2.6 — LOW — Sub-skill markdown bodies look healthy

- **Files**: `skills/ogdb-cypher/rules/*.md`, `skills/graph-explore/rules/*.md`, `skills/schema-advisor/rules/*.md`, `skills/data-import/rules/*.md`
- **Note**: All 11 rule files read cleanly (5-9 KB each), with concrete Cypher examples, real schema names, and balanced "do/don't" framing. The bodies are good — only the missing frontmatter on the sibling SKILL.md is what blocks them.

---

## Section 3 — End-to-end install simulation

`npm install` and `npm run build` complete cleanly. `npm pack --dry-run` reports 45 files / 71.9 kB / 221.3 kB unpacked. Bin entry is `dist/index.js`. **However:**

### Finding 3.1 — BLOCKER — `installClaude()` only copies `SKILL.md` + `rules/`, dropping `references/`, `scripts/`, `eval/`

- **File**: `skills/src/install.ts:57-80`
- **Problem**: `installClaude()` enumerates `SKILL.md` then any `rules/` directory. The master `opengraphdb` skill ships **no** `rules/` directory but **does** ship `references/` (6 docs), `scripts/` (4 scripts), and `eval/` (1 case suite). Real install run with `HOME=/tmp/fakehome-… node dist/index.js install claude` produced 16 files on disk: 5 `SKILL.md` plus 11 rule docs from the four sub-skills. **Zero** of the master skill's `references/`, `scripts/`, `eval/` artefacts landed.
  
  Consequence: every cross-reference in `skills/opengraphdb/SKILL.md` to `references/cypher-coverage.md`, `references/benchmarks-snapshot.md`, `scripts/quickstart.sh`, `eval/cases.yaml` is **a broken link at runtime** for any user who installs via the npm package.
- **Patch sketch**: extend `installClaude()` to copy any subdirectory of the source skill folder, not just `rules/`. Pseudo-diff:
  ```ts
  // in installClaude(), after copying SKILL.md
  for (const sub of readdirSync(skillDir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    if (sub.name === "rules") continue; // already handled, or fold into the same branch
    const srcSub = join(skillDir, sub.name);
    const dstSub = join(targetDir, sub.name);
    mkdirSync(dstSub, { recursive: true });
    for (const f of readdirSync(srcSub)) {
      copyFileSync(join(srcSub, f), join(dstSub, f));
    }
  }
  ```
  And mirror the change in `installSingleFile()` — currently it only inlines `SKILL.md` + `rules/` via `loadSkill()`, so cursor / codex users also get a `.cursorrules` / `.codex/instructions.md` whose "see references/cypher-coverage.md" links resolve to nothing.

### Finding 3.2 — BLOCKER — `install aider`, `install goose`, `install continue` all error out

- **File**: `skills/src/install.ts:111-131`
- **Problem**: `Platform` type is `"claude" | "cursor" | "codex"`. The `switch` falls through to `default: throw new Error("Unknown platform: …")` for any other arg. But:
  - `skills/opengraphdb/SKILL.md:19` advertises `compatibility.agents = [claude-code, cursor, continue.dev, aider, goose, codex]`.
  - `skills/src/index.ts:23` prints `Platforms: claude, cursor, codex, aider, goose, continue (auto-detected if omitted)`.
  - `crates/ogdb-cli/src/init_agent.rs:143-186` (the binary's source-of-truth `AGENTS` array) lists all six.
  
  A user who follows the README and runs `npx @opengraphdb/skills install aider` (or `goose`, or `continue`) gets `Error: Unknown platform: aider. Use: claude, cursor, or codex` on stderr and `exit 1`. The npm bundle is silently lying about the compatibility surface.
- **Patch sketch**: add three more cases to the switch (or factor a single `installSingleFile` call with platform→target-path map):
  ```ts
  case "aider":
    installSingleFile(skills, ".aider.conf.yml.md", "# OpenGraphDB Skills (Aider)\n");
    break;
  case "goose":
    installSingleFile(skills, ".goosehints", "# OpenGraphDB Skills (Goose)\n");
    break;
  case "continue":
    installSingleFile(skills, ".continue/rules.md", "# OpenGraphDB Skills (Continue.dev)\n");
    break;
  ```
  Verify each target path against the agent's actual config-file convention before merging.

### Finding 3.3 — HIGH — Three different agent-id conventions across files

- **Files**: `skills/opengraphdb/SKILL.md:19`, `skills/src/install.ts:11`, `crates/ogdb-cli/src/init_agent.rs:143-186`
- **Problem**:
  | Source | IDs |
  |---|---|
  | SKILL.md frontmatter | `claude-code, cursor, continue.dev, aider, goose, codex` |
  | install.ts `Platform` | `claude, cursor, codex` (only) |
  | init_agent.rs `AGENTS` | `claude, cursor, continue, aider, goose, codex` |
  Three different sets, three different naming styles. The init binary's IDs are the source of truth (`claude / cursor / continue / aider / goose / codex` — kebab-case, no `.dev`, no `-code` suffix). Ripple this through SKILL.md frontmatter and install.ts.
- **Patch sketch**: settle on `[claude, cursor, continue, aider, goose, codex]` in all three places.

### Finding 3.4 — MEDIUM — Install destination is project-local `.claude/skills/`, not `~/.claude/skills/`

- **File**: `skills/src/install.ts:60`, `skills/README.md:43-71`
- **Problem**: `installClaude()` writes to `join(".claude", "skills", skillName)` relative to the user's CWD. Claude Code does load project-local `.claude/skills/` (recent feature), so this works — but the README's structure example shows the path without anchoring it to "your project root", which can confuse a user who ran `npx ...` in `~/`. Two adjustments:
  1. Document explicitly: "run from the root of your project; this writes to `<project>/.claude/skills/`."
  2. Add a `--global` / `-g` flag that targets `~/.claude/skills/` for users who want the skill available across all repos.

### Finding 3.5 — LOW — Bundle ships a `dist/` whose source map points back into `src/` — adds 18 KB but no runtime surface

- **Files**: `skills/dist/*.js.map` per `npm pack` output
- **Problem**: Source maps are nice for debugging but irrelevant for an install-and-go npm package. Optional: drop `*.js.map` from `files` to shrink the tarball ~25%.

---

## Section 4 — npm metadata

### Finding 4.1 — MEDIUM — `package.json` version is `0.1.0`; SKILL.md says `1.0.0`; repo is `0.5.1`

- **Files**: `skills/package.json:3`, `skills/opengraphdb/SKILL.md:22`, `Cargo.toml:version`
- **Problem**: Three independent version values. For a user-facing release, the npm package version is what shows on npmjs.com, but it disagrees with both the in-skill `metadata.version` and the engine version it's tested against. Recommend pinning to **one** scheme — easiest is to make all three track Cargo (`0.5.1` → `0.5.1`).
- **Patch sketch**:
  ```diff
  - "version": "0.1.0",
  + "version": "0.5.1",
  ```
  Same in `mcp/package.json`. And in SKILL.md:
  ```diff
  -  version: "1.0.0"
  +  version: "0.5.1"
  ```

### Finding 4.2 — MEDIUM — `package.json:files` enumerates a directory order that doesn't match the actual filesystem

- **File**: `skills/package.json:27`
- **Problem**: `"files": ["dist", "evals", "opengraphdb", "ogdb-cypher", "graph-explore", "schema-advisor", "data-import", "README.md", "LICENSE"]`. There is **no `LICENSE` file in `skills/`** (the repo-root `LICENSE` is Apache-2.0; the package.json declares `MIT` — see Finding 4.3). `npm pack` warns for missing files in `files:` listing.
- **Patch sketch**: either copy `../LICENSE` into `skills/` at publish time (via `prepublishOnly`), or drop the entry from `files`.

### Finding 4.3 — HIGH — License mismatch: package.json says MIT, SKILL.md frontmatter + repo root say Apache-2.0

- **Files**: `skills/package.json:19`, `skills/opengraphdb/SKILL.md:15`, `LICENSE`
- **Problem**: `"license": "MIT"` in the npm package vs `license: Apache-2.0` in the master SKILL.md and Apache-2.0 in the repo root LICENSE file. Either the package is mis-licensed or the SKILL.md is. This is a real legal-clarity defect for a project that markets itself as "Apache-2.0, single-file" (per the migration doc).
- **Patch sketch**: pick Apache-2.0 to match the rest of the repo:
  ```diff
  - "license": "MIT",
  + "license": "Apache-2.0",
  ```

### Finding 4.4 — LOW — `homepage` URL deep-links into a sub-tree that may go stale

- **File**: `skills/package.json:20`
- **Problem**: `https://github.com/asheshgoplani/opengraphdb/tree/main/skills` — fine for now, but `tree/main/skills` breaks the moment the directory is renamed. Standard convention is to point at the project root (`https://github.com/asheshgoplani/opengraphdb`).

### Finding 4.5 — LOW — README's Quickstart is accurate but the "Available Skills" table is internally consistent only with the `list` command — and `list` omits the master skill

- **Files**: `skills/README.md:23-29`, `skills/src/index.ts:17-22`
- **Problem**: README's table lists 5 skills (master + 4 narrow). `list` command lists only 4 (skips master). A user runs `npx @opengraphdb/skills list` and sees less than the README promises.
- **Patch sketch**: add `console.log("  opengraphdb     Master skill — cross-cutting workflow, sub-skill router");` to the `list` block in `index.ts`.

---

## Section 5 — Compatibility with all 6 advertised agents

Source of truth is `crates/ogdb-cli/src/init_agent.rs::AGENTS` = `[claude, cursor, continue, aider, goose, codex]` (six entries; cycle 15 stripped Copilot, confirmed). The binary's per-agent install paths come from each `install_*_skill` function in the same file.

### Finding 5.1 — HIGH — npm skill bundle supports 3 of 6 agents the binary supports

(See Finding 3.2 above for the install.ts blocker.) The binary's `init-agent` subcommand can already wire up all six — but the standalone `npx @opengraphdb/skills install <agent>` flow only handles three. A user reading the README sees `npx @opengraphdb/skills install claude` and assumes the parallel `install goose` works; it doesn't.

### Finding 5.2 — MEDIUM — README documents only `claude / cursor / codex`; the help text in `index.ts` documents all six

- **Files**: `skills/README.md:85-89`, `skills/src/index.ts:23`
- **Problem**: README "Platform Configuration Details" only has subsections for Claude / Cursor / Codex. `index.ts` print-help advertises all six. Pick one truth and align.

---

## Section 6 — What's missing

### Finding 6.1 — MEDIUM — No troubleshooting / error catalogue at the bundle level

- **Note**: `references/debugging.md` is good but only 99 lines and doesn't cover the failure modes most users will hit on day 1: "I ran `install` and Claude doesn't see the skill", "Cypher parser says `unexpected token AT`", "vector_search returns 0 results — wrong dim". Each merits a numbered entry with copy-paste fix.
- **Patch sketch**: add `references/troubleshooting.md` with at least:
  - Skill not auto-triggering — confirm `.claude/skills/<name>/SKILL.md` exists, has frontmatter, restart Claude.
  - Cypher parse errors — `AT TIME` is OGDB-specific, common gotchas in `cypher-cheatsheet.md`.
  - Empty result on hybrid query — dim mismatch on the index.
  - `db.index.vector.queryNodes` "no such index" — must `CALL db.index.vector.create(...)` first.

### Finding 6.2 — MEDIUM — No worked end-to-end example shipped as a runnable artefact in the skill bundle

- **Note**: `scripts/quickstart.sh` exists but assumes a Cargo workspace 4 levels up — fails when installed into a user repo (Finding 3.5 on path; the script's `REPO_ROOT="$(cd $SCRIPT_DIR/../../.." && pwd)"` resolves to a random user directory). A new user who runs the installed quickstart on a non-OGDB checkout will hit `cargo build --release -p ogdb-cli` in their own project — unrelated.
- **Patch sketch**: rewrite `quickstart.sh` to require `ogdb` already on `PATH` (downloaded via the `install.sh` from the README), eliminate the `REPO_ROOT` fallback, and add a step-1 "if not on PATH, run `curl … install.sh`" hint.

### Finding 6.3 — LOW — RDF round-trip example in skill is shell-only — no Cypher round-trip or RDF entity-pair query

- **Note**: `scripts/ogdb-import-rdf.sh` covers the import side. There's no example of "I imported a Turtle ontology — now what does the graph look like?" — i.e. a Cypher query against the `_uri` property to confirm the round-trip.

### Finding 6.4 — LOW — No reference doc covers SHACL validation, which is mentioned in `migration-from-neo4j.md` as a gain

- **Note**: `migration-from-neo4j.md:21` advertises SHACL as an OGDB-native feature. No example of a `.shapes.ttl` + `ogdb validate-shacl` flow anywhere in the bundle. Either ship a one-pager or drop the marketing claim from the migration doc.

---

## Section 7 — Real-world useful test (the most important section)

Mental simulation: a user runs `npx @opengraphdb/skills install claude`, restarts Claude Code, then asks each of these questions. Result column is what they actually get from the bundle as it ships today.

| User question | Answerable from bundle? | Path | Notes |
|---|---|---|---|
| "How do I add a node?" | ✅ | master SKILL.md "Quickstart" + `cypher-cheatsheet.md` | Clear CLI + Cypher answer (CREATE / MERGE). |
| "How do I query with vector search?" | ⚠️ partially-wrong | `cypher-cheatsheet.md:55-61` shows `CALL ogdb.vector.knn(...)` | This is a fictional procedure (Finding 2.1). Real syntax `CALL db.index.vector.queryNodes(...)` is in `cypher-coverage.md` but a user who lands in cheatsheet first gets a parse error. |
| "How do I import RDF?" | ✅ | `scripts/ogdb-import-rdf.sh` + master SKILL.md recipe 6 | Genuinely useful and runnable. |
| "How do I run a hybrid (vector + graph) query?" | ⚠️ wrong API | master SKILL.md recipe 2 says `POST $BASE/rag/search` (✅ real endpoint), but `cypher-cheatsheet.md:88` documents `CALL ogdb.hybrid_retrieve({...})` (fictional). | If user goes through the HTTP path, fine; through Cypher, they hit Finding 2.1 and bounce. |
| "What's the Cypher syntax for time-travel queries?" | ✅ | master SKILL.md ("AT TIME" extension) + `cypher-cheatsheet.md:65-67` + `cypher-coverage.md:75` | Three sources, all consistent (milliseconds). Solid. |
| "After install, what do I do next?" | 🟡 | install command output prints "Try asking: 'Show me all node labels in the database'" | Vague. No concrete "now run `ogdb init demo.ogdb && ogdb mcp --stdio demo.ogdb` and ask Claude X" — the runnable `quickstart.sh` exists in the bundle source but never lands on the user's filesystem (Finding 3.1). |

**Summary**: 3 of 6 mental-test queries are answered well; 2 are answered with a fictional API; 1 ("what next?") is vague and the runnable artefact that would answer it never reaches the user.

---

## Verdict

**DO-NOT-SHIP** at the current state.

Top-3 must-fix before publish:

1. **Add YAML frontmatter to all four sub-skill `SKILL.md` files** (Finding 1.1). Without `name:` and `description:`, the four narrow skills are invisible to Claude Code's auto-trigger. This is the single highest-leverage fix in the audit.
2. **Fix the `installClaude()` / `installSingleFile()` copy logic to include `references/`, `scripts/`, and `eval/` directories** (Finding 3.1). Today the master skill's reference docs and runnable quickstart never land on the user's filesystem, breaking ~10 cross-references in `SKILL.md` at runtime.
3. **Reconcile the `ogdb.*` vs `db.*` Cypher procedure namespaces across `cypher-cheatsheet.md`, `common-recipes.md`, `migration-from-neo4j.md`** (Finding 2.1). Right now the bundle teaches users a syntax the engine doesn't accept — first parse error and they're gone.

Strongly-recommended runner-ups (any one of which alone would already justify a re-tag):

- Resolve the 3-vs-6 agent gap in `install.ts` so `install aider / goose / continue` actually work (Finding 3.2). Either ship the install paths or remove the IDs from SKILL.md frontmatter and the `index.ts` help text — but stop advertising what the package can't do.
- Pin one license (Apache-2.0) across `package.json`, SKILL.md, and the repo LICENSE (Finding 4.3).
- Add the master `opengraphdb` skill to the `list` command output (Finding 4.5) so README and CLI agree.

After those land, the bundle can ship as **0.5.1** alongside the engine.
