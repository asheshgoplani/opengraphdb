# WordNet RDF demo dataset

Princeton WordNet 2.0 in RDF/XML, packaged by W3C as a Member Submission.
This is the canonical lexical-graph dataset used in NLTK, spaCy add-ons,
BabelNet, and most NLP textbooks of the last 20 years.

## What's in it

The dataset describes word meanings (synsets) and the relations between
them: hypernymy ("dog" is a kind of "canine"), hyponymy, meronymy
("wheel" is part of "car"), holonymy, antonymy, and derivational
relations. Every synset is a node; every relation is an edge. The schema
is purpose-built for graph traversal demos.

| Property | Value |
|----------|-------|
| Source | [W3C WordNet RDF Submission](https://www.w3.org/TR/wordnet-rdf/) |
| Download | `https://www.w3.org/2006/03/wn/wn20/download/wn20basic.zip` |
| Original size | 8.5 MB compressed (RDF/XML), shrinks under Turtle |
| Approx. nodes | ~115k synsets |
| Approx. edges | ~280k relations |
| Format | RDF/XML → converted to Turtle on import |

## License

WordNet 3.0 license — a BSD-style permissive license. Free use,
modification, and redistribution; attribution requested. Compatible with
Apache-2.0 and MIT downstream.

Full license text: <https://wordnet.princeton.edu/license-and-commercial-use>

## Why this replaces nothing

This dataset is shipped *alongside* MovieLens, not as a replacement.
MovieLens demonstrates property-graph patterns (people, movies, ratings).
WordNet demonstrates RDF round-trip + deep traversal (variable-length
hypernym chains, semantic siblings, polysemy via `containsWordSense`).

Two demos cover two different evaluation angles: a developer comparing
OpenGraphDB to Neo4j wants the MovieLens demo; a developer comparing it
to a triplestore wants the WordNet demo.

## How to load

```bash
bash scripts/load-wordnet-demo.sh
```

The script downloads `wn20basic.zip`, converts the RDF/XML payload to
Turtle, imports it via `ogdb import-rdf`, and prints a verification
query. Total wall-clock time on a warm cache: about 60 seconds.

See [`documentation/recipes/wordnet-traversal.md`](../../documentation/recipes/wordnet-traversal.md)
for sample Cypher queries (hypernym chains, semantic siblings, polysemy).
