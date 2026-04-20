import { Workflow } from 'lucide-react'

export const DEFAULT_EMPTY_QUERY = 'MATCH (n) RETURN n LIMIT 25'

export function ResultsEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-sm">
        <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70">
          <Workflow className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-medium tracking-tight text-white">
          Run a query to see results
        </h2>
        <p className="mt-1.5 text-sm text-white/55">
          Try the example below — the canvas updates as soon as it returns.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-lg bg-[hsl(240,30%,5%)] px-4 py-3 text-left font-mono text-[13px] leading-relaxed text-white/80 ring-1 ring-white/10">
          <code>
            <span className="text-white/35 select-none">{'> '}</span>
            {DEFAULT_EMPTY_QUERY}
          </code>
        </pre>
      </div>
    </div>
  )
}
