import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, X, CheckCircle2, Database, AlertTriangle } from 'lucide-react'
import type { GraphData } from '@/types/graph'
import { parseRDFText, triplesToGraphData, type ParsedRDF, type Triple } from '@/data/rdfParser'
import {
  rdfFormatFromFilename,
  uploadRdf,
  type ImportResponse,
} from '@/lib/rdfClient'

export type RDFImportSource =
  | { kind: 'live'; filename: string; dbPath: string; response: ImportResponse }
  | { kind: 'preview'; filename: string; reason: 'backend-down' | 'client-only' }

export interface RDFDropzoneProps {
  onImport: (graph: GraphData, source: RDFImportSource) => void
}

type State =
  | { phase: 'idle' }
  | { phase: 'dragging' }
  | { phase: 'parsing'; filename: string }
  | { phase: 'preview'; filename: string; parsed: ParsedRDF; rawText: string }
  | { phase: 'uploading'; filename: string; parsed: ParsedRDF; rawText: string }
  | {
      phase: 'persisted'
      filename: string
      response: ImportResponse
    }
  | {
      phase: 'preview-only'
      filename: string
      parsed: ParsedRDF
      rawText: string
      reason: 'backend-down'
    }
  | { phase: 'error'; message: string }

const ACCEPTED_EXTENSIONS = ['.ttl', '.nt', '.jsonld', '.nq', '.n3', '.rdf', '.xml']

