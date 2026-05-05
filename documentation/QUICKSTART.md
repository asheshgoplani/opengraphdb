# OpenGraphDB Quickstart

A 5-minute walkthrough from zero to running your first graph query and wiring an AI agent.

If you have never used a graph database before: a graph stores **things** (called nodes) and **relationships** between them (called edges). For example, "Alice" and "Bob" are nodes, and "knows" is the edge that connects them. You query graphs using a language called **Cypher**, which looks a lot like drawing arrows: `(alice)-[:KNOWS]->(bob)`.

That's the whole mental model. Let's go.

## 1. Install

One line installs the binary, drops it on your `PATH`, and creates a fresh empty demo database (run `ogdb demo` afterward to load the MovieLens dataset and launch the playground):

```bash
curl -fsSL https://github.com/asheshgoplani/opengraphdb/releases/latest/download/install.sh | sh
```

Verify it worked:

```bash
ogdb --version
```

You should see something like:

```
ogdb 0.5.1
```

The installer puts the binary at `~/.local/bin/ogdb` (or `/usr/local/bin/ogdb` if writable) and creates a demo database at `~/.opengraphdb/demo.ogdb`.

If you'd rather build from source:

```bash
cargo build --release -p ogdb-cli
./target/release/ogdb --version
```

## 2. First connection

Once you've run `ogdb demo` (per Step 1) to load MovieLens, you can ask the demo database what's inside:

```bash
ogdb info ~/.opengraphdb/demo.ogdb
```

You'll see node counts, edge counts, and labels — the MovieLens dataset that `ogdb demo` just loaded. (If you skipped `ogdb demo`, this command will show 0 nodes / 0 edges; run `ogdb demo` first.)

`ogdb demo` already started a server for you on `http://localhost:8080/`. If you want to re-launch the playground later (without re-seeding):

```bash
ogdb serve --http ~/.opengraphdb/demo.ogdb
```

Then open `http://localhost:8080/` in your browser. You'll get a playground UI where you can type Cypher queries and see graph results visually.

## 3. Load sample data

Let's create a fresh database and put some data in it. Save this file as `friends.ttl`:

```turtle
@prefix : <http://example.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

:alice a foaf:Person ; foaf:name "Alice" ; foaf:knows :bob, :carol .
:bob   a foaf:Person ; foaf:name "Bob"   ; foaf:knows :alice .
:carol a foaf:Person ; foaf:name "Carol" ; foaf:knows :alice, :dave .
:dave  a foaf:Person ; foaf:name "Dave"  .
```

That's RDF (specifically Turtle). It says: there are four people, and they know each other in the pattern shown.

Import it into a fresh OpenGraphDB file:

```bash
ogdb init friends.ogdb
ogdb import-rdf friends.ogdb friends.ttl
```

You should see a confirmation that the triples were imported as nodes and edges.

### Can I use RDF? Yes.

OpenGraphDB reads and writes Turtle (`.ttl`), N-Triples, RDF/XML, JSON-LD, and N-Quads. RDF triples become nodes and edges in the property graph and are queryable with Cypher right away. No separate triplestore, no sidecar service.

## 4. Run a query

Now ask: "who knows whom?"

```bash
ogdb query friends.ogdb "MATCH (a)-[:KNOWS]->(b) RETURN a.name, b.name"
```

You'll get something like:

```
a.name    b.name
Alice     Bob
Alice     Carol
Bob       Alice
Carol     Alice
Carol     Dave
```

A few things to try next:

```bash
# Who does Alice know?
ogdb query friends.ogdb \
  "MATCH (a {name:'Alice'})-[:KNOWS]->(b) RETURN b.name"

# Who knows someone who knows Dave? (two hops)
ogdb query friends.ogdb \
  "MATCH (a)-[:KNOWS]->(b)-[:KNOWS]->(c {name:'Dave'}) RETURN a.name"

# Count people
ogdb query friends.ogdb "MATCH (p:Person) RETURN count(p)"
```

## 5. Wire your AI agent

OpenGraphDB ships with a built-in integration so coding agents (Claude, Cursor, Aider, Goose) can query your graph for you. One command does the wiring:

```bash
ogdb init --agent --agent-id claude   # or omit --agent-id to auto-detect the first installed agent
```

Replace `claude` with `cursor`, `aider`, `continue`, `goose`, or `codex` as needed; or drop `--agent-id` entirely to wire the first detected agent.

What this writes:

- **Claude Code**: an entry in `~/.claude/.claude.json` under `mcpServers` so Claude can call `ogdb` tools (query, search, traverse, import) directly in your conversation.
- **Cursor**: an entry in `~/.cursor/mcp.json` with the same tool surface.
- **Aider / Goose**: a config snippet pointing at `ogdb mcp --stdio`.

After running the init, restart your agent. You should now be able to say things like:

> "Query my friends.ogdb database for everyone Alice knows."

And the agent will run the Cypher for you and read back the result.

## Where to go next

- [`COOKBOOK.md`](COOKBOOK.md) — runnable recipes: hybrid retrieval, document-to-graph ingestion, time-travel queries, CI-graded agents.
- [`BENCHMARKS.md`](BENCHMARKS.md) — head-to-head numbers against Neo4j, Memgraph, and KuzuDB.
- [`MIGRATION-FROM-NEO4J.md`](MIGRATION-FROM-NEO4J.md) — coming from Neo4j? Cypher mapping, driver notes, and the differences that matter.
- [`README.md`](../README.md) — back to the project overview.
