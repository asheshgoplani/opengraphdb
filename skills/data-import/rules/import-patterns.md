# Import Patterns: Cypher Generation Rules

These rules govern how you generate Cypher statements for importing data into OpenGraphDB. Follow them exactly to produce correct, idempotent, and performant import pipelines.

## Core Principle: Idempotent Imports

Every import you generate MUST be idempotent. Running the same import twice produces the same database state. This means:

- Use `MERGE` instead of `CREATE` for all nodes and relationships.
- MERGE on the smallest unique key set (the natural identifier), not on all properties.
- Use `ON CREATE SET` for properties that should only be set on first insert.
- Use `ON MATCH SET` for properties that should be updated on re-import.
- For relationships, MERGE using both endpoint identifiers plus the relationship type.

## Pattern 1: Single Node Import (CSV Row-by-Row)

When importing a CSV where each row is a single node type:

```cypher
MERGE (n:Person {id: 42})
ON CREATE SET n.name = 'Alice', n.age = 30, n.email = 'alice@example.com'
ON MATCH SET n.name = 'Alice', n.age = 30, n.email = 'alice@example.com'
```

Generate one statement per row. The merge key (`id: 42`) must be the unique identifier column.

### String Escaping

When generating Cypher with inline values (not parameters), escape single quotes in string values:
- `O'Brien` becomes `'O''Brien'`
- Backslashes: `\` becomes `\\`
- Newlines in values: replace with `\n`
- Null values: omit the property from SET clause or use explicit `n.prop = null`

### Type Formatting

Format values according to their detected type:
- **String**: Wrap in single quotes: `'value'`
- **Integer**: No quotes: `42`
- **Float**: No quotes, include decimal: `3.14`
- **Boolean**: No quotes: `true` or `false`
- **Date**: Wrap in `date()`: `date('2024-01-15')`
- **DateTime**: Wrap in `datetime()`: `datetime('2024-01-15T10:30:00')`
- **null**: Use the keyword `null`
- **List**: Use brackets: `[1, 2, 3]` or `['a', 'b']`

## Pattern 2: Batch Node Import (UNWIND)

When importing multiple nodes of the same type, batch them using UNWIND:

```cypher
UNWIND [
  {id: 1, name: 'Alice', age: 30},
  {id: 2, name: 'Bob', age: 25},
  {id: 3, name: 'Carol', age: 35}
] AS row
MERGE (n:Person {id: row.id})
ON CREATE SET n.name = row.name, n.age = row.age
ON MATCH SET n.name = row.name, n.age = row.age
```

### Batch Size Guidelines

- **1-100 records**: Single UNWIND statement, all records in one batch.
- **100-500 records**: Split into batches of 100. Generate multiple UNWIND statements.
- **500-10,000 records**: Split into batches of 500.
- **10,000+ records**: Use the POST /import API instead (see Pattern 6).

When splitting into batches, present each batch as a separate `execute_cypher` call.

## Pattern 3: Multi-Label Import

When a CSV or JSON contains records of different types (e.g., a `type` column):

```cypher
// First: import all Person nodes
UNWIND [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}] AS row
MERGE (n:Person {id: row.id})
ON CREATE SET n.name = row.name;

// Then: import all Company nodes
UNWIND [{id: 101, name: 'Acme', industry: 'Tech'}] AS row
MERGE (n:Company {id: row.id})
ON CREATE SET n.name = row.name, n.industry = row.industry;
```

Group records by label and generate separate UNWIND blocks for each label.

## Pattern 4: Relationship Import

Relationships require that both endpoint nodes exist. Always import nodes first, then relationships.

### Two-Pass Strategy

**Pass 1: Create all nodes**
```cypher
MERGE (p:Person {id: 1})
ON CREATE SET p.name = 'Alice';

