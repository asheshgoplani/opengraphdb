import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown/renderMarkdown'

// EVAL-FRONTEND-QUALITY-CYCLE3.md H-6: the three "Read the pattern" links on
// the landing page used to point at `/documentation/ai-integration/*.md`,
// which resolve to a 404 / SPA-fallback because the markdown files live at
// the repo root rather than in `frontend/public/`. Cycle-3 ships an in-app
// `/docs/<slug>` route on the marketing build that lazy-loads the markdown
// content (Vite `?raw` import) and renders it with a minimal renderer.
//
// Adding a new pattern: drop the markdown next to the existing three in
// `documentation/ai-integration/`, add an entry to `DOC_REGISTRY`, and add
// the slug to the AIIntegrationSection card's `docHref`. The `Link` lazy-
// loads only the markdown that is being requested.

import llmToCypherRaw from '../../../documentation/ai-integration/llm-to-cypher.md?raw'
import embeddingsHybridRrfRaw from '../../../documentation/ai-integration/embeddings-hybrid-rrf.md?raw'
import cosmosMcpToolRaw from '../../../documentation/ai-integration/cosmos-mcp-tool.md?raw'

interface DocEntry {
  title: string
  source: string
  githubBlob: string
}

const DOC_REGISTRY: Record<string, DocEntry> = {
  'llm-to-cypher': {
    title: 'LLM → Cypher query generation',
    source: llmToCypherRaw,
    githubBlob:
      'https://github.com/asheshgoplani/opengraphdb/blob/main/documentation/ai-integration/llm-to-cypher.md',
  },
  'embeddings-hybrid-rrf': {
    title: 'Sentence embeddings + hybrid RRF search',
    source: embeddingsHybridRrfRaw,
    githubBlob:
      'https://github.com/asheshgoplani/opengraphdb/blob/main/documentation/ai-integration/embeddings-hybrid-rrf.md',
  },
  'cosmos-mcp-tool': {
    title: 'cosmos.gl visualization as an MCP tool',
    source: cosmosMcpToolRaw,
    githubBlob:
      'https://github.com/asheshgoplani/opengraphdb/blob/main/documentation/ai-integration/cosmos-mcp-tool.md',
  },
}

export default function DocPage() {
  const { slug } = useParams<{ slug: string }>()
  const entry = slug ? DOC_REGISTRY[slug] : undefined

  useEffect(() => {
    if (entry) {
      document.title = `${entry.title} — OpenGraphDB`
    }
  }, [entry])

  if (!entry) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24">
        <p className="mb-4 text-sm uppercase tracking-[0.22em] text-muted-foreground">
          404
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight text-foreground">
          Documentation page not found.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          The pattern you requested is not in the in-app documentation registry. It may
          live at the repo root only —{' '}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://github.com/asheshgoplani/opengraphdb/tree/main/documentation/ai-integration"
          >
            browse the GitHub source
          </a>
          .
        </p>
        <p className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </p>
      </main>
    )
  }

  const html = renderMarkdown(entry.source)

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      <p className="mb-6">
        <Link
          to="/#ai-integration"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          AI integration patterns
        </Link>
      </p>
      <article
        data-testid="doc-page-article"
        className="prose prose-neutral max-w-none dark:prose-invert"
        // The renderer escapes HTML in the source, then emits a curated
        // tagset (h1-h3, p, ul, ol, li, code, pre, a, strong, em, hr).
        // No user-controlled markdown reaches this surface today.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <hr className="my-12 border-border/60" />
      <p className="text-xs text-muted-foreground">
        View source on GitHub:{' '}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href={entry.githubBlob}
        >
          {entry.githubBlob.replace(/^https:\/\/github\.com\//, '')}
        </a>
      </p>
    </main>
  )
}
