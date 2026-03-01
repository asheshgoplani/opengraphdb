import { useMemo } from 'react'
import { getDatasetList, runDatasetQuery } from '@/data/datasets'
import { cn } from '@/lib/utils'
import { ShowcaseCard } from './ShowcaseCard'
import { useSectionInView } from './useSectionInView'

const CARD_DELAY_CLASSES = ['animate-delay-100', 'animate-delay-200', 'animate-delay-300']

export function ShowcaseSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>()

  const showcaseItems = useMemo(() => {
    return getDatasetList().map((dataset) => ({
      ...dataset,
      graphData: runDatasetQuery(dataset.key, 'all'),
    }))
  }, [])

  return (
    <section id="use-cases" ref={ref} className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className={cn(
            'mx-auto mb-10 max-w-3xl space-y-4 text-center transition-all duration-700',
            isInView ? 'animate-fade-in animate-fill-both' : 'opacity-0'
          )}
        >
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Real-World Knowledge Graphs
          </h2>
          <p className="text-pretty text-base text-muted-foreground sm:text-lg">
            OpenGraphDB powers graph workloads across industries. From movie recommendations to fraud detection,
            explore how graph databases model complex relationships.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {showcaseItems.map((dataset, index) => (
            <div
              key={dataset.key}
              className={cn(
                'transition-all duration-700',
                isInView
                  ? `animate-slide-up animate-fill-both ${CARD_DELAY_CLASSES[index] ?? 'animate-delay-300'}`
                  : 'translate-y-6 opacity-0'
              )}
            >
              <ShowcaseCard
                datasetKey={dataset.key}
                name={dataset.name}
                description={dataset.description}
                nodeCount={dataset.nodeCount}
                linkCount={dataset.linkCount}
                labels={dataset.labels}
                graphData={dataset.graphData}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
