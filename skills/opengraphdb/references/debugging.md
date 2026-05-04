# Debugging OpenGraphDB

When the agent hits an error, work through this list before guessing.

## 1. Sanity: is the server actually up?

```bash
bash scripts/ogdb-serve-http.sh   # starts on :8765 if not already running
curl -s http://127.0.0.1:8765/health
# expected: {"status":"ok"}
```

If `/health` returns nothing, the server is not up. Start it:

```bash
ogdb serve --http --port 8765 ~/.opengraphdb/demo.ogdb &
```

## 2. Sanity: is the MCP plumbing alive?

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  ogdb mcp --stdio ~/.opengraphdb/demo.ogdb
```

You should see a JSON-RPC response listing 20 tools. If you see a parse
error, the database file is corrupt or the wrong version — try
`ogdb info ~/.opengraphdb/demo.ogdb` to see the format version.

## 3. "Cypher parse error: unexpected token X"

- Check OGDB dialect quirks in `cypher-cheatsheet.md` — `AT TIME`, `vector.*`,
  and `ogdb.*` namespaces are NOT in vanilla Cypher.
- For multi-statement queries, wrap in `BEGIN ... COMMIT` (HTTP /Bolt only;
  MCP wraps each call separately).
- OGDB does not support `WITH *, ` followed by a Cypher 25 GQL extension —
  rewrite using openCypher 9 syntax.

## 4. "no such label X" / "no such property key X"

```javascript
// always re-fetch schema before assuming a label exists
const s = await mcp.opengraphdb.browse_schema();
if (!s.labels.includes("Person")) {
  // schema drift — let the user know rather than failing silently
}
```

## 5. "database is locked" / "WAL checkpoint required"

OGDB is single-writer. If you see this:

1. Stop other writers (other `ogdb serve` / `ogdb shell` processes).
2. `ogdb checkpoint ~/.opengraphdb/demo.ogdb` to flush the WAL.
3. Re-try the write.

## 6. Slow query on a "small" graph

```bash
ogdb stats ~/.opengraphdb/demo.ogdb
# if a label has > 100k nodes and no index on the filter property:
ogdb query <db> "CREATE INDEX FOR (n:Label) ON (n.prop)"
```

## 7. Vector search returns garbage

- Check `vector.distance` metric matches the index metric (cosine vs L2).
- Query vector dimension must match index `dim` exactly.
- Inspect a known sample: pick one stored vector and query with itself —
  distance should be ~0.

## 8. RDF import lossy

- Use `--rdf-format turtle` explicitly; auto-detect can mis-classify.
- For prefixed IRIs, OGDB stores the expanded form. `MATCH (n {iri: 'http://...'})`
  must use the full IRI, not the prefixed one.
- See `scripts/ogdb-import-rdf.sh` for a working import wrapper.

## 9. Skill bundle out-of-sync

```bash
# re-drop the bundle, force-overwriting any local edits:
ogdb init --agent --force
```

## 10. Agent (Claude/Cursor) doesn't see the MCP tools

1. Confirm config registered: `cat ~/.claude.json | jq .mcpServers.opengraphdb`
2. Restart the agent (Claude/Cursor) — MCP is loaded at agent startup.
3. If still missing: `claude mcp list` (Claude Code) shows what the agent
   currently knows about.

## When to ask for help

If `ogdb info` reports an unsupported format version, or `/health` returns
500 with "schema migration failed", that's a cross-version bug — open an
issue at https://github.com/asheshgoplani/opengraphdb/issues with the
output of `ogdb info` and the offending Cypher.
