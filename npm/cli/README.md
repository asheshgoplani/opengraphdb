# @opengraphdb/cli

OpenGraphDB CLI — single-file embedded graph database with Cypher, vector
search, RDF round-trip, and an MCP server. This npm package downloads the
matching native `ogdb` binary on install and provides the `ogdb` command.

## Quick start

```bash
# install + wire up your coding agent in one shot
npx @opengraphdb/cli init --agent

# or install globally
npm install -g @opengraphdb/cli
ogdb init --agent
```

This auto-detects your coding agent (Claude Code, Cursor, Continue.dev,
Aider, Goose, Codex), registers OpenGraphDB as an MCP server, drops the
skill bundle into the agent's skill pool, and starts a local HTTP server
on `http://127.0.0.1:8765/`.

Then in your agent:

> List the labels in the OpenGraphDB demo database.

## Other entry points

```bash
ogdb init mydata.ogdb                              # plain database init
ogdb query mydata.ogdb "MATCH (n) RETURN n LIMIT 10"
ogdb shell mydata.ogdb                             # interactive Cypher
ogdb serve --http --port 8080 mydata.ogdb          # HTTP server
ogdb mcp --stdio mydata.ogdb                       # MCP stdio server
```

## Equivalent install options

```bash
# curl pipe sh (no Node needed)
curl -fsSL https://opengraphdb.com/install.sh | sh

# cargo (Rust toolchain)
cargo install ogdb-cli
```

All three install the same binary and end with `ogdb init --agent`.

## Docs

- Repo: https://github.com/asheshgoplani/opengraphdb
- Skill bundle: `@opengraphdb/skills`
- License: Apache-2.0
