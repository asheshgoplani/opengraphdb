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

  return (
    <div
      className={cn(
        'relative h-[300px] overflow-hidden rounded-xl border border-border/40 bg-background/80 transition-all duration-500 lg:h-[440px]',
        isAnimating && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
      )}
    >
      {graphData ? (
        <GraphCanvas graphData={graphData} isGeographic={isGeographic} />
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
            <p className="text-sm text-muted-foreground">
              Ask a question to see the graph come alive
            </p>
            <p className="text-xs text-muted-foreground/50">
              Nodes will light up as the query traverses the graph
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
