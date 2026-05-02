import { useCallback, useState } from 'react'
import { ArrowRight, Check, Copy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSectionInView } from './useSectionInView'

const STEPS = [
  {
    title: 'Install',
    summary: 'Build the ogdb binary from the workspace.',
    command: 'cargo install --path crates/ogdb-cli',
  },
  {
    title: 'Serve',
    summary: 'HTTP for apps; run `ogdb mcp` alongside for AI tools.',
    command: 'ogdb serve --http --db data.ogdb',
  },
  {
    title: 'Expose to AI',
    summary: 'A JSON-RPC tool surface over stdio — point any MCP client at it.',
    command: 'ogdb mcp --stdio --db data.ogdb',
  },
]

const REVEAL_DELAY = ['animate-delay-100', 'animate-delay-200', 'animate-delay-300']

export function GettingStartedSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>()
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const copyCommand = useCallback(async (command: string, index: number) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return
    }
    await navigator.clipboard.writeText(command)
    setCopiedIndex(index)
    window.setTimeout(() => {
      setCopiedIndex((current) => (current === index ? null : current))
    }, 2000)
  }, [])

  return (
    <section
      id="get-started"
      ref={ref}
      className="scroll-mt-24 border-t border-border/60 bg-muted/40 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div
          id="how-it-works"
          className={cn(
            'mb-16 max-w-2xl scroll-mt-24',
            isInView ? 'animate-reveal-up animate-fill-both' : 'opacity-0'
          )}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            03 — How it works
          </p>
          <h2 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            Three commands to a living graph.
          </h2>
        </div>

        <ol className="space-y-5">
          {STEPS.map((step, index) => {
            const isCopied = copiedIndex === index
            return (
              <li
                key={step.title}
                className={cn(
                  'group relative grid grid-cols-[3.5rem_1fr] gap-x-5 rounded-2xl border border-border/60 bg-card/95 p-6 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md sm:grid-cols-[4rem_1fr_minmax(0,2.5fr)] sm:items-center sm:gap-x-8',
                  isInView
                    ? `animate-reveal-up animate-fill-both ${REVEAL_DELAY[index] ?? ''}`
                    : 'opacity-0'
                )}
              >
                <span
                  aria-hidden="true"
                  className="font-display text-4xl font-light leading-none text-muted-foreground/40 sm:text-5xl"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="col-span-2 space-y-1 sm:col-span-1">
                  <h3 className="font-display text-2xl font-medium tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.summary}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="relative overflow-hidden rounded-lg bg-background px-4 py-3 text-foreground shadow-inner">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={isCopied ? 'Copied' : `Copy ${step.title.toLowerCase()} command`}
                      className="absolute right-1.5 top-1.5 h-7 gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        void copyCommand(step.command, index)
                      }}
                    >
                      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </Button>
                    <pre className="overflow-x-auto pr-16 font-mono text-[13px] leading-relaxed">
                      <code>{step.command}</code>
                    </pre>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        <div
          className={cn(
            'mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between',
            isInView ? 'animate-reveal-up animate-delay-300 animate-fill-both' : 'opacity-0'
          )}
        >
          <p className="max-w-md text-sm text-muted-foreground">
            Or skip the install — open the in-browser playground and start
            traversing the bundled datasets in seconds.
          </p>
          <Button asChild size="lg" className="group">
            <Link to="/playground">
              Open the playground
              <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
