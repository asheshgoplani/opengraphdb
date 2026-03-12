# @opengraphdb/mcp

MCP server for OpenGraphDB. Connect any AI agent to your graph database.

## Quickstart

1. Start OpenGraphDB:
   ```bash
   opengraphdb serve mydb.ogdb --http
   ```

2. Add the MCP server to your AI tool (see configuration below).

3. Ask your AI: "What labels exist in the database?"

## Configuration

### Claude Code

Add to your project's `.mcp.json` or your global `~/.claude.json`:

```json
{
  "mcpServers": {
    "opengraphdb": {
      "command": "npx",
      "args": ["-y", "@opengraphdb/mcp"],
      "env": {
        "OGDB_URL": "http://localhost:8080"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root, or via Settings > MCP Servers:

```json
{
  "mcpServers": {
    "opengraphdb": {
      "command": "npx",
      "args": ["-y", "@opengraphdb/mcp"],
      "env": {
        "OGDB_URL": "http://localhost:8080"
      }
    }
  }
}
```

### VS Code Copilot

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "opengraphdb": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@opengraphdb/mcp"],
      "env": {
        "OGDB_URL": "http://localhost:8080"
      }
    }
  }
}
```

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `browse_schema` | Discover labels, relationship types, property keys | (none) |
| `execute_cypher` | Run Cypher queries with structured results | `query` (required), `format` (optional) |
| `get_node_neighborhood` | N-hop expansion around a node | `node_id` (required), `hops`, `edge_type`, `limit` |
| `search_nodes` | Text search across node properties | `query` (required), `label`, `limit` |
| `list_datasets` | Database overview with counts and schema | (none) |

## Example Conversations

**"What data is in this graph?"**

The AI calls `browse_schema` to discover labels and relationship types, then calls `list_datasets` for counts, and summarizes: "This graph contains 9,462 movies, 5,219 actors, and 12,034 ACTED_IN relationships."

**"Find all movies starring Tom Hanks"**

The AI calls `execute_cypher` with:
```cypher
MATCH (a:Actor {name: 'Tom Hanks'})-[:ACTED_IN]->(m:Movie) RETURN m.title
```

**"Show me what's connected to node 42"**

The AI calls `get_node_neighborhood` with `node_id: 42, hops: 2` and returns a summary of all nodes and edges within 2 hops.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OGDB_URL` | OpenGraphDB HTTP server URL | `http://localhost:8080` |

## Using the Native Binary

If you have `opengraphdb` installed locally, you can skip the npm package and point your MCP client directly at the binary:

```json
{
  "mcpServers": {
    "opengraphdb": {
      "command": "opengraphdb",
      "args": ["mcp", "--stdio", "mydb.ogdb"]
    }
  }
}
```

## Development

```bash
cd mcp
npm install
npm run build
npm test
```
