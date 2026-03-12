# @opengraphdb/skills

AI coding skills for OpenGraphDB. Install expert graph database knowledge into Claude Code, Cursor, VS Code Copilot, and Codex.

## What Are Skills?

Skills are instruction packages that teach AI coding tools how to work with OpenGraphDB. They include Cypher query patterns, exploration strategies, schema design guidance, and data import assistance. Unlike generic LLM knowledge, these skills are tuned specifically for OpenGraphDB's dialect and features, covering temporal queries, vector search, RDF import/export, and graph-native optimizations.

## Quickstart

```bash
# Install all skills (auto-detects your AI tool)
npx @opengraphdb/skills install

# Or specify your platform
npx @opengraphdb/skills install claude
npx @opengraphdb/skills install cursor
npx @opengraphdb/skills install copilot
npx @opengraphdb/skills install codex
```

## Available Skills

| Skill | What It Does | Example |
|-------|-------------|---------|
| `ogdb-cypher` | Generates correct Cypher queries for OpenGraphDB | "Find all people who acted in movies directed by Spielberg" |
| `graph-explore` | Guides systematic graph exploration | "Help me understand what's in this database" |
| `schema-advisor` | Designs graph schemas from domain descriptions | "Design a schema for a healthcare system" |
| `data-import` | Assists CSV/JSON/RDF import with validation | "Import this CSV of employees into the graph" |

## Platform Configuration Details

After running `npx @opengraphdb/skills install`, the installer writes skill files to the correct location for your AI tool.

### Claude Code

```bash
npx @opengraphdb/skills install claude
```

Creates the following structure in your project:

```
.claude/skills/
  ogdb-cypher/
    SKILL.md
    rules/cypher-patterns.md
    rules/query-optimization.md
    rules/error-prevention.md
  graph-explore/
    SKILL.md
    rules/exploration-strategies.md
    rules/schema-navigation.md
  schema-advisor/
    SKILL.md
    rules/modeling-patterns.md
    rules/index-strategy.md
    rules/rdf-mapping.md
  data-import/
    SKILL.md
    rules/format-detection.md
    rules/import-patterns.md
    rules/validation-checks.md
```

Claude Code automatically reads SKILL.md files from `.claude/skills/` when working in the project. Each skill's rules are loaded on demand.

### Cursor

```bash
npx @opengraphdb/skills install cursor
```

Creates or appends to `.cursorrules` in your project root. All skill content is concatenated into a single file that Cursor reads on project open.

### VS Code Copilot

```bash
npx @opengraphdb/skills install copilot
```

Creates `.github/copilot-instructions.md` with all skill content. Copilot reads project-level instructions from this file automatically.

### Codex

```bash
npx @opengraphdb/skills install codex
```

Creates `.codex/instructions.md` with all skill content. Codex reads instructions from this directory on startup.

## Using With MCP Server

Skills work best when combined with the `@opengraphdb/mcp` server. Skills provide the knowledge (how to write queries, design schemas, import data), while the MCP server provides live database access (execute queries, browse schema, search nodes).

```bash
# 1. Install MCP server
npx @opengraphdb/mcp  # Add to your AI tool's MCP config

# 2. Install skills
npx @opengraphdb/skills install

# 3. Start OpenGraphDB
opengraphdb serve mydb.ogdb --http

# Now your AI tool can:
# - Understand graph database concepts (skills)
# - Execute queries against your database (MCP)
```

Skills reference MCP tools like `execute_cypher`, `browse_schema`, and `search_nodes` in their instructions. When the MCP server is available, your AI tool can both understand and act on graph database tasks.

## Running Evals

Eval files test whether skills improve AI output quality. They generate A/B comparison prompts: one with skill context, one without.

```bash
# Generate A/B test prompts for all skills
npx @opengraphdb/skills eval prompts

# Generate prompts for a specific skill
npx @opengraphdb/skills eval prompts ogdb-cypher

# Score responses from an eval run
npx @opengraphdb/skills eval score responses.json
```

Each skill has eval cases at easy, medium, and hard difficulty levels (34 total cases across all skills).

## Install Specific Skills

You can install a subset of skills instead of all four:

```bash
# Install only the Cypher skill
npx @opengraphdb/skills install claude ogdb-cypher

# Install Cypher and import skills only
npx @opengraphdb/skills install cursor ogdb-cypher data-import

# Install schema and exploration skills
npx @opengraphdb/skills install copilot schema-advisor graph-explore
```

## Skill Contents

### ogdb-cypher (791 lines)
Comprehensive Cypher query generation covering all supported clauses (MATCH, CREATE, MERGE, SET, DELETE, WITH, UNWIND, RETURN), OpenGraphDB extensions (temporal queries, vector search, text search, RDF operations), query optimization rules, and 12 common error patterns with corrections.

### graph-explore (512 lines)
Five exploration strategies (top-down, bottom-up, goal-directed, pattern discovery, temporal) selected by graph size and user intent. Schema navigation rules for interpreting labels, relationship types, and property distributions.

### schema-advisor (683 lines)
Eight graph modeling best practices and six anti-patterns with before/after Cypher examples. Index strategy selection (B-tree, composite, text, vector). RDF ontology mapping with `_uri` property preservation for round-trip fidelity.

### data-import (651 lines)
Format detection for CSV, JSON, and RDF files. Two-pass import (nodes first, relationships second). Batch size tiers (<100 individual, 100-10K UNWIND, 10K+ POST /import API). MERGE-based idempotency for all import operations. Validation checks for data types, missing properties, and relationship endpoints.

## Development

```bash
cd skills
npm install
npm run build
npm test

# Run the CLI locally
node dist/index.js
node dist/index.js list
node dist/index.js install claude
node dist/index.js eval prompts
```

## License

MIT
