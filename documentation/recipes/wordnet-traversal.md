# WordNet traversal recipes

These recipes assume you have already loaded the dataset:

```bash
bash scripts/load-wordnet-demo.sh
```

The default database lands at `~/.ogdb/wordnet.ogdb`. Set `DB` for
convenience:

```bash
export DB="$HOME/.ogdb/wordnet.ogdb"
```

Each query below is runnable as `ogdb query "$DB" "<cypher>"` or via the
MCP `execute_cypher` tool.

> **Engine constraint, before you copy from a Neo4j tutorial.** OpenGraphDB
> 0.5.x does **not** support variable-length patterns (`-[:hypernymOf*1..N]->`),
> named paths (`MATCH p = (...)...`), or trailing `;` separators in single-query
> calls. The recipes below stick to fixed-depth chains so they actually run.
> If you need a true unbounded traversal, call the `shortest_path` MCP tool.

## 1. Hypernym chain — "dog" up four hypernym levels

This is the canonical WordNet demo, scoped to a fixed depth so it runs on
the engine's supported pattern surface. Each hop walks one rung up the
`hypernymOf` lattice.

```cypher
MATCH (s:Synset {label: "dog"})-[:hypernymOf]->(p1:Synset)
                              -[:hypernymOf]->(p2:Synset)
                              -[:hypernymOf]->(p3:Synset)
RETURN s.label AS leaf,
       p1.label AS parent_1,
       p2.label AS parent_2,
       p3.label AS parent_3
LIMIT 1
```

Expected shape (against the wn20 fixture loaded by `load-wordnet-demo.sh`):
`{ leaf: "dog", parent_1: "canine", parent_2: "carnivore", parent_3: "placental_mammal" }`.
Add more `-[:hypernymOf]->(pN:Synset)` segments to walk deeper; the
engine handles each fixed-depth segment cleanly. For an unbounded walk,
prefer the `shortest_path` MCP tool.

## 2. Semantic siblings — concepts that share a parent

"What other concepts are kinds of `mammal`?" — siblings via a single
shared `hypernymOf` step. The reverse arrow (`<-`) is a directed edge in
this engine, *not* an undirected pattern.

```cypher
MATCH (mammal:Synset {label: "mammal"})<-[:hypernymOf]-(child:Synset)
RETURN child.label
ORDER BY child.label
LIMIT 20
```

## 3. Polysemy — words with multiple senses

A word with more than one `Synset` is polysemous. `bank` is the textbook
example (financial institution / river edge).

```cypher
MATCH (w:Word {lexicalForm: "bank"})-[:senseOf]->(s:Synset)
RETURN s.label, s.definition
ORDER BY s.label
```

## 4. Antonym pairs — opposites

```cypher
MATCH (a:Synset)-[:antonymOf]->(b:Synset)
RETURN a.label, b.label
LIMIT 10
```

## 5. Common ancestor — fixed-depth least-upper-bound

The lowest synset that is a hypernym of both `dog` and `cat` within two
hops on each side. (For arbitrary-depth LUB, fall back to the
`shortest_path` MCP tool — variable-length Cypher patterns are not yet
supported.)

```cypher
MATCH (d:Synset {label: "dog"})-[:hypernymOf]->(d1:Synset)
                              -[:hypernymOf]->(anc:Synset)
                              <-[:hypernymOf]-(c1:Synset)
                              <-[:hypernymOf]-(c:Synset {label: "cat"})
RETURN anc.label AS common_ancestor
LIMIT 1
```

Expected against wn20: `carnivore` (or `placental_mammal`, depending on
which sense of `cat`/`dog` is loaded first). Add or drop `-[:hypernymOf]->`
segments on either side to widen / narrow the depth.

## Notes

- WordNet predicates land as edge types named after the RDF property
  local-name (`hypernymOf`, `hyponymOf`, `meronymOf`, ...). The exact
  spellings depend on the W3C wn20 schema.
- `_uri` is preserved on every node so you can round-trip back to RDF
  with `ogdb export-rdf`.
- For richer demos (vector kNN over synset embeddings, GraphRAG over
  glosses) see [`documentation/COOKBOOK.md`](../COOKBOOK.md).
