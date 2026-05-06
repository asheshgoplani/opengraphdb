# Install OpenGraphDB

Three ways to install. Pick the one that fits your workflow.

## 1. Paste a prompt into Claude Code (lowest friction)

Copy this block into a Claude Code, claude.ai, or Cursor session and let the
agent do it for you:

> Install OpenGraphDB on my machine: run
> `curl -fsSL https://github.com/asheshgoplani/opengraphdb/releases/latest/download/install.sh | sh`
> then run `ogdb init --agent` so this session can query the graph.

The agent will surface approval prompts for `curl` and `ogdb init`. After it
finishes, the `ogdb` binary is on your `PATH` and the MCP server is wired
into the current agent session.

## 2. Install as a Claude Code plugin (skills + MCP, no binary)

Inside an active `claude` session:

```text
/plugin marketplace add asheshgoplani/opengraphdb
/plugin install opengraphdb@opengraphdb
```

This registers the OpenGraphDB plugin and installs its skills + MCP server.
You still need the native `ogdb` binary on your machine for storage; the
plugin's `.mcp.json` invokes `npx -y @opengraphdb/mcp`, which auto-installs
the MCP server on first use. To get the database engine itself, follow path
1 or 3.

## 3. Install the binary directly (no agent required)

```bash
curl -fsSL https://github.com/asheshgoplani/opengraphdb/releases/latest/download/install.sh | sh
ogdb init --agent
```

Drops the `ogdb` binary at `~/.local/bin/ogdb` and creates an empty database
at `~/.ogdb/demo.ogdb`. Run `ogdb demo` afterward to load the MovieLens
sample graph and open the playground.

### Node-only systems

```bash
npx @opengraphdb/cli init --agent
```

The npm postinstall step downloads the matching native binary. Requires
Node ≥ 18.

## What gets installed where

| Path | Contents |
|------|----------|
| `~/.local/bin/ogdb` | Native binary (paths 1 and 3) |
| `~/.ogdb/demo.ogdb` | Default empty database file |
| `~/.claude/plugins/cache/opengraphdb/` | Plugin cache (path 2) |
| `~/.npm/_npx/` | MCP server (paths 1 and 2) |

## Verify the install

```bash
ogdb --version
ogdb query ~/.ogdb/demo.ogdb "MATCH (n) RETURN count(n) AS n"
```

## Uninstall

```bash
trash ~/.local/bin/ogdb ~/.ogdb
# Plugin: /plugin uninstall opengraphdb@opengraphdb
```