function isRdfFile(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function RDFDropzone({ onImport }: RDFDropzoneProps) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const dragCounter = useRef(0)
  const overlayRef = useRef<HTMLDivElement>(null)

  const ingestFile = useCallback(async (file: File) => {
    if (!isRdfFile(file.name)) {
      setState({
        phase: 'error',
        message: `Unsupported file type. Try ${ACCEPTED_EXTENSIONS.join(', ')}`,
      })
      return
    }
    setState({ phase: 'parsing', filename: file.name })
    try {
      const text = await file.text()
      const parsed = parseRDFText(text, file.name)
      if (parsed.triples.length === 0) {
        setState({ phase: 'error', message: 'No triples recognised in this file.' })
        return
      }
      setState({ phase: 'preview', filename: file.name, parsed, rawText: text })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse RDF'
      setState({ phase: 'error', message })
    }
  }, [])

  useEffect(() => {
    const handleEnter = (event: DragEvent) => {
      dragCounter.current += 1
      setState((prev) => (prev.phase === 'preview' ? prev : { phase: 'dragging' }))
      event.preventDefault()
    }
    const handleOver = (event: DragEvent) => {
      event.preventDefault()
    }
    const handleLeave = () => {
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) {
        setState((prev) => (prev.phase === 'dragging' ? { phase: 'idle' } : prev))
      }
    }
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault()
      dragCounter.current = 0
      const file = event.dataTransfer?.files?.[0]
      if (!file) {
        setState({ phase: 'idle' })
        return
      }
      await ingestFile(file)
    }

    document.body.addEventListener('dragenter', handleEnter)
    document.body.addEventListener('dragover', handleOver)
    document.body.addEventListener('dragleave', handleLeave)
    document.body.addEventListener('drop', handleDrop)
    return () => {
      document.body.removeEventListener('dragenter', handleEnter)
      document.body.removeEventListener('dragover', handleOver)
      document.body.removeEventListener('dragleave', handleLeave)
      document.body.removeEventListener('drop', handleDrop)
    }
  }, [ingestFile])

  const handlePickFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPTED_EXTENSIONS.join(',')
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) await ingestFile(file)
    }
    input.click()
  }, [ingestFile])

  const handleCommit = useCallback(async () => {
    if (state.phase !== 'preview') return
    const { filename, parsed, rawText } = state
    setState({ phase: 'uploading', filename, parsed, rawText })

    const fileForUpload = new File([rawText], filename, { type: 'text/turtle' })
    const format = rdfFormatFromFilename(filename)

    let outcome
    try {
      outcome = await uploadRdf(fileForUpload, format)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'rdf import failed'
      setState({ phase: 'error', message })
      return
    }

    if (outcome.kind === 'ok') {
      const graph = triplesToGraphData(parsed.triples)
      onImport(graph, {
        kind: 'live',
        filename,
        dbPath: outcome.response.db_path,
        response: outcome.response,
      })
      setState({ phase: 'persisted', filename, response: outcome.response })
      return
    }
    if (outcome.kind === 'backend-down') {
      const graph = triplesToGraphData(parsed.triples)
      onImport(graph, { kind: 'preview', filename, reason: 'backend-down' })
      setState({ phase: 'preview-only', filename, parsed, rawText, reason: 'backend-down' })
      return
    }
    setState({
      phase: 'error',
      message: `server rejected import (${outcome.status}): ${outcome.message}`,
    })
  }, [state, onImport])

  const handleDismiss = useCallback(() => {
    setState({ phase: 'idle' })
  }, [])

  if (state.phase === 'idle') {
    return (
      <button
        type="button"
        onClick={handlePickFile}
        data-testid="rdf-dropzone-trigger"
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-left text-muted-foreground transition-all duration-200 hover:border-accent hover:bg-accent/10 hover:text-accent-foreground"
      >
        <FileUp className="h-3.5 w-3.5 shrink-0 text-accent" />
        <div className="flex flex-col leading-tight">
          <span className="font-serif text-[12px] tracking-tight">Drop an RDF file</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
            .ttl · .nt · .jsonld · .nq
          </span>
        </div>
      </button>
    )
  }

  if (state.phase === 'dragging') {
    return (
      <div
        ref={overlayRef}
        data-testid="rdf-dropzone-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md"
      >
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent bg-accent/20 px-12 py-10 shadow-[0_0_60px_rgba(34,211,238,0.35)]">
          <FileUp className="h-10 w-10 text-accent" />
          <p className="font-serif text-2xl tracking-tight text-foreground">Drop a .ttl file to import</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            rdf · turtle · n-triples · json-ld · n-quads
          </p>
        </div>
      </div>
    )
  }

  if (state.phase === 'parsing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-5 py-3 text-foreground/85">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="font-mono text-[11px]">Parsing {state.filename}…</span>
        </div>
      </div>
    )
  }

  if (state.phase === 'uploading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
        <div
          data-testid="rdf-import-uploading"
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-5 py-3 text-foreground/85"
        >
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="font-mono text-[11px]">Writing {state.filename} to backend…</span>
        </div>
      </div>
    )
  }

  if (state.phase === 'persisted') {
    const response = state.response
    return (
      <section
        data-testid="rdf-import-persisted"
        className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-accent"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
          <p className="font-serif text-[12px] text-foreground">
            Persisted · <span className="text-foreground/85">{state.filename}</span>
          </p>
        </div>
        <p className="mt-1 font-mono text-[9px] tracking-[0.16em] text-accent/80">
          <span className="uppercase">live db: </span>
          <span data-testid="rdf-import-db-path" className="normal-case">
            {response.db_path}
          </span>
        </p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-accent/80">
          <span data-testid="rdf-import-count-total" className="normal-case">
            {response.total_nodes.toLocaleString()} nodes · {response.total_edges.toLocaleString()} edges
          </span>
          {' '}· wrote {response.imported_nodes.toLocaleString()} n / {response.imported_edges.toLocaleString()} e
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-2 rounded border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:border-border hover:text-foreground"
        >
          Dismiss
        </button>
      </section>
    )
  }

  if (state.phase === 'preview-only') {
    return (
      <section
        data-testid="rdf-import-preview-only"
        className="rounded-lg border border-primary/50 bg-primary/20 px-3 py-2 text-[11px] text-primary"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-primary" />
          <p className="font-serif text-[12px] text-foreground">
            Preview only · <span className="text-foreground/85">{state.filename}</span>
          </p>
        </div>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
          not persisted — start{' '}
          <code className="rounded bg-muted/60 px-1 py-[1px] text-primary">ogdb serve --http</code>{' '}
          to ingest for real
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-2 rounded border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:border-border hover:text-foreground"
        >
          Dismiss
        </button>
      </section>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-destructive/60 bg-destructive/95 px-4 py-3 text-sm text-destructive-foreground shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-2">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex flex-col">
            <span className="font-serif text-[13px]">RDF import failed</span>
            <span className="font-mono text-[10px] text-destructive">{state.message}</span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-destructive hover:bg-destructive/25"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const previewTriples = state.parsed.triples.slice(0, 6)

  return (
    <div
      data-testid="rdf-import-preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md"
    >
      <div className="max-h-[80vh] w-[min(560px,92vw)] overflow-hidden rounded-2xl border border-accent bg-card shadow-[0_0_60px_rgba(34,211,238,0.25)]">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <p className="font-serif text-[15px] tracking-tight text-foreground">
              Preview · <span className="text-foreground/85">{state.filename}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-0 border-b border-border/60">
          <PreviewStat label="Triples" value={state.parsed.triples.length} />
          <PreviewStat label="Subjects" value={state.parsed.uniqueSubjects} />
          <PreviewStat label="Predicates" value={state.parsed.uniquePredicates} />
        </div>

        <div className="max-h-[280px] overflow-y-auto px-5 py-3 text-[11px]">
          <p className="mb-2 font-mono uppercase tracking-[0.16em] text-muted-foreground/70 text-[9px]">First {previewTriples.length} triples</p>
          <ul className="space-y-1 font-mono text-foreground/85">
            {previewTriples.map((triple: Triple, i: number) => (
              <li key={i} className="flex gap-2 rounded bg-muted/40 px-2 py-1">
                <span className="shrink-0 text-accent">{shortUri(triple.subject)}</span>
                <span className="shrink-0 text-accent">{shortUri(triple.predicate)}</span>
                <span className="truncate text-primary">{shortUri(triple.object)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <Database className="h-3 w-3 text-accent" />
            <span>Commit posts to /api/rdf/import · falls back to preview if backend is down</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/85 hover:border-border hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void handleCommit()
              }}
              data-testid="rdf-import-commit"
              className="rounded border border-accent bg-accent/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent-foreground shadow-[0_0_10px_rgba(34,211,238,0.3)] hover:bg-accent/40"
            >
              Commit to graph
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="font-serif text-xl tracking-tight text-foreground">{value.toLocaleString()}</p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">{label}</p>
    </div>
  )
}

function shortUri(value: string): string {
  if (value.startsWith('"')) return value
  if (value.startsWith('_:')) return value
  if (value.length <= 36) return value
  const hashIdx = value.lastIndexOf('#')
  const slashIdx = value.lastIndexOf('/')
  const cutIdx = Math.max(hashIdx, slashIdx)
  if (cutIdx > 0 && cutIdx < value.length - 1) {
    return `…${value.slice(cutIdx)}`
  }
  return `${value.slice(0, 34)}…`
}
