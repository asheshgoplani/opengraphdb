# Format Detection and Schema Inference Rules

These rules govern how you detect file formats and infer graph schemas from source data. Apply them in order when a user presents data for import.

## Step 1: Identify the File Format

Determine the format from the file extension first, then verify by inspecting content.

| Extension | Format | Verify By |
|-----------|--------|-----------|
| `.csv` | CSV | First line contains delimited headers |
| `.tsv` | TSV (tab-separated CSV) | Tab characters between values |
| `.json`, `.jsonl` | JSON | Starts with `[`, `{`, or line-delimited objects |
| `.ttl` | Turtle (RDF) | Contains `@prefix` declarations |
| `.nt` | N-Triples (RDF) | Lines of `<subject> <predicate> <object> .` |
| `.rdf`, `.xml` | RDF/XML | Starts with `<?xml` or `<rdf:RDF` |
| `.jsonld` | JSON-LD (RDF) | JSON with `@context` key |

If the extension is ambiguous or missing, inspect the first 10 lines of content:
- Lines with consistent delimiter characters (comma, tab, semicolon, pipe) suggest CSV.
- Content starting with `[` or `{` suggests JSON.
- Content with `@prefix` suggests Turtle.
- Lines matching `<...> <...> <...> .` suggest N-Triples.
- XML declarations suggest RDF/XML.

## Step 2: CSV Detection Rules

### Delimiter Detection

Check for these delimiters in order of frequency. Count occurrences in the first 5 lines and pick the most consistent one:

1. **Comma** (`,`): Default for `.csv` files
2. **Tab** (`\t`): Common for `.tsv` or database exports
3. **Semicolon** (`;`): Common in European locale exports
4. **Pipe** (`|`): Common in data warehouse exports

### Header Detection

- The first row is the header row. Extract column names by splitting on the detected delimiter.
- If column names contain spaces, normalize them to snake_case for property keys.
- If the first row looks like data (all numeric, no descriptive names), warn the user that headers may be missing.

### Type Inference from Sample Rows

Read 5-10 sample rows (or all rows if fewer than 10) and infer column types:

1. **Integer**: Every non-null value in the column parses as an integer (no decimal points). Examples: `42`, `-7`, `0`.
2. **Float**: Every non-null value parses as a number with decimal points. Examples: `3.14`, `-0.5`, `1.0`.
3. **Boolean**: Every non-null value is exactly `true` or `false` (case-insensitive).
4. **Date**: Every non-null value matches ISO 8601 date format (`YYYY-MM-DD`).
5. **DateTime**: Every non-null value matches ISO 8601 datetime format (`YYYY-MM-DDTHH:MM:SS`).
6. **String**: Default when none of the above match, or when mixed types are detected.

If a column has mixed types (e.g., some integers and some strings), default to String and log a warning.

### ID Column Detection

Look for columns that serve as unique identifiers:
- Column named exactly `id`, `_id`, `uuid`, `ID`, or `Id`
- Column ending with `_id` or `_uuid` (e.g., `employee_id`)
- Column named `key`, `code`, or `identifier`
- First column if it contains unique sequential integers

### Foreign Key Detection

Look for columns that reference other entities:
- Columns ending with `_id` that are NOT the primary ID (e.g., `department_id`, `manager_id`)
- Columns containing values that match another table's ID column
- Columns named `source`, `target`, `from`, `to`, `parent`, `child`

### Schema Inference Output

After detection, present the inferred schema in this format:

```
Detected Schema:
  Format: CSV (comma-delimited, UTF-8)
  Records: 1,247 rows (excluding header)

  Nodes:
    - :Person (name: String, age: Integer, email: String) [merge key: id]
    - :Company (name: String, industry: String) [merge key: name]

  Relationships:
    - (:Person)-[:WORKS_AT]->(:Company) via column 'company_id'
    - (:Person)-[:REPORTS_TO]->(:Person) via column 'manager_id'

  Notes:
    - Column 'id' detected as primary key (unique integers)
    - Column 'company_id' maps to Company nodes
    - 3 rows have null 'email' values (will import as null)
    - Column 'salary' has mixed types (integers and strings) — defaulting to String
```

## Step 3: JSON Detection Rules

### Structure Classification

Inspect the top-level JSON structure:

1. **Array of objects** (`[{...}, {...}, ...]`): Each object is a record. All records share the same label. Infer label from filename or ask the user.

2. **Object with array values** (`{"people": [...], "companies": [...]}`): Each key is a collection name (label candidate). Each array element is a record of that type.

3. **Single object** (`{...}`): One record. Infer label from filename or ask the user.

4. **JSON Lines** (`.jsonl`): Each line is a separate JSON object. Treat like an array of objects.

### Property Type Inference

For each field across all records:
- `"string value"` maps to String
- `42` (no quotes, no decimal) maps to Integer
- `3.14` (no quotes, has decimal) maps to Float
- `true` / `false` (no quotes) maps to Boolean
- `null` maps to null (nullable property)
- `[1.0, 2.0, 3.0]` (array of numbers) maps to Vector if length is consistent (embeddings)
- `[...]` (array of mixed types) maps to List
- `{...}` (nested object) indicates a potential embedded node or complex property

### Label Detection

Look for fields that indicate the node type:
- Fields named `type`, `label`, `category`, `kind`, `class`, or `_type`
- If found, group records by this field and create separate labels for each value

### Relationship Detection

Look for fields that indicate relationships:
- Fields ending with `_id` (foreign key reference)
- Fields named `source`, `target`, `from`, `to`, `parent`, `children`
- Fields containing arrays of IDs (one-to-many relationships)
- Nested objects with their own `id` field (embedded entity)

### Nested Object Handling

When a JSON record contains nested objects:
- If the nested object has an `id` or unique identifier, extract it as a separate node with a relationship.
- If the nested object is a simple key-value pair (no nesting), flatten it into properties with a prefix: `address.city` becomes `address_city`.
- Ask the user if ambiguous: "Should the nested 'address' object be a separate node or flattened into properties?"

## Step 4: RDF Detection Rules

### Format Identification

1. **Turtle** (`.ttl`): Look for `@prefix` declarations at the start.
2. **N-Triples** (`.nt`): Each line matches `<URI> <URI> <URI|literal> .`
3. **RDF/XML** (`.rdf`, `.xml`): Starts with XML declaration and contains `<rdf:RDF` root element.
4. **JSON-LD** (`.jsonld`): Valid JSON with `@context` key at the top level.

### RDF Import Strategy

Do NOT manually parse RDF into Cypher. Instead:
1. Identify the RDF format from extension and content.
2. Pass the entire content to the `import_rdf` MCP tool with the correct format parameter.
3. After import completes, call `browse_schema` to discover what labels, relationship types, and properties were created.
4. Report the created schema to the user.

### Post-RDF-Import Verification

After `import_rdf` completes:
1. Call `browse_schema` to get the new schema.
2. Run `MATCH (n) RETURN labels(n) AS label, count(n) AS count` to show node distribution.
3. Report which RDF classes became node labels and which predicates became relationship types.
4. Verify that `_uri` properties are preserved on nodes for round-trip fidelity.

## Step 5: Encoding Checks

Before processing any format:
- Assume UTF-8 encoding by default.
- If a BOM (Byte Order Mark) is detected at the start of the file, warn the user and strip it before processing.
- If non-UTF-8 characters are detected, warn and suggest re-encoding the file.
- Control characters (except tab and newline) should trigger a warning.
