import { Check } from 'lucide-react'
import { Streamdown } from 'streamdown'
import type { DemoMessage } from '@/stores/demo'

interface DemoResponseCardProps {
  message: DemoMessage
}

export function DemoResponseCard({ message }: DemoResponseCardProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  // Extract the NL portion (text before the first Cypher code block)
  const cypherFenceIndex = message.content.indexOf('```cypher')
  const nlText =
    cypherFenceIndex !== -1
      ? message.content.slice(0, cypherFenceIndex).trim()
      : message.content

  return (
    <div className="flex flex-col gap-2">
      {/* NL answer */}
      {nlText && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
          <Streamdown>{nlText}</Streamdown>
        </div>
      )}

      {/* Cypher block */}
      {message.cypher ? (
        <div className="mt-1 rounded-lg bg-slate-950 p-3 overflow-x-auto">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Generated Cypher</p>
          <pre>
            <code className="font-mono text-sm text-emerald-400">{message.cypher}</code>
          </pre>
        </div>
      ) : message.isStreaming && cypherFenceIndex !== -1 ? (
        <div className="mt-1 flex items-center gap-2 rounded-lg bg-muted/20 p-4">
          <div className="h-16 w-full animate-pulse rounded bg-muted/40" />
          <span className="shrink-0 text-xs text-muted-foreground">Generating query...</span>
        </div>
      ) : null}

      {/* Status indicator */}
      {message.isStreaming ? (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">Generating...</span>
        </div>
      ) : message.cypher ? (
        <div className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground">Query generated</span>
        </div>
      ) : null}
    </div>
  )
}
