import { useCallback, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSectionInView } from './useSectionInView'

const STEPS = [
  {
    title: 'Install OpenGraphDB',
    command: 'cargo install opengraphdb',
  },
  {
    title: 'Start the Server',
    command: 'opengraphdb serve --port 8080',
  },
  {
    title: 'Query Your Graph',
    command: 'MATCH (n) RETURN n LIMIT 25',
  },
]

const STEP_DELAY_CLASSES = ['animate-delay-100', 'animate-delay-200', 'animate-delay-300']

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
    <section id="get-started" ref={ref} className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div
          className={cn(
            'mb-8 space-y-3 text-center transition-all duration-700',
            isInView ? 'animate-fade-in animate-fill-both' : 'opacity-0'
          )}
        >
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Getting Started</h2>
          <p className="text-base text-muted-foreground sm:text-lg">Go from install to first Cypher query in minutes.</p>
        </div>

        <div className="space-y-4">
          {STEPS.map((step, index) => {
            const isCopied = copiedIndex === index

            return (
              <article
                key={step.title}
                className={cn(
                  'rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm transition-all duration-700',
                  'border-l-4 border-l-primary/70',
                  isInView
                    ? `animate-slide-up animate-fill-both ${STEP_DELAY_CLASSES[index] ?? 'animate-delay-300'}`
                    : 'translate-y-5 opacity-0'
                )}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="text-base font-semibold">{step.title}</p>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-slate-950 px-4 py-3 text-slate-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 h-8 gap-1.5 rounded-md px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white"
                    onClick={() => {
                      void copyCommand(step.command, index)
                    }}
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </Button>
                  <pre className="overflow-x-auto pr-14 text-sm leading-relaxed">
                    <code>{step.command}</code>
                  </pre>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
