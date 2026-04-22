import { useEffect, useMemo, useState } from 'react'
import { ApiClient } from '@/api/client'
import { useSettingsStore } from '@/stores/settings'
import type { SchemaResponse } from '@/types/api'

type StripState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; schema: SchemaResponse; fetchedAt: number }
  | { status: 'error'; message: string }

// Fetches GET /schema from the configured backend (via ApiClient) and renders
// the labels + edge types + property keys counts. This is the real-backend
// evidence the Schema tab needs: the F6 claim spec asserts that after seeding
// TTL data, this strip renders non-zero counts that match the /schema response.
//
// Designed to be cheap: one fetch on mount, refresh on manual click. No polling.
export function BackendSchemaStrip() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const apiClient = useMemo(() => new ApiClient(serverUrl), [serverUrl])
  const [state, setState] = useState<StripState>({ status: 'idle' })

  const load = () => {
    setState({ status: 'loading' })
    apiClient
      .schema()
      .then((schema) => setState({ status: 'ok', schema, fetchedAt: Date.now() }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setState({ status: 'error', message })
      })
  }

  useEffect(() => {
    load()
    // We intentionally depend only on serverUrl — re-fetch on config change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl])

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section
        data-testid="backend-schema-strip"
        data-state="loading"
        className="mb-4 rounded-lg border border-dashed border-white/15 bg-muted/20 px-4 py-3"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
          GET /schema · fetching from backend…
        </p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section
        data-testid="backend-schema-strip"
        data-state="error"
        className="mb-4 rounded-lg border border-red-400/30 bg-red-500/5 px-4 py-3"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-300/85">
          GET /schema · backend unreachable
        </p>
        <p className="mt-1 font-mono text-[11px] text-red-300/70">{state.message}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded border border-red-400/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-red-200/80 hover:bg-red-500/10"
        >
          Retry
        </button>
      </section>
    )
  }

  const { schema } = state
  return (
    <section
      data-testid="backend-schema-strip"
      data-state="ok"
      data-label-count={schema.labels.length}
      data-edge-count={schema.relationshipTypes.length}
      data-property-count={schema.propertyKeys.length}
      className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-500/5 px-4 py-3 shadow-[0_0_12px_rgba(34,211,238,0.12)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/80">
          GET /schema · {serverUrl}
        </p>
        <button
          type="button"
          onClick={load}
          className="rounded border border-cyan-400/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-200/70 hover:bg-cyan-500/10"
        >
          Refresh
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
        <SchemaStat
          testId="backend-schema-labels"
          label="Labels"
          count={schema.labels.length}
          sample={schema.labels.slice(0, 3)}
        />
        <SchemaStat
          testId="backend-schema-edges"
          label="Edge types"
          count={schema.relationshipTypes.length}
          sample={schema.relationshipTypes.slice(0, 3)}
        />
        <SchemaStat
          testId="backend-schema-properties"
          label="Property keys"
          count={schema.propertyKeys.length}
          sample={schema.propertyKeys.slice(0, 3)}
        />
      </dl>
    </section>
  )
}

interface SchemaStatProps {
  testId: string
  label: string
  count: number
  sample: string[]
}

function SchemaStat({ testId, label, count, sample }: SchemaStatProps) {
  return (
    <div data-testid={testId} data-count={count}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">{label}</dt>
      <dd className="mt-1 font-serif text-[20px] leading-none tabular-nums text-cyan-100">
        {count}
      </dd>
      {sample.length > 0 && (
        <p className="mt-1 truncate font-mono text-[10px] text-white/55" title={sample.join(', ')}>
          {sample.join(' · ')}
          {count > sample.length ? ' · …' : ''}
        </p>
      )}
    </div>
  )
}
