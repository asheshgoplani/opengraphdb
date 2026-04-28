import { useCallback, useState } from 'react'
import { Check, Copy, RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'

const SERVE_COMMAND = 'ogdb serve --http'

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded bg-white/[0.04] ring-1 ring-white/[0.04] ${className ?? ''}`}
    />
  )
}

function SkeletonPreview() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid grid-cols-[260px_1fr_260px] gap-6 p-8 opacity-60 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_50%,transparent_30%,black_85%)]"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
        <SkeletonBlock className="h-3 w-20" />
        <div className="space-y-2 pt-2">
          <SkeletonBlock className="h-2 w-full" />
          <SkeletonBlock className="h-2 w-3/4" />
          <SkeletonBlock className="h-2 w-2/3" />
          <SkeletonBlock className="h-2 w-5/6" />
          <SkeletonBlock className="h-2 w-1/2" />
          <SkeletonBlock className="h-2 w-3/4" />
        </div>
        <div className="mt-auto space-y-2">
          <SkeletonBlock className="h-2 w-1/3" />
          <SkeletonBlock className="h-6 w-full" />
        </div>
      </div>

      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.015] p-4">
        <SkeletonBlock className="h-3 w-32" />
        <div className="relative flex-1">
          <svg viewBox="0 0 360 240" className="h-full w-full">
            {[
              [80, 80, 200, 60],
              [200, 60, 280, 130],
              [280, 130, 180, 180],
              [180, 180, 80, 80],
              [200, 60, 180, 180],
            ].map(([x1, y1, x2, y2], i) => (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(148,163,255,0.18)"
                strokeWidth="0.8"
              />
            ))}
            {[
              [80, 80],
              [200, 60],
              [280, 130],
              [180, 180],
              [110, 160],
            ].map(([cx, cy], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="6"
                fill="rgba(148,163,255,0.32)"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="0.5"
              />
            ))}
          </svg>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
        <SkeletonBlock className="h-3 w-24" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonBlock className="h-2 w-3/4" />
              <SkeletonBlock className="h-1.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DisconnectedState() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(SERVE_COMMAND)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <SkeletonPreview />

      <div className="relative z-10 mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[hsl(240,28%,8%)]/85 p-8 shadow-2xl shadow-black/40 backdrop-blur-md">
        <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70">
          <Server className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>

        <h2 className="font-display text-2xl font-medium tracking-tight text-white sm:text-3xl">
          No server reachable yet.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          The Explorer is looking for a local OpenGraphDB instance at{' '}
          <code className="rounded bg-white/10 px-1.5 py-px font-mono text-[12px] text-white/85">
            {serverUrl}
          </code>
          . Start one in your terminal and the panel will connect itself.
        </p>

        <div className="relative mt-6 overflow-hidden rounded-lg bg-[hsl(240,30%,5%)] px-4 py-3 ring-1 ring-white/10">
          <Button
            variant="ghost"
            size="sm"
            aria-label={copied ? 'Copied' : 'Copy command'}
            className="absolute right-1.5 top-1.5 h-7 gap-1 rounded-md px-2 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => {
              void onCopy()
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <pre className="overflow-x-auto pr-16 font-mono text-[13px] leading-relaxed text-white/85">
            <code>
              <span className="text-white/35 select-none">$ </span>
              {SERVE_COMMAND}
            </code>
          </pre>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            polling every 5s
          </span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/asheshgoplani/opengraphdb#getting-started"
            target="_blank"
            rel="noreferrer noopener"
            className="text-white/65 underline-offset-4 hover:text-white hover:underline"
          >
            Setup docs
          </a>
        </div>
      </div>
    </div>
  )
}
