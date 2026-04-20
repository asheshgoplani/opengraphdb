import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { useSectionInView } from './useSectionInView'

const QUERY = `MATCH (p:Person)-[:KNOWS]->(f)-[:WORKS_AT]->(c:Company)
WHERE p.name = "Ada"
RETURN p, f, c`

const TOKEN_COLORS: Array<[RegExp, string]> = [
  [/^MATCH$|^WHERE$|^RETURN$|^AND$|^OR$/i, 'text-fuchsia-400'],
  [/^[A-Z_]+$/, 'text-sky-300'],
  [/^"[^"]*"$/, 'text-emerald-300'],
  [/^\d+$/, 'text-amber-300'],
]

function colorFor(token: string): string {
  for (const [re, cls] of TOKEN_COLORS) {
    if (re.test(token)) return cls
  }
  return 'text-slate-200'
}

function tokenize(line: string): string[] {
  return line.split(/(\s+|[(){}[\],.:;\->])/).filter(Boolean)
}

const PALETTE = ['#7AA2FF', '#A78BFA', '#34D399', '#F472B6']

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

function colorForLabel(label?: string): string {
  if (label === 'Company') return PALETTE[2]
  if (label === 'Person') return PALETTE[0]
  return PALETTE[3]
}

function useTypingLoop(text: string, enabled: boolean) {
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<'typing' | 'holding' | 'resetting'>('typing')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let i = 0
    setTyped('')
    setPhase('typing')

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
      className="dark scroll-mt-24 bg-[hsl(240,28%,7%)] py-20 sm:py-28"
      aria-labelledby="sample-query-heading"
    >
      <div className="pointer-events-none absolute -z-0 mx-auto h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className={`mx-auto mb-12 max-w-2xl text-center ${
            isInView ? 'animate-reveal-up animate-fill-both' : 'opacity-0'
          }`}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-white/45">
            01 — Live demo
          </p>
          <h2
            id="sample-query-heading"
            className="font-display text-balance text-4xl font-light leading-[1.05] text-white sm:text-5xl"
          >
            Type the query.
            <br />
            <span className="italic text-white/75">Watch the graph answer.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-white/55">
            Cypher with familiar ergonomics, executed against a Rust-native engine.
            What you see is the same shape the playground returns.
          </p>
        </div>

        <div
          className={`mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-indigo-500/10 backdrop-blur lg:grid-cols-2 ${
            isInView ? 'animate-reveal-up animate-delay-200 animate-fill-both' : 'opacity-0'
          }`}
        >
          <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-white/55">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
              </div>
              <span className="font-mono uppercase tracking-[0.18em]">cypher</span>
            </div>
            <pre
              className="min-h-[260px] overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed text-slate-200 sm:text-sm"
              aria-label="Animated Cypher query"
            >
              <code>
                {lines.map((line, lineIdx) => (
                  <span key={lineIdx} className="block">
                    <span className="mr-3 inline-block w-4 select-none text-right text-white/25">
                      {lineIdx + 1}
                    </span>
                    {tokenize(line).map((tok, tokIdx) => (
                      <span key={tokIdx} className={colorFor(tok)}>
                        {tok}
                      </span>
                    ))}
                    {lineIdx === lines.length - 1 && (
                      <span className="ml-0.5 inline-block h-4 w-[2px] -translate-y-[1px] animate-pulse bg-white/80 align-middle" />
                    )}
                  </span>
                ))}
              </code>
            </pre>
          </div>

          <div
            ref={containerRef}
            className={`relative min-h-[260px] bg-[hsl(240,30%,5%)] transition-opacity duration-700 ${
              showResult ? 'opacity-100' : 'opacity-30'
            }`}
            aria-label="Result graph preview"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,hsla(226,85%,60%,0.12),transparent_70%)]" />
            <ForceGraph2D<GraphNode, GraphEdge>
              graphData={RESULT}
              width={dim.width}
              height={dim.height}
              backgroundColor="rgba(0,0,0,0)"
              nodeRelSize={1}
              linkWidth={0.9}
              linkColor={() => 'rgba(148, 163, 255, 0.35)'}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={0.92}
              linkDirectionalArrowColor={() => 'rgba(148, 163, 255, 0.55)'}
              linkLabel={(link) => (link as GraphEdge).type}
              nodeLabel={(node) => (node as GraphNode).label ?? String((node as GraphNode).id)}
              nodeCanvasObject={(node, ctx) => {
                const x = node.x ?? 0
                const y = node.y ?? 0
                const color = colorForLabel((node as GraphNode).labels?.[0])
                ctx.save()
                ctx.shadowColor = color
                ctx.shadowBlur = 14
                ctx.beginPath()
                ctx.arc(x, y, 6, 0, 2 * Math.PI)
                ctx.fillStyle = color
                ctx.fill()
                ctx.shadowBlur = 0
                ctx.font = '500 11px Inter, system-ui, sans-serif'
                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillText((node as GraphNode).label ?? '', x, y + 9)
                ctx.restore()
              }}
              nodeCanvasObjectMode={() => 'replace'}
              cooldownTime={reducedMotion ? 1500 : 8000}
              d3AlphaDecay={reducedMotion ? 0.05 : 0.02}
              d3VelocityDecay={0.25}
              enableNodeDrag={false}
              enableZoomInteraction={false}
              enablePanInteraction={false}
            />
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 backdrop-blur">
              {RESULT.nodes.length} nodes · {RESULT.links.length} edges · 0.4ms
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
