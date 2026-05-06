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

## 1. Hypernym chain — "dog" up to its top abstraction

This is the canonical WordNet demo. Variable-length traversal walks from
a leaf concept up the `hypernymOf` lattice until it reaches a synset that
has no further hypernym (a top-level abstraction like `entity`).

```cypher
MATCH path = (start:Synset {label: "dog"})
             -[:hypernymOf*1..15]->
             (root:Synset)
WHERE NOT (root)-[:hypernymOf]->()
RETURN [n IN nodes(path) | n.label] AS chain
LIMIT 1;
```

Expected shape: `["dog", "canine", "carnivore", "placental_mammal",
"mammal", "vertebrate", "chordate", "animal", "organism", "living_thing",
"whole", "object", "physical_entity", "entity"]`.

## 2. Semantic siblings — concepts that share a parent

"What other concepts are kinds of `mammal`?" — siblings via a single
shared `hypernymOf` step.

```cypher
MATCH (mammal:Synset {label: "mammal"})
      <-[:hypernymOf]-(child:Synset)
RETURN child.label
ORDER BY child.label
LIMIT 20;
```

## 3. Polysemy — words with multiple senses

A word with more than one `Synset` is polysemous. `bank` is the textbook
example (financial institution / river edge).

```cypher
MATCH (w:Word {lexicalForm: "bank"})
      -[:senseOf]->(s:Synset)
RETURN s.label, s.definition
ORDER BY s.label;
```

## 4. Antonym pairs — opposites

```cypher
MATCH (a:Synset)-[:antonymOf]->(b:Synset)
RETURN a.label, b.label
LIMIT 10;
```

## 5. Common ancestors — least-upper-bound of two concepts

The lowest synset that is a hypernym of both `dog` and `cat`. The test
of a graph DB is whether this reads naturally:

```cypher
MATCH p1 = (d:Synset {label: "dog"})-[:hypernymOf*1..15]->(anc:Synset),
      p2 = (c:Synset {label: "cat"})-[:hypernymOf*1..15]->(anc)
RETURN anc.label, length(p1) + length(p2) AS depth
ORDER BY depth ASC
LIMIT 1;
```

Expected: `carnivore` (or `placental_mammal`, depending on which sense of
`cat`/`dog` you pick).

## Notes

- WordNet predicates land as edge types named after the RDF property
  local-name (`hypernymOf`, `hyponymOf`, `meronymOf`, ...). The exact
  spellings depend on the W3C wn20 schema.
- `_uri` is preserved on every node so you can round-trip back to RDF
  with `ogdb export-rdf`.
- For richer demos (vector kNN over synset embeddings, GraphRAG over
  glosses) see [`documentation/COOKBOOK.md`](../COOKBOOK.md).
