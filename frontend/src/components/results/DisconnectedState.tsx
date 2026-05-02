import { Check, Copy, RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { useCopyToClipboard } from '@/lib/useCopyToClipboard'

const SERVE_COMMAND = 'ogdb serve --http'

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded bg-muted/40 ring-1 ring-border/60 ${className ?? ''}`}
    />
  )
}

function SkeletonPreview() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid grid-cols-[260px_1fr_260px] gap-6 p-8 opacity-60 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_50%,transparent_30%,black_85%)]"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
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

      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-4">
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

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
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
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <SkeletonPreview />

      <div className="relative z-10 mx-auto w-full max-w-xl rounded-2xl border border-border/60 bg-card/85 p-8 shadow-2xl shadow-black/40 backdrop-blur-md">
        <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-foreground/85">
          <Server className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>

        <h2 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          No server reachable yet.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The Explorer is looking for a local OpenGraphDB instance at{' '}
          <code className="rounded bg-muted/60 px-1.5 py-px font-mono text-[12px] text-foreground/85">
            {serverUrl}
          </code>
          . Start one in your terminal and the panel will connect itself.
        </p>

        <div className="relative mt-6 overflow-hidden rounded-lg bg-background px-4 py-3 ring-1 ring-border">
          <Button
            variant="ghost"
            size="sm"
            aria-label={copied ? 'Copied' : 'Copy command'}
            className="absolute right-1.5 top-1.5 h-7 gap-1 rounded-md px-2 text-[11px] text-foreground/85 hover:bg-muted/60 hover:text-foreground"
            onClick={() => {
              void copy(SERVE_COMMAND)
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <pre className="overflow-x-auto pr-16 font-mono text-[13px] leading-relaxed text-foreground/85">
            <code>
              <span className="text-muted-foreground/70 select-none">$ </span>
              {SERVE_COMMAND}
            </code>
          </pre>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground/70">
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            polling every 5s
          </span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/asheshgoplani/opengraphdb#getting-started"
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Setup docs
          </a>
        </div>
      </div>
    </div>
  )
}
