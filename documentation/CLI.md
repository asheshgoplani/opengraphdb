# OpenGraphDB CLI Reference

Canonical listing of every `ogdb` subcommand. The README and QUICKSTART intentionally cover only the common path; this file is the full surface.

Run `ogdb --help` or `ogdb <subcommand> --help` for the live, version-accurate flag list. The subcommand definitions live in `crates/ogdb-cli/src/lib.rs::Commands`.

## Full CLI reference

Every subcommand the binary ships today, with a one-line description.

### Database lifecycle

- `init` — Initialize a new database (and optionally wire your AI coding agent with `--agent`).
- `info` — Show database file metadata (page size, node/edge counts, header).
- `backup` — Create a consistent backup of the database file.
- `checkpoint` — Force a WAL checkpoint to flush pending writes.
- `migrate` — Apply schema evolution from a migration script.

### Query and shell

- `query` — Execute a one-shot Cypher query against a database file.
- `shell` — Open an interactive Cypher shell (or run a script with `--script`).
- `demo` — Start a demo database with the MovieLens dataset preloaded and open the playground in a browser.

### Bulk data movement

- `import` — Import graph data from CSV, JSON, or JSONL.
- `export` — Export graph data to CSV, JSON, or JSONL.
- `import-rdf` — Import RDF (Turtle, N-Triples, RDF/XML, JSON-LD, N-Quads) into the property graph.
- `export-rdf` — Export the property graph back out as RDF.
- `validate-shacl` — Validate graph data against SHACL shapes.

### Schema and introspection

- `schema` — Show the schema catalog (labels, edge types, property keys).
- `stats` — Show graph statistics (degree distribution, node/edge counts).
- `metrics` — Show internal storage metrics (cache hit ratios, page churn).

### Servers

- `serve` — Start a database server (Bolt, HTTP, gRPC, or MCP) on the chosen ports.
- `mcp` — Run the MCP (Model Context Protocol) server over stdio for AI agents.

### Direct graph manipulation

- `create-node` — Create a node with optional labels and properties.
- `add-edge` — Add an edge between two nodes.
- `neighbors` — List outgoing neighbors of a node.
- `incoming` — List incoming neighbors of a node.
- `hop` — Traverse outgoing edges up to N hops from a starting node.
- `hop-in` — Traverse incoming edges up to N hops from a starting node.

## Updating this reference

When a new subcommand ships:

1. Add the variant to `Commands` in `crates/ogdb-cli/src/lib.rs`.
2. Add the kebab-case name to `CLI_SUBCOMMANDS` in `crates/ogdb-cli/tests/readme_cli_listing.rs`.
3. Add a one-line entry above in the appropriate group.

The `readme_cli_listing` test scans this file (plus `README.md` and the other top-level docs in `documentation/`) to verify every entry in `CLI_SUBCOMMANDS` is mentioned somewhere in the docs.
