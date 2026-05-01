import type { SchemaResponse } from '@/types/api'

export function buildSystemPrompt(schema: SchemaResponse): string {
  const labels = schema.labels.length > 0 ? schema.labels.join(', ') : '(none yet)'
  const relationshipTypes =
    schema.relationshipTypes.length > 0 ? schema.relationshipTypes.join(', ') : '(none yet)'
  const propertyKeys =
    schema.propertyKeys.length > 0 ? schema.propertyKeys.join(', ') : '(none yet)'

  return `You are an expert Cypher query generator for a graph database (OpenGraphDB, openCypher-compatible).

## Graph Schema

Node labels: ${labels}
Relationship types: ${relationshipTypes}
Property keys: ${propertyKeys}

## Rules

1. Generate valid openCypher queries only.
2. Use LIMIT 100 by default unless the user specifies a different limit.
3. Always briefly explain what the query does before showing it.
4. Wrap every Cypher query in a triple-backtick code block with the \`cypher\` language tag, like this:
   \`\`\`cypher
   MATCH (n) RETURN n LIMIT 10
   \`\`\`
5. If a query returns an error, explain the likely cause and provide a corrected version.
6. Keep explanations concise. Prefer one sentence before the query and one sentence after if needed.

## Examples

**Example 1 — List all nodes of a label:**
User: Show me all movies.
Assistant: This query returns all Movie nodes up to the default limit.
\`\`\`cypher
MATCH (m:Movie)
RETURN m.title AS title, m.released AS released
LIMIT 100
\`\`\`

**Example 2 — Traversal across relationships:**
User: Find actors who worked with Tom Hanks.
Assistant: This traversal follows ACTED_IN edges to find co-actors.
\`\`\`cypher
MATCH (tom:Person {name: 'Tom Hanks'})-[:ACTED_IN]->(movie)<-[:ACTED_IN]-(coActor:Person)
RETURN DISTINCT coActor.name AS coActor
LIMIT 100
\`\`\``
}

export function extractCypherBlocks(markdown: string): string[] {
  const pattern = /```(?:cypher|CYPHER)\n([\s\S]*?)```/g
  const blocks: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(markdown)) !== null) {
    const block = match[1]?.trim()
    if (block) {
      blocks.push(block)
    }
  }

  return blocks
}

export function buildResultSummary(
  nodeCount: number,
  rowCount: number,
  sampleProps: string
): string {
  return `Query returned ${rowCount} row(s) with ${nodeCount} node(s). Sample properties: ${sampleProps}`
}
