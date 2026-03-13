import { useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { DATASETS } from '@/data/datasets'
import type { GraphData } from '@/types/graph'
import type { DatasetKey } from '@/data/datasets'

interface DemoGraphCanvasProps {
  graphData: GraphData | null
  dataset: DatasetKey
  isAnimating: boolean
}

export function DemoGraphCanvas({ graphData, dataset, isAnimating }: DemoGraphCanvasProps) {
  const isGeographic = DATASETS[dataset].meta.isGeographic ?? false
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  // Lazy mount: only mount GraphCanvas when the container is in the viewport
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.05 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.links.length ?? 0

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-[300px] overflow-hidden rounded-xl border border-border/40 bg-background/80 transition-all duration-500 lg:h-[440px]',
        isAnimating
          ? 'ring-2 ring-primary/20 animate-pulse ring-offset-2 ring-offset-background'
          : graphData
            ? 'ring-1 ring-primary/10'
            : ''
      )}
    >
      {/* Radial gradient depth overlay for visual depth */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, hsl(var(--background) / 0.6) 100%)',
        }}
      />

      {isVisible ? (
        graphData ? (
          <div className="h-full w-full transition-opacity duration-500">
            <GraphCanvas graphData={graphData} isGeographic={isGeographic} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
            {/* Radial gradient pulse background */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute inset-0 animate-pulse rounded-xl bg-gradient-radial from-primary/10 via-transparent to-transparent" />
            </div>
            <div className="relative space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-muted/30">
                <svg
                  className="h-6 w-6 text-muted-foreground/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">Ask a question to see the graph come alive</p>
              <p className="text-xs text-muted-foreground/50">
                Nodes will light up as the query traverses the graph
              </p>
            </div>
          </div>
        )
      ) : (
        /* Pre-mount placeholder with same dimensions to prevent layout shift */
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/40 border-t-primary/40" />
        </div>
      )}

      {/* Node count badge (only when graph data is available) */}
      {graphData && nodeCount > 0 && (
        <div className="absolute bottom-2 right-2 z-20 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
          {nodeCount} nodes, {edgeCount} edges
        </div>
      )}
    </div>
  )
}
