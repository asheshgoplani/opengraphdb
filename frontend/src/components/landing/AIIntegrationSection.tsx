import { cn } from '@/lib/utils'
import { CodeSnippetCard } from './CodeSnippetCard'
import { useSectionInView } from './useSectionInView'

const LLM_TO_CYPHER = `from openai import OpenAI
import opengraphdb as ogdb

client = OpenAI()
db = ogdb.Database.open("movies.ogdb")
schema = db.schema_summary()  # labels, edge types, property keys

question = "find all actors who starred with Tom Hanks in drama movies"
resp = client.responses.create(
    model="gpt-4o",
    input=(
        f"Schema:\\n{schema}\\n\\n"
        f"Return one Cypher query (no prose) for: {question}"
    ),
)
cypher = resp.output_text.strip()

for row in db.query(cypher):
    print(row)
`

const EMBED_AND_SEARCH = `from sentence_transformers import SentenceTransformer
import opengraphdb as ogdb

model = SentenceTransformer("all-MiniLM-L6-v2")
db = ogdb.Database.open("docs.ogdb")

corpus = [
    {"title": "MVCC in Rust", "body": "Snapshot isolation without lock tables..."},
    {"title": "Cypher planner", "body": "Cost-based plans over canonical storage..."},
]
for doc in corpus:
    db.insert_node(
        labels=["Doc"],
        props={**doc, "embedding": model.encode(doc["body"]).tolist()},
    )

query = "how does transaction isolation work?"
hits = db.hybrid_search(
    text=query,
    vector=model.encode(query).tolist(),
    k=10,
)
for hit in hits:
    print(hit.score, hit.props["title"])
`

const COSMOS_MCP = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { OgdbClient } from "opengraphdb"
import { renderGraphPng } from "./cosmos-renderer.js"

const server = new McpServer({ name: "cosmos-graph-viz", version: "0.1.0" })
const db = new OgdbClient({ url: "http://localhost:7878" })

server.tool(
  "render_graph",
  "Execute a Cypher query and return the result as a PNG rendered via cosmos.gl",
  {
    cypher: { type: "string" },
    width: { type: "number", default: 1280 },
  },
  async ({ cypher, width }) => {
    const { nodes, edges } = await db.query(cypher)
    const png = await renderGraphPng({ nodes, edges, width })
    return {
      content: [
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      ],
    }
  },
)

await server.connect(process.stdin, process.stdout)
`

const MULTI_AGENT_KG = `import opengraphdb as ogdb
import time

# Agent A - scraper: writes facts
def agent_a():
    db = ogdb.Database.open("shared.ogdb")
    for fact in fetch_new_facts():
        with db.transaction() as tx:
            tx.insert_node(labels=["Fact"], props={"source": "a", **fact})

# Agent B - summarizer: reads a consistent snapshot while A is writing
def agent_b():
    db = ogdb.Database.open("shared.ogdb")
    while True:
        snap = db.snapshot()
        rows = snap.query(
            "MATCH (f:Fact) WHERE f.ingested_at > $t RETURN f",
            t=time.time() - 60,
        )
        publish_summary(rows)
        time.sleep(5)

# Agent C - ranker: updates scores; MVCC means readers never block
def agent_c():
    db = ogdb.Database.open("shared.ogdb")
    with db.transaction() as tx:
        tx.run("MATCH (f:Fact) SET f.score = pagerank(f)")
`

interface Pattern {
  title: string
  whyCare: string
  language: string
  code: string
  docHref: string
}

const PATTERNS: Pattern[] = [
  {
    title: 'LLM → Cypher query generation',
    whyCare:
      'Hand the LLM your schema, get back a Cypher query, execute it against the real engine — no plain-English query runtime shipping in the DB.',
    language: 'python',
    code: LLM_TO_CYPHER,
    docHref: '/docs/ai-integration/llm-to-cypher.md',
  },
  {
    title: 'Sentence embeddings + hybrid RRF search',
    whyCare:
      'Store vectors on nodes, then rank with vector + full-text fused via Reciprocal Rank Fusion in one round-trip — no sidecar search store to keep in sync.',
    language: 'python',
    code: EMBED_AND_SEARCH,
    docHref: '/docs/ai-integration/embeddings-hybrid-rrf.md',
  },
  {
    title: 'cosmos.gl visualization as an MCP tool',
    whyCare:
      'Wrap the frontend renderer as an MCP server so any agent can request a PNG of a graph slice — visual output, not prose, when that is what the task needs.',
    language: 'typescript',
    code: COSMOS_MCP,
    docHref: '/docs/ai-integration/cosmos-mcp-tool.md',
  },
  {
    title: 'Multi-agent shared knowledge graph',
    whyCare:
      'Three agents open the same .ogdb file. MVCC snapshot isolation means writers never block readers and every agent sees a consistent view.',
    language: 'python',
    code: MULTI_AGENT_KG,
    docHref: '/docs/ai-integration/multi-agent-shared-kg.md',
  },
]

const REVEAL_DELAY = ['', 'animate-delay-100', 'animate-delay-200', 'animate-delay-300']

export function AIIntegrationSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>()

  return (
    <section
      id="ai-integration"
      data-testid="ai-integration-section"
      ref={ref}
      className="scroll-mt-24 border-t border-border/60 bg-background py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div
          className={cn(
            'mb-16 max-w-3xl',
            isInView ? 'animate-reveal-up animate-fill-both' : 'opacity-0',
          )}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            04 — Wire it into your agents
          </p>
          <h2 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            AI integration — patterns, not a chatbot.
          </h2>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
            OpenGraphDB does not bundle an LLM. It gives agents a substrate —
            Cypher, MCP tools, hybrid search, MVCC — so you wire it into
            whatever stack you already run. Four patterns we test.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {PATTERNS.map((pattern, index) => (
            <div
              key={pattern.docHref}
              className={cn(
                isInView
                  ? `animate-reveal-up animate-fill-both ${REVEAL_DELAY[index] ?? ''}`
                  : 'opacity-0',
              )}
            >
              <CodeSnippetCard
                index={index}
                title={pattern.title}
                whyCare={pattern.whyCare}
                language={pattern.language}
                code={pattern.code}
                docHref={pattern.docHref}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
