import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphData } from '@/types/graph'
import { GRAPH_THEME } from '@/graph/theme'
import { SmallObsidianGraph } from '@/graph/obsidian/SmallObsidianGraph'
import { useSectionInView } from './useSectionInView'

const QUERY = `MATCH (p:Person)-[:KNOWS]->(f)-[:WORKS_AT]->(c:Company)
WHERE p.name = "Ada"
RETURN p, f, c`

const TOKEN_COLORS: Array<[RegExp, string]> = [
  [/^MATCH$|^WHERE$|^RETURN$|^AND$|^OR$/i, 'text-primary'],
  [/^[A-Z_]+$/, 'text-accent'],
  [/^"[^"]*"$/, 'text-accent'],
  [/^\d+$/, 'text-primary'],
]

function colorFor(token: string): string {
  for (const [re, cls] of TOKEN_COLORS) {
    if (re.test(token)) return cls
  }
  return 'text-foreground/85'
}

function tokenize(line: string): string[] {
  return line.split(/(\s+|[(){}[\],.:;\->])/).filter(Boolean)
}


const RESULT: GraphData = {
  nodes: [
    { id: 'ada', label: 'Ada', labels: ['Person'], properties: { name: 'Ada' } },
    { id: 'lin', label: 'Lin', labels: ['Person'], properties: { name: 'Lin' } },
    { id: 'sam', label: 'Sam', labels: ['Person'], properties: { name: 'Sam' } },
    { id: 'rio', label: 'Rio', labels: ['Person'], properties: { name: 'Rio' } },
    { id: 'innotrade', label: 'Innotrade', labels: ['Company'], properties: { name: 'Innotrade' } },
    { id: 'helix', label: 'Helix', labels: ['Company'], properties: { name: 'Helix' } },
  ],
  links: [
    { id: 'k1', source: 'ada', target: 'lin', type: 'KNOWS', properties: {} },
    { id: 'k2', source: 'ada', target: 'sam', type: 'KNOWS', properties: {} },
    { id: 'k3', source: 'ada', target: 'rio', type: 'KNOWS', properties: {} },
    { id: 'w1', source: 'lin', target: 'innotrade', type: 'WORKS_AT', properties: {} },
    { id: 'w2', source: 'sam', target: 'helix', type: 'WORKS_AT', properties: {} },
    { id: 'w3', source: 'rio', target: 'innotrade', type: 'WORKS_AT', properties: {} },
  ],
}

function useTypingLoop(text: string, enabled: boolean) {
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<'typing' | 'holding' | 'resetting'>('typing')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let i = 0
    const reset = window.setTimeout(() => {
      if (cancelled) return
      setTyped('')
      setPhase('typing')
    }, 0)

    const tick = () => {
      if (cancelled) return
      if (i < text.length) {
        i += 1
        setTyped(text.slice(0, i))
        const ch = text[i - 1]
        const delay = ch === '\n' ? 220 : ch === ' ' ? 28 : 22 + Math.random() * 26
        window.setTimeout(tick, delay)
      } else {
        setPhase('holding')
        window.setTimeout(() => {
          if (cancelled) return
          setPhase('resetting')
          window.setTimeout(() => {
            if (cancelled) return
            i = 0
            setTyped('')
            setPhase('typing')
            tick()
          }, 600)
        }, 4200)
      }
    }
    const start = window.setTimeout(tick, 350)
    return () => {
      cancelled = true
      window.clearTimeout(start)
      window.clearTimeout(reset)
    }
  }, [text, enabled])

  return { typed, phase }
}

export function SampleQueryPanel() {
  const { ref, isInView } = useSectionInView<HTMLElement>({ threshold: 0.2 })
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const { typed, phase } = useTypingLoop(QUERY, isInView && !reducedMotion)
  const display = reducedMotion ? QUERY : typed
  const showResult = reducedMotion || phase !== 'typing'

  const containerRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ width: 560, height: 320 })

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(([entry]) => {
      if (!entry) return
      setDim({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const lines = display.split('\n')

  return (
    <section
      ref={ref}
      id="demo"
      className="dark scroll-mt-24 bg-background py-20 sm:py-28"
      aria-labelledby="sample-query-heading"
    >
      <div className="pointer-events-none absolute -z-0 mx-auto h-px w-full bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className={`mx-auto mb-12 max-w-2xl text-center ${
            isInView ? 'animate-reveal-up animate-fill-both' : 'opacity-0'
          }`}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/70">
            01 — Live demo
          </p>
          <h2
            id="sample-query-heading"
            className="font-display text-balance text-4xl font-light leading-[1.05] text-foreground sm:text-5xl"
          >
            Type the query.
            <br />
            <span className="italic text-foreground/85">Watch the graph answer.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground">
            Cypher with familiar ergonomics, executed against a Rust-native engine.
            Open the playground to run this query against the real backend.
          </p>
        </div>

        <div
          className={`mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-border/60 bg-muted/40 shadow-2xl shadow-amber-500/10 backdrop-blur lg:grid-cols-2 ${
            isInView ? 'animate-reveal-up animate-delay-200 animate-fill-both' : 'opacity-0'
          }`}
        >
          <div className="border-b border-border/60 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
              </div>
              <span className="font-mono uppercase tracking-[0.18em]">cypher</span>
            </div>
            <pre
              className="min-h-[260px] overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed text-foreground/85 sm:text-sm"
              aria-label="Animated Cypher query"
            >
              <code>
                {lines.map((line, lineIdx) => (
                  <span key={lineIdx} className="block">
                    <span className="mr-3 inline-block w-4 select-none text-right text-foreground/25">
                      {lineIdx + 1}
                    </span>
                    {tokenize(line).map((tok, tokIdx) => (
                      <span key={tokIdx} className={colorFor(tok)}>
                        {tok}
                      </span>
                    ))}
                    {lineIdx === lines.length - 1 && (
                      <span className="ml-0.5 inline-block h-4 w-[2px] -translate-y-[1px] animate-pulse bg-foreground/80 align-middle" />
                    )}
                  </span>
                ))}
              </code>
            </pre>
          </div>

          <div
            ref={containerRef}
            className={`relative min-h-[260px] transition-opacity duration-700 ${
              showResult ? 'opacity-100' : 'opacity-30'
            }`}
            style={{ backgroundColor: GRAPH_THEME.bg }}
            aria-label="Result graph preview"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle at center, ${GRAPH_THEME.gridDot} 1px, transparent 1px)`,
                backgroundSize: `${GRAPH_THEME.gridSize}px ${GRAPH_THEME.gridSize}px`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: GRAPH_THEME.vignette }}
            />
            <SmallObsidianGraph
              graphData={RESULT}
              width={dim.width}
              height={dim.height}
              showLabels={showResult}
              reducedMotion={reducedMotion}
              amberOnly
            />
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
              illustrative
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
