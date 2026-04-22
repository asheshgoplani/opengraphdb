import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`
}

export function ClaimsBadge({ className }: { className?: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/claims-status.json', { signal: controller.signal, cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<ClaimsStatus>
      })
      .then((data) => setState({ kind: 'ready', data }))
      .catch((err) => {
        if (controller.signal.aborted) return
        console.warn('[ClaimsBadge] failed to load /claims-status.json', err)
        setState({ kind: 'error' })
      })
    return () => controller.abort()
  }, [])

  if (state.kind === 'loading') {
    return (
      <Link
        to="/claims"
        data-testid="claims-badge"
        data-state="loading"
        aria-label="Claim verification status: loading"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/55',
          className,
        )}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
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
          'inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-amber-200',
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
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
          : 'border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25',
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
          <span className="hidden text-white/50 normal-case tracking-normal sm:inline">
            · build {data.sha} · {formatDate(data.date)}
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
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/claims-status.json', { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<ClaimsStatus>) : Promise.reject()))
      .then((data) => setState({ kind: 'ready', data }))
      .catch(() => setState({ kind: 'error' }))
    return () => controller.abort()
  }, [])

  if (state.kind !== 'ready') return null
  const reds = state.data.entries.filter((e) => e.status === 'red')
  if (reds.length === 0) return null

  return (
    <div
      data-testid="claims-banner-red"
      role="alert"
      className="sticky top-0 z-50 border-b border-rose-400/40 bg-rose-600 text-rose-50"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-sm sm:px-6">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <strong className="font-medium">
            {reds.length} claim{reds.length === 1 ? '' : 's'} failing
          </strong>
          <span className="text-rose-100/90">on build {state.data.sha}</span>
        </span>
        <Link
          to="/claims"
          className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wider hover:bg-white/20"
        >
          View details
        </Link>
      </div>
    </div>
  )
}
