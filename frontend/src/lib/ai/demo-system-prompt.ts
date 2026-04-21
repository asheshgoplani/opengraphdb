import type { DatasetKey } from '@/data/datasets'
import { DATASETS } from '@/data/datasets'

const DATASET_SCHEMAS: Record<DatasetKey, {
  labels: string
  relTypes: string
  props: string
  sampleEntities: string[]
  examples: Array<{ question: string; cypher: string }>
}> = {
  movielens: {
    labels: 'Movie, Genre',
    relTypes: 'IN_GENRE',
    props: 'title (string), released (number), genres (string), avgRating (float), ratingCount (number), name (string, Genre)',
    sampleEntities: ['The Shawshank Redemption', 'Toy Story', 'Pulp Fiction', 'Inception', 'The Matrix'],
    examples: [
      {
        question: 'Show me top rated Drama movies.',
        cypher: "MATCH (m:Movie)-[:IN_GENRE]->(g:Genre {name: 'Drama'})\nWHERE m.avgRating >= 4.4\nRETURN m.title AS title, m.avgRating AS rating\nORDER BY m.avgRating DESC\nLIMIT 25",
      },
      {
        question: 'Find movies released before 1990 with high ratings.',
        cypher: 'MATCH (m:Movie)\nWHERE m.released < 1990 AND m.avgRating >= 4.2\nRETURN m.title, m.released, m.avgRating\nORDER BY m.avgRating DESC\nLIMIT 25',
      },
    ],
  },
  airroutes: {
    labels: 'Airport, Country, Continent',
    relTypes: 'ROUTE, CONTAINS',
    props: 'code (string), icao (string), name (string), city (string), country (string), region (string), lat (float), lon (float), runways (number), elev (number)',
    sampleEntities: ['LHR (London Heathrow)', 'JFK (New York)', 'NRT (Tokyo Narita)', 'DXB (Dubai)', 'SIN (Singapore)'],
    examples: [
      {
        question: 'Find direct routes from London Heathrow.',
        cypher: "MATCH (lhr:Airport {code: 'LHR'})-[r:ROUTE]->(dest:Airport)\nRETURN dest.code AS destination, dest.city AS city, r.dist AS distance\nORDER BY r.dist\nLIMIT 25",
      },
      {
        question: 'Show airports in Germany.',
        cypher: "MATCH (a:Airport)\nWHERE a.country = 'DE'\nRETURN a.code, a.name, a.city\nLIMIT 25",
      },
    ],
  },
  got: {
    labels: 'Character, Season',
    relTypes: 'INTERACTS, APPEARS_IN',
    props: 'name (string), characterId (string), house (string), allegiance (string), weight (number, on INTERACTS), season (number, on INTERACTS)',
    sampleEntities: ['Jon Snow', 'Tyrion Lannister', 'Daenerys Targaryen', 'Cersei Lannister', 'Arya Stark'],
    examples: [
      {
        question: 'Who has the most interactions with Jon Snow?',
        cypher: "MATCH (jon:Character {name: 'Jon Snow'})-[r:INTERACTS]-(other:Character)\nRETURN other.name AS character, r.weight AS strength\nORDER BY r.weight DESC\nLIMIT 25",
      },
      {
        question: 'Show characters from House Stark.',
        cypher: "MATCH (c:Character)\nWHERE c.house = 'Stark'\nRETURN c.name, c.allegiance\nLIMIT 25",
      },
    ],
  },
  wikidata: {
    labels: 'Laureate, Category, Country, Institution',
    relTypes: 'WON_PRIZE_IN, BORN_IN, AFFILIATED_WITH',
    props: 'name (string), gender (string), birthYear (number), birthCountry (string), wikidataId (string), category (string, on Laureate), year (number, on WON_PRIZE_IN), field (string, on Category), code (string, on Country)',
    sampleEntities: ['Albert Einstein', 'Marie Curie', 'Physics', 'United States', 'Caltech'],
    examples: [
      {
        question: 'Who are the Chemistry Nobel laureates?',
        cypher: "MATCH (l:Laureate)-[r:WON_PRIZE_IN]->(c:Category {name: 'Chemistry'})\nRETURN l.name AS laureate, r.year AS year\nORDER BY r.year DESC\nLIMIT 25",
      },
      {
        question: 'Show laureates born in the United States.',
        cypher: "MATCH (l:Laureate)-[:BORN_IN]->(c:Country {code: 'US'})\nRETURN l.name, l.category\nLIMIT 25",
      },
    ],
  },
  community: {
    labels: 'Person, Character, City, Company',
    relTypes: 'KNOWS, INTERACTS, NEAR, WORKS_AT, LIVES_IN, LIKES, OWNS, RATED',
    props: 'name (string), cluster (string)',
    sampleEntities: ['Ada 1', 'Arwen 1', 'Kyoto 1', 'Helix 1'],
    examples: [
      {
        question: 'Show the hubs in each community.',
        cypher: 'MATCH (n)-[r]-() RETURN n, count(r) AS degree ORDER BY degree DESC LIMIT 20',
      },
      {
        question: 'Find edges bridging two clusters.',
        cypher: 'MATCH (a)-[r]->(b) WHERE a.cluster <> b.cluster RETURN a, r, b LIMIT 50',
      },
    ],
  },
}

export function buildDemoSystemPrompt(datasetKey: DatasetKey): string {
  const meta = DATASETS[datasetKey].meta
  const schema = DATASET_SCHEMAS[datasetKey]
  const examplesText = schema.examples
    .map(
      (ex, i) =>
        `**Example ${i + 1}:**\nUser: ${ex.question}\nAssistant: Here is a Cypher query for that.\n\`\`\`cypher\n${ex.cypher}\n\`\`\``
    )
    .join('\n\n')

  return `You are an expert Cypher query generator for OpenGraphDB, an openCypher-compatible graph database.

## Active Dataset: ${meta.name}

${meta.description}

## Graph Schema

Node labels: ${schema.labels}
Relationship types: ${schema.relTypes}
Property keys: ${schema.props}

## Sample Entities

${schema.sampleEntities.map((e) => `- ${e}`).join('\n')}

## Rules

1. Generate valid openCypher queries only.
2. Use LIMIT 25 for all queries in demo context.
3. Always briefly explain what the query does before showing it.
4. Wrap every Cypher query in a triple-backtick code block with the \`cypher\` language tag, like this:
   \`\`\`cypher
   MATCH (n) RETURN n LIMIT 25
   \`\`\`
5. Use exact property names and node labels from the schema above.
6. Keep explanations concise — one sentence before the query.

## Examples

${examplesText}`
}
