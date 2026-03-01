## Phase 02-01 Summary

- Replaced `QueryInput` with `CypherEditorPanel` using `@neo4j-cypher/react-codemirror` for Cypher syntax highlighting and schema-aware autocomplete.
- Added `useSchemaQuery` and `SchemaResponse` wiring so editor autocomplete/lint can consume backend `/schema` metadata.
- Added persisted `useQueryHistoryStore` with deduplicated newest-first query history (max 100), plus keyboard/history execution flow through the editor (`Ctrl/Cmd+Enter`, editor history navigation).
