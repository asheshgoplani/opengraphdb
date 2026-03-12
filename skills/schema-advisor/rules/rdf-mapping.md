# RDF Mapping

RDF ontology mapping guidance for OpenGraphDB. Use these rules when designing schemas
that need interoperability with semantic web standards, or when advising users on
importing and exporting RDF data.

## RDF to Graph Mapping

OpenGraphDB maps RDF concepts to its graph model as follows:

| RDF Concept              | OpenGraphDB Element        | Example                             |
|--------------------------|----------------------------|--------------------------------------|
| RDF Class (rdfs:Class)   | Node label                 | `foaf:Person` -> `:Person`          |
| RDF Individual           | Node (with `_uri` property)| `<http://example.org/alice>` -> node |
| Object Property          | Relationship type          | `foaf:knows` -> `:KNOWS`            |
| Datatype Property        | Node property              | `foaf:name` -> `name`               |
| rdf:type triple          | Label assignment           | `alice rdf:type foaf:Person` -> `:Person` label |
| Blank node               | Anonymous node (no `_uri`) | `_:b1` -> node without URI          |

## URI Preservation

OpenGraphDB stores the original RDF URI as the `_uri` property on each node. This
enables round-trip fidelity: import RDF, work with it as a property graph, then
export back to RDF without losing identity.

```cypher
// After RDF import, nodes have _uri:
MATCH (n:Person) WHERE n._uri = 'http://example.org/alice' RETURN n

// _uri is the canonical identifier for RDF entities
CREATE INDEX ON :Person(_uri);
```

Always recommend indexing `_uri` on labels that originate from RDF data.

## Import Process

Use the `import_rdf` MCP tool to import RDF data. Supported formats:
- Turtle (.ttl)
- N-Triples (.nt)
- RDF/XML (.rdf)

The import tool handles:
- **URI to node mapping**: Each unique URI becomes a node with `_uri` property
- **Literal to property conversion**: RDF literals become node property values
- **Blank node creation**: Blank nodes become anonymous nodes without `_uri`
- **Multi-value properties**: Multiple values for the same property create multiple entries
- **Type inference**: `rdf:type` triples assign labels to nodes

Example import workflow:
```
1. Call import_rdf with Turtle content or file path
2. Call browse_schema to see the resulting labels and properties
3. Create indexes on _uri for each imported label
4. Query the imported graph with Cypher
```

## Export Process

Use the `export_rdf` MCP tool to export graph data as RDF. The export reconstructs
RDF triples from the graph:

| Graph Element       | RDF Triple                                      |
|---------------------|-------------------------------------------------|
| Node label          | `<_uri> rdf:type <class_uri>`                   |
| Node property       | `<_uri> <property_uri> "value"^^xsd:type`       |
| Relationship        | `<source_uri> <predicate_uri> <target_uri>`     |
| `_uri` property     | Used as subject/object URI in triples            |
| Node without `_uri` | Generated blank node identifier                  |

## Ontology Design for Graph

When designing an ontology that will be used with OpenGraphDB, follow these guidelines:

### Keep Class Hierarchies Flat

Deep class hierarchies (5+ levels) map poorly to labels. Prefer 1-2 levels of hierarchy:

**Good:**
```
:Person
:Organization
:Event
```

**Avoid:**
```
:Agent > :Person > :Employee > :Manager > :SeniorManager
```

If you need deep hierarchies, use relationship-based modeling:
```cypher
(:Role {name: 'Senior Manager'})-[:REPORTS_TO]->(:Role {name: 'VP'})
```

### Domain and Range Inform Schema

OWL domain and range restrictions map directly to label constraints:

```
foaf:knows  domain: foaf:Person  range: foaf:Person
  -> (:Person)-[:KNOWS]->(:Person)

schema:worksFor  domain: schema:Person  range: schema:Organization
  -> (:Person)-[:WORKS_FOR]->(:Organization)
```

### Multi-Valued Properties

RDF supports multiple values per property naturally. In OpenGraphDB, handle multi-valued
properties by:
- Using separate nodes for complex values: `(:Person)-[:HAS_EMAIL]->(:Email {address: '...'})`
- Using array properties for simple values (if supported by query patterns)

## Common RDF Vocabularies

When designing schemas for RDF interoperability, recommend these standard vocabularies:

| Vocabulary    | Prefix     | Use For                              | Key Classes/Properties            |
|---------------|------------|--------------------------------------|-----------------------------------|
| Schema.org    | `schema:`  | General-purpose web data             | Person, Organization, Event, name |
| FOAF          | `foaf:`    | Social networks, people              | Person, knows, name, mbox         |
| Dublin Core   | `dc:`      | Documents, metadata                  | title, creator, date, subject     |
| SKOS          | `skos:`    | Taxonomies, concept schemes          | Concept, broader, narrower        |
| OWL           | `owl:`     | Ontology definitions                 | Class, ObjectProperty, sameAs     |
| RDF Schema    | `rdfs:`    | Basic schema vocabulary              | Class, subClassOf, label          |

### Mapping Standard Vocabularies to OpenGraphDB

```cypher
// schema:Person -> :Person label
// foaf:name -> name property
// schema:worksFor -> :WORKS_FOR relationship
// dc:title -> title property
// skos:broader -> :BROADER relationship

// Example: Schema.org Person
CREATE (p:Person {
  _uri: 'http://example.org/alice',
  name: 'Alice Smith',
  email: 'alice@example.org',
  jobTitle: 'Engineer'
})

// Example: SKOS Concept
CREATE (c1:Concept {_uri: 'http://example.org/graph-db', label: 'Graph Database'})
CREATE (c2:Concept {_uri: 'http://example.org/database', label: 'Database'})
CREATE (c1)-[:BROADER]->(c2)
```

## Checklist for RDF-Ready Schemas

When designing a schema that needs RDF interoperability:

1. Assign `_uri` properties to all nodes that need stable RDF identity
2. Use standard vocabulary prefixes where applicable
3. Keep label names aligned with RDF class names (`:Person` not `:User`)
4. Use relationship types that map to standard predicates (`:KNOWS` for `foaf:knows`)
5. Index `_uri` on all labels that will be exported/imported
6. Document the ontology mapping in your schema description