MERGE (c:Company {id: 101})
ON CREATE SET c.name = 'Acme';
```

**Pass 2: Create relationships**
```cypher
MATCH (p:Person {id: 1})
MATCH (c:Company {id: 101})
MERGE (p)-[:WORKS_AT]->(c);
```

### Relationship with Properties

```cypher
MATCH (p:Person {id: 1})
MATCH (c:Company {id: 101})
MERGE (p)-[r:WORKS_AT]->(c)
ON CREATE SET r.since = 2020, r.role = 'Engineer'
ON MATCH SET r.since = 2020, r.role = 'Engineer';
```

### Batch Relationship Import

```cypher
UNWIND [
  {from_id: 1, to_id: 101, since: 2020},
  {from_id: 2, to_id: 101, since: 2021}
] AS row
MATCH (p:Person {id: row.from_id})
MATCH (c:Company {id: row.to_id})
MERGE (p)-[r:WORKS_AT]->(c)
ON CREATE SET r.since = row.since;
```

### Self-Referencing Relationships

When a column references the same entity type (e.g., `manager_id` in an employees table):

```cypher
// First: create all employee nodes
UNWIND [...] AS row
MERGE (e:Employee {id: row.id})
ON CREATE SET e.name = row.name;

// Then: create reporting relationships
UNWIND [{id: 2, manager_id: 1}, {id: 3, manager_id: 1}] AS row
MATCH (e:Employee {id: row.id})
MATCH (m:Employee {id: row.manager_id})
MERGE (e)-[:REPORTS_TO]->(m);
```

Skip rows where `manager_id` is null (top-level employees with no manager).

## Pattern 5: JSON Nested Object Import

When JSON contains nested objects that should become separate nodes:

```json
{
  "name": "Alice",
  "company": {"name": "Acme", "industry": "Tech"}
}
```

Generate:
```cypher
MERGE (c:Company {name: 'Acme'})
ON CREATE SET c.industry = 'Tech';

MERGE (p:Person {name: 'Alice'})
MERGE (p)-[:WORKS_AT]->(c);
```

Always create the referenced (nested) node first, then the parent node, then the relationship.

## Pattern 6: POST /import API (Large Datasets)

For datasets exceeding 10,000 records, use the bulk import API instead of Cypher:

```json
[
  {"type": "node", "labels": ["Person"], "properties": {"name": "Alice", "age": 30}},
  {"type": "node", "labels": ["Person"], "properties": {"name": "Bob", "age": 25}},
  {"type": "edge", "from": 0, "to": 1, "edge_type": "KNOWS", "properties": {"since": 2020}}
]
```

Key rules for the POST /import format:
- `"from"` and `"to"` reference **array indices** (0-based position in the import array), not node IDs.
- Node records must appear before any edge records that reference them.
- Labels is an array (supports multi-label nodes): `["Person", "Employee"]`.
- All property values must be JSON-serializable.

When generating POST /import payloads:
1. Assign sequential indices to all node records.
2. Build an index mapping entity IDs to array positions.
3. Generate edge records using the mapped positions for `from` and `to`.
4. Split into batches of 1,000-5,000 records per API call.

## Pattern 7: RDF Import

Do NOT convert RDF to Cypher manually. Use the `import_rdf` MCP tool:

```
import_rdf(format: "turtle", data: "<file-contents>")
```

Valid format values: `"turtle"`, `"ntriples"`, `"rdfxml"`

After calling `import_rdf`:
1. Call `browse_schema` to see the created labels and relationships.
2. Report the mapping: which RDF classes became node labels, which predicates became edges.
3. Verify `_uri` properties are preserved on imported nodes.

## Import Execution Order

When generating a complete import pipeline, execute in this order:

1. **Pre-check**: `browse_schema` to see existing state.
2. **Nodes first**: All node MERGE statements, grouped by label.
3. **Relationships second**: All relationship MERGE statements, after nodes exist.
4. **Verification**: Count queries for each label and relationship type.

Never interleave node and relationship creation within the same batch.

## Error Recovery

If a batch fails mid-import:
- Report which batch failed and the error message.
- Because all statements use MERGE, the user can fix the issue and re-run the entire import safely.
- Suggest running the failed batch alone to isolate the problematic record.
- Check for common issues: missing quotes, special characters in strings, type mismatches.

## Property Key Naming Conventions

When converting source column names to graph property keys:
- Use snake_case: `first_name`, not `firstName` or `First Name`.
- Remove special characters: `email (work)` becomes `email_work`.
- Lowercase all keys: `Name` becomes `name`.
- Preserve numeric suffixes: `address_1`, `phone_2`.
- Avoid reserved words: if a column is named `type` or `id`, prefix with the label: `person_type`, `person_id`.
