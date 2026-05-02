import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatClaimsDate } from '@/lib/formatClaimsDate'

export interface ClaimsStatusEntry {
  id: string
  claim: string
  status: 'green' | 'red'
  last_run: string
  evidence?: string
}

export interface ClaimsStatus {
  sha: string
  date: string
  entries: ClaimsStatusEntry[]
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ClaimsStatus }
  | { kind: 'error' }

let cachedState: LoadState = { kind: 'loading' }
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function ensureClaimsStatusLoaded(): void {
  if (cachedState.kind !== 'loading' || inflight) return
  inflight = fetch('/claims-status.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`status ${res.status}`)
      return res.json() as Promise<ClaimsStatus>
    })
    .then((data) => {
      cachedState = { kind: 'ready', data }
      listeners.forEach((fn) => fn())
    })
    .catch((err) => {
      console.warn('[ClaimsBadge] failed to load /claims-status.json', err)
      cachedState = { kind: 'error' }
      listeners.forEach((fn) => fn())
    })
}

function subscribeClaimsStatus(callback: () => void): () => void {
  listeners.add(callback)
  ensureClaimsStatusLoaded()
  return () => {
    listeners.delete(callback)
  }
}

const getClaimsStatusSnapshot = (): LoadState => cachedState

function useClaimsStatus(): LoadState {
  return useSyncExternalStore(subscribeClaimsStatus, getClaimsStatusSnapshot, getClaimsStatusSnapshot)
}

export function ClaimsBadge({ className }: { className?: string }) {
  const state = useClaimsStatus()

  if (state.kind === 'loading') {
    return (
      <Link
        to="/claims"
        data-testid="claims-badge"
        data-state="loading"
        aria-label="Claim verification status: loading"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground',
          className,
        )}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted/60" />
        checking claims…
      </Link>
    )
  }

  if (state.kind === 'error') {
    return (
      <Link
        to="/claims"
        data-testid="claims-badge"
        data-state="unknown"
        aria-label="Claim verification status unavailable"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/20 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-primary',
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        claims status unavailable
      </Link>
    )
  }

  const { data } = state
  const reds = data.entries.filter((e) => e.status === 'red')
  const total = data.entries.length
  const allGreen = reds.length === 0 && total > 0

  return (
    <Link
      to="/claims"
      data-testid="claims-badge"
      data-state={allGreen ? 'green' : 'red'}
      aria-label={
        allGreen
          ? `All ${total} claims verified`
          : `${reds.length} of ${total} claims failing`
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] transition-colors',
        allGreen
          ? 'border-accent/30 bg-accent/15 text-accent hover:bg-accent/15'
          : 'border-destructive/50 bg-destructive/20 text-destructive-foreground hover:bg-destructive/30',
        className,
      )}
    >
      {allGreen ? (
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      )}
      {allGreen ? (
        <span className="flex items-baseline gap-1.5">
          <span className="font-medium">
            {total} claim{total === 1 ? '' : 's'} verified
          </span>
          <span className="hidden text-muted-foreground normal-case tracking-normal sm:inline">
            · build {data.sha} · {formatClaimsDate(data.date)}
          </span>
        </span>
      ) : (
        <span className="font-medium">
          {reds.length} claim{reds.length === 1 ? '' : 's'} failing — see /claims
        </span>
      )}
    </Link>
  )
}

export function ClaimsRedBanner() {
  const state = useClaimsStatus()

  if (state.kind !== 'ready') return null
  const reds = state.data.entries.filter((e) => e.status === 'red')
  if (reds.length === 0) return null

  return (
    <div
      data-testid="claims-banner-red"
      role="alert"
      className="sticky top-0 z-50 border-b border-destructive/50 bg-destructive text-destructive-foreground"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-sm sm:px-6">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <strong className="font-medium">
            {reds.length} claim{reds.length === 1 ? '' : 's'} failing
          </strong>
          <span className="text-destructive-foreground">on build {state.data.sha}</span>
        </span>
        <Link
          to="/claims"
          className="rounded bg-muted/60 px-2 py-0.5 text-xs font-medium uppercase tracking-wider hover:bg-muted/60"
        >
          View details
        </Link>
      </div>
    </div>
  )
}
