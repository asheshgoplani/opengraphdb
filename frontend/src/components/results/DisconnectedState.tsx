import { useCallback, useState } from 'react'
import { Check, Copy, RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'

const SERVE_COMMAND = 'ogdb serve --http'

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
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
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
            href="https://github.com/innotrade/opengraphdb#getting-started"
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
