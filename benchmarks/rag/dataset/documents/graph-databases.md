# Graph Databases

## Introduction to Graph Databases

Graph databases are database management systems that use graph structures to store, map, and
query relationships between data. Unlike relational databases, which store data in tables with
foreign key relationships, graph databases natively represent entities as nodes and connections
as edges with properties. This native representation makes graph databases especially efficient
for traversal queries that follow chains of relationships, avoiding the costly JOIN operations
required by relational systems.

## Property Graphs

The property graph model is the dominant model used in graph databases. In a property graph,
nodes represent entities and can have labels (categories) and properties (key-value pairs).
Edges represent relationships between nodes and can also have types and properties. For example,
a social network might have Person nodes with name and age properties, connected by FOLLOWS
edges with a since property. OpenGraphDB implements the property graph model with support for
labeled nodes, typed edges, and arbitrary property values.

## Graph Query Languages

Cypher is the most widely used query language for property graph databases, originally developed
for Neo4j and now maintained as an open standard (openCypher). Cypher uses an ASCII-art style
pattern syntax to express graph traversal queries. SPARQL is used to query RDF graphs (triples
stores). GQL is a newer ISO standard for graph query languages that aims to unify Cypher and
other graph query approaches. OpenGraphDB supports Cypher queries and is evolving toward GQL
compatibility.

## Graph Traversal Algorithms

Graph traversal algorithms explore nodes and edges in a systematic order. Breadth-first search
(BFS) explores nodes level by level, starting from a source node. Depth-first search (DFS)
explores as deep as possible along each branch before backtracking. In the context of graph
databases, traversal powers queries such as finding shortest paths, discovering neighborhoods,
and detecting clusters. Efficient traversal requires well-designed indexes and compact storage
layouts such as the Compressed Sparse Row (CSR) format used in OpenGraphDB.

## Graph Algorithms

Beyond basic traversal, graph databases support specialized algorithms. PageRank measures node
importance based on incoming link structure, originally used by Google for web ranking. Community
detection algorithms such as Leiden and Louvain identify groups of densely connected nodes.
Betweenness centrality measures how often a node lies on the shortest path between other nodes.
These algorithms are used in social network analysis, fraud detection, recommendation systems,
and bioinformatics.

## Graph-Based Machine Learning

Graph-based machine learning methods leverage graph structure to improve model accuracy.
Knowledge graph embeddings (TransE, RotatE, ComplEx) learn vector representations of entities
and relationships, enabling AI systems to answer questions about the graph. Graph neural networks
(GNNs) extend neural networks to operate on graph structured data, enabling node classification,
link prediction, and graph-level prediction. OpenGraphDB provides graph traversal and community
detection features that are especially useful for graph-based machine learning applications.

## Knowledge Graphs

A knowledge graph is a network of real-world entities and the semantic relationships between
them. Knowledge graphs power search engines (Google's Knowledge Graph), virtual assistants,
and question answering systems. RDF (Resource Description Framework) is the W3C standard for
representing knowledge graphs as subject-predicate-object triples. OpenGraphDB supports RDF
import and export through the oxrdfio library, preserving source URIs for round-trip fidelity.
The connection between knowledge graphs and artificial intelligence is deep: AI systems use
knowledge graphs for reasoning, entity disambiguation, and enriching training data.

## Graph-Native RAG

Graph-native retrieval-augmented generation (RAG) uses the graph structure itself as the
retrieval index, avoiding the construction of a separate vector database. Instead of indexing
documents as flat chunks, graph-native RAG creates Document, Section, and Content nodes with
structural edges. Community detection identifies topical clusters. At query time, a hybrid
retrieval strategy combines BM25 text search, vector similarity search, and graph traversal
to find the most relevant nodes. Reciprocal Rank Fusion (RRF) combines the scores from all
signals. Cross-reference to machine learning: graph-native RAG is an application of graph
machine learning to information retrieval.
