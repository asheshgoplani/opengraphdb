import { useState } from 'react'
import { AlertCircle, Check, CircleDashed, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invokeMcpTool, type MCPInvokeResult } from '@/api/mcpClient'
import type { MCPToolSpec } from './mcpTools'

interface MCPToolCardProps {
  spec: MCPToolSpec
}

export function MCPToolCard({ spec }: MCPToolCardProps) {
  const isReal = spec.status === 'real'
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MCPInvokeResult | null>(null)

  const handleTry = async () => {
    if (loading) return
    setLoading(true)
    const res = await invokeMcpTool(spec.name, spec.sampleArgs, spec.preview)
    setResult(res)
    setLoading(false)
  }

  return (
    <article
      data-testid={isReal ? 'mcp-tool-card' : 'mcp-tool-card-soon'}
      className="group relative rounded-lg border border-white/10 bg-background/50 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-lg hover:shadow-primary/10"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-serif text-[15px] leading-snug tracking-tight text-foreground">
            {spec.title}
          </p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {spec.category}
            {!isReal && (
              <span className="ml-2 rounded-sm bg-white/5 px-1 py-[1px] text-[9px] tracking-wider text-white/60">
                coming soon
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant={isReal ? 'default' : 'outline'}
          onClick={handleTry}
          disabled={loading}
          className={
            isReal
              ? 'h-7 shrink-0 border border-cyan-500/40 bg-cyan-500/20 px-2.5 text-[11px] font-medium text-cyan-100 shadow-[0_0_6px_rgba(34,211,238,0.25)] hover:bg-cyan-500/30'
              : 'h-7 shrink-0 px-2.5 text-[11px]'
          }
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Zap className="h-3 w-3" />
              {isReal ? 'Try' : 'Preview'}
            </>
          )}
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-white/60">{spec.description}</p>

      {result && (
        <div
          data-testid="mcp-tool-result"
          className="mt-3 rounded-md border border-white/10 bg-black/30 p-2 font-mono text-[10.5px] leading-tight text-white/75"
        >
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SourceBadge source={result.source} elapsedMs={result.elapsedMs} />
            {result.source !== 'live' && (
              <span
                data-testid="mcp-source-reason"
                className="truncate text-[11px] font-normal normal-case tracking-normal text-white/55"
                title={result.reason}
              >
                {result.reason}
              </span>
            )}
          </header>
          {result.source !== 'error' && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </article>
  )
}

interface SourceBadgeProps {
  source: MCPInvokeResult['source']
  elapsedMs: number
}

function SourceBadge({ source, elapsedMs }: SourceBadgeProps) {
  if (source === 'live') {
    return (
      <span
        data-testid="mcp-source-badge"
        data-source="live"
        className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-[3px] text-[12px] font-medium leading-none tracking-tight text-emerald-100"
      >
        <Check className="h-3 w-3" aria-hidden />
        <span>Live · {elapsedMs}ms</span>
      </span>
    )
  }
  if (source === 'preview') {
    return (
      <span
        data-testid="mcp-source-badge"
        data-source="preview"
        className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/25 px-2 py-[3px] text-[12px] font-medium leading-none tracking-tight text-amber-50"
      >
        <CircleDashed className="h-3 w-3" aria-hidden />
        <span>Preview · canned response</span>
      </span>
    )
  }
  return (
    <span
      data-testid="mcp-source-badge"
      data-source="error"
      className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/25 px-2 py-[3px] text-[12px] font-medium leading-none tracking-tight text-rose-50"
    >
      <AlertCircle className="h-3 w-3" aria-hidden />
      <span>Error · backend unreachable</span>
    </span>
  )
}
