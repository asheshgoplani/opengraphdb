import { useCallback, useEffect, useState } from 'react'
import { Database, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { ApiClient } from '@/api/client'
import { GOT_SAMPLE } from '@/data/gotGraph.js'

// Shown when Live mode is on AND the backend schema is empty. The whole point
// is that on a fresh `ogdb serve --http` against an empty db, flipping Live
// mode on used to silently strand users — the guided query cards would all
// return 0 rows, and there was no in-UI path to "how do I load data?". This
// CTA gives one: a one-click seed that POSTs the bundled Game of Thrones
// sample (smallest of the bundled sets) into the live db via /import.

export interface LiveEmptyDbCTAProps {
  serverUrl: string
  onSeeded?: () => void
}

type SchemaState =
  | { phase: 'checking' }
  | { phase: 'empty' }
  | { phase: 'populated' }
  | { phase: 'unreachable' }

type SeedState =
  | { phase: 'idle' }
  | { phase: 'seeding' }
  | { phase: 'done'; nodes: number; edges: number }
  | { phase: 'error'; message: string }

interface ImportPayload {
  nodes: Array<{ id: number; labels: string[]; properties: Record<string, unknown> }>
  edges: Array<{ src: number; dst: number; edge_type?: string; properties: Record<string, unknown> }>
}

function buildImportPayload(): ImportPayload {
  const idMap = new Map<string | number, number>()
  const nodes: ImportPayload['nodes'] = GOT_SAMPLE.nodes.map((node, idx) => {
    idMap.set(node.id, idx)
    return {
      id: idx,
      labels: node.labels,
      properties: node.properties,
    }
  })
  const edges: ImportPayload['edges'] = []
  for (const link of GOT_SAMPLE.links) {
    const src = typeof link.source === 'object' ? link.source.id : link.source
    const dst = typeof link.target === 'object' ? link.target.id : link.target
    const mappedSrc = idMap.get(src)
    const mappedDst = idMap.get(dst)
    if (mappedSrc === undefined || mappedDst === undefined) continue
    edges.push({
      src: mappedSrc,
      dst: mappedDst,
      edge_type: link.type,
      properties: link.properties,
    })
  }
  return { nodes, edges }
}

export function LiveEmptyDbCTA({ serverUrl, onSeeded }: LiveEmptyDbCTAProps) {
  const [schemaState, setSchemaState] = useState<SchemaState>({ phase: 'checking' })
  const [seedState, setSeedState] = useState<SeedState>({ phase: 'idle' })

  const checkSchema = useCallback(async () => {
    const client = new ApiClient(serverUrl)
    try {
      const schema = await client.schema()
      if (schema.labels.length === 0) {
        setSchemaState({ phase: 'empty' })
      } else {
        setSchemaState({ phase: 'populated' })
      }
    } catch {
      setSchemaState({ phase: 'unreachable' })
    }
  }, [serverUrl])

  useEffect(() => {
    void checkSchema()
  }, [checkSchema])

  const handleSeed = useCallback(async () => {
    setSeedState({ phase: 'seeding' })
    try {
      const payload = buildImportPayload()
      const res = await fetch(`${serverUrl}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message || `POST /import returned ${res.status}`)
      }
      const json = (await res.json()) as {
        imported_nodes?: number
        imported_edges?: number
      }
      setSeedState({
        phase: 'done',
        nodes: json.imported_nodes ?? payload.nodes.length,
        edges: json.imported_edges ?? payload.edges.length,
      })
      setSchemaState({ phase: 'populated' })
      onSeeded?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to seed live db'
      setSeedState({ phase: 'error', message })
    }
  }, [serverUrl, onSeeded])

  if (schemaState.phase === 'populated' || schemaState.phase === 'unreachable') {
    return null
  }

  if (seedState.phase === 'done') {
    return (
      <section
        data-testid="live-empty-db-cta-done"
        className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 px-3 py-3 text-[11px] text-emerald-100/95"
      >
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <div>
            <p className="font-serif text-[13px] leading-tight text-emerald-50">
              Seeded live db
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">
              {seedState.nodes} nodes · {seedState.edges} edges · Game of Thrones
            </p>
            <p className="mt-2 text-[11px] leading-snug text-emerald-100/80">
              Run a guided query above to see the data.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid="live-empty-db-cta"
      className="rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-3 text-[11px] text-amber-100/90"
    >
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[13px] leading-tight text-amber-50">
            Live DB is empty
          </p>
          <p className="mt-1 text-[11px] leading-snug text-amber-100/75">
            Live mode is on, but no labels or edges are in the connected database yet. Seed it with a bundled sample to make the guided queries return data.
          </p>
          <button
            type="button"
            data-testid="live-empty-db-cta-button"
            onClick={() => {
              void handleSeed()
            }}
            disabled={seedState.phase === 'seeding'}
            className="mt-2 inline-flex items-center gap-1.5 rounded border border-amber-300/50 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-50 hover:border-amber-200/70 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {seedState.phase === 'seeding' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                seeding…
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                Load Sample Dataset into Live DB
              </>
            )}
          </button>
          {seedState.phase === 'error' && (
            <p className="mt-2 inline-flex items-start gap-1 text-[10px] text-red-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{seedState.message}</span>
            </p>
          )}
          <p className="mt-2 text-[10px] leading-snug text-amber-100/55">
            Or drop a .ttl / .nt file on the RDF zone below, or run{' '}
            <code className="rounded bg-black/30 px-1 py-px font-mono text-[10px] text-amber-50/85">
              ogdb import datasets/movielens.json
            </code>{' '}
            from the repo root.
          </p>
        </div>
      </div>
    </section>
  )
}
