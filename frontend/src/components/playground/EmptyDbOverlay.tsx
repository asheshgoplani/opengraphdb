import { useCallback, useEffect, useState } from 'react'
import { Cpu, Database, Upload } from 'lucide-react'
import { ApiClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'

// First-run / empty-DB overlay for the playground.
//
// Surfaces a guided dialog when the connected backend reports zero labels and
// zero edge types — typical paths in: a fresh `ogdb serve --http empty.ogdb`,
// a `~/.ogdb/demo.ogdb` mid-import, or any disconnected dev session that
// momentarily lands on /playground before data exists.
//
// The component owns its own schema fetch (it does NOT depend on the
// existing per-mode polling in LiveEmptyDbCTA, which only renders in Live
// mode and would leave Static mode users stranded). When the schema becomes
// non-empty the overlay simply renders nothing — never a blocker.
//
// The Playwright e2e flips schema state mid-test by re-calling
// `window.__refreshSchema()`. We expose that function while the overlay is
// mounted so the hide-on-populate path is observable in a single page
// lifetime; the hook is removed on unmount so it never lingers in
// production sessions.

interface Props {
  onImport?: () => void
  onSampleQuery?: () => void
  onConnect?: () => void
}

type SchemaState = 'checking' | 'empty' | 'populated' | 'unreachable'

declare global {
  interface Window {
    __refreshSchema?: () => Promise<void>
  }
}

export function EmptyDbOverlay({ onImport, onSampleQuery, onConnect }: Props) {
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const [schemaState, setSchemaState] = useState<SchemaState>('checking')

  const refresh = useCallback(() => {
    const client = new ApiClient(serverUrl)
    return client
      .schema()
      .then((schema) => {
        const isEmpty =
          schema.labels.length === 0 && schema.relationshipTypes.length === 0
        setSchemaState(isEmpty ? 'empty' : 'populated')
      })
      .catch(() => {
        // An unreachable backend is not the empty-DB story — don't block
        // the canvas with a CTA the user can't act on. The dedicated
        // ConnectionBadge already surfaces the disconnected state.
        setSchemaState('unreachable')
      })
  }, [serverUrl])

  useEffect(() => {
    void refresh()
    window.__refreshSchema = refresh
    return () => {
      if (window.__refreshSchema === refresh) {
        delete window.__refreshSchema
      }
    }
  }, [refresh])

  if (schemaState !== 'empty') {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="empty-db-title"
      data-testid="empty-db-overlay"
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-sm"
    >
      <div className="mx-4 max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2
          id="empty-db-title"
          className="font-display text-xl font-medium tracking-tight text-foreground"
        >
          Your database is ready.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          OpenGraphDB is running locally and waiting for data. Pick a starting
          point:
        </p>
        <div className="mt-5 space-y-2">
          <Button
            variant="default"
            className="w-full justify-start"
            onClick={onImport}
          >
            <Upload aria-hidden="true" className="mr-2 h-4 w-4" /> Import a
            dataset
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={onSampleQuery}
          >
            <Cpu aria-hidden="true" className="mr-2 h-4 w-4" /> Run sample
            queries (movielens)
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={onConnect}
          >
            <Database aria-hidden="true" className="mr-2 h-4 w-4" /> Connect to
            a different database
          </Button>
        </div>
      </div>
    </div>
  )
}
