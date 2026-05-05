import { cn } from '@/lib/utils'
import { CodeSnippetCard } from './CodeSnippetCard'
import { useSectionInView } from './useSectionInView'

const LLM_TO_CYPHER = `from openai import OpenAI
import opengraphdb as ogdb
import requests

client = OpenAI()
db = ogdb.Database.open("movies.ogdb")

# Schema for the LLM context. Database::schema_catalog() lives on the Rust
# core; the Python binding does not bridge it. Use the \`schema\` MCP tool
# over HTTP instead — start \`ogdb serve --http\` in another shell first.
schema = requests.post(
    "http://localhost:8080/mcp/invoke",
    json={"name": "schema"},
).json()

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
db.create_vector_index("doc_embed", "Doc", "embedding", 384, "cosine")
db.create_fulltext_index("doc_body", ["body"], "Doc")

corpus = [
    {"title": "MVCC in Rust", "body": "Snapshot isolation without lock tables..."},
    {"title": "Cypher planner", "body": "Cost-based plans over canonical storage..."},
]
for doc in corpus:
    db.create_node(
        labels=["Doc"],
        properties={**doc, "embedding": model.encode(doc["body"]).tolist()},
    )

# Vector + full-text retrieval from the same store. The Python binding exposes
# them as separate calls; for one-round-trip RRF fusion use \`POST /rag/search\`
# over HTTP (start \`ogdb serve --http\` in another shell).
query = "how does transaction isolation work?"
qvec = model.encode(query).tolist()
vector_hits = db.vector_search("doc_embed", qvec, 10)
text_hits = db.text_search("doc_body", query, 10)
for hit in vector_hits + text_hits:
    print(hit["score"], hit["node"])
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

// Cycle-2 docs eval C2-B2: the "multi-agent shared KG" pattern was removed.
// Database::open takes a single-process exclusive write lock today
// (BENCHMARKS.md row 9 / § 4.6 calls multi-writer "single-writer-kernel-limited;
// the N=4 measurement is mechanical, not real contention"). The earlier snippet
// claimed Database.open("shared.ogdb") "Just Works across processes" — it does
// not. Multi-writer is a v0.5 roadmap item; do not re-add this pattern until
// the kernel actually supports it.

interface Pattern {
  title: string
  whyCare: string
  language: string
  code: string
  docHref: string
}

// EVAL-FRONTEND-QUALITY-CYCLE3.md H-6: docHref points at the in-app
// /docs/<slug> route (rendered by frontend/src/pages/DocPage.tsx) rather
// than a `.md` URL. The cycle-2 paths (`/documentation/ai-integration/*.md`)
// resolved to a 404 / SPA-fallback in production because the markdown
// files live at the repo root, not under `frontend/public/`.
const PATTERNS: Pattern[] = [
  {
    title: 'LLM → Cypher query generation',
    whyCare:
      'Hand the LLM your schema, get back a Cypher query, execute it against the real engine — no plain-English query runtime shipping in the DB.',
    language: 'python',
    code: LLM_TO_CYPHER,
    docHref: '/docs/llm-to-cypher',
  },
  {
    title: 'Sentence embeddings + hybrid RRF search',
    whyCare:
      'Store vectors on nodes, then rank with vector + full-text fused via Reciprocal Rank Fusion in one round-trip — no sidecar search store to keep in sync.',
    language: 'python',
    code: EMBED_AND_SEARCH,
    docHref: '/docs/embeddings-hybrid-rrf',
  },
  {
    title: 'cosmos.gl visualization as an MCP tool',
    whyCare:
      'Wrap the frontend renderer as an MCP server so any agent can request a PNG of a graph slice — visual output, not prose, when that is what the task needs.',
    language: 'typescript',
    code: COSMOS_MCP,
    docHref: '/docs/cosmos-mcp-tool',
  },
]

const REVEAL_DELAY = ['', 'animate-delay-100', 'animate-delay-200']

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
