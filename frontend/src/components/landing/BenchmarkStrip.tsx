import { cn } from '@/lib/utils'
import { useSectionInView } from './useSectionInView'

const METRICS = [
  {
    label: 'storage model',
    value: 'CSR+delta',
    foot: 'architecture-locked',
  },
  {
    label: 'compaction p95',
    value: '< 55ms',
    foot: '30% writes, synthetic',
  },
  {
    label: 'eval drivers',
    value: '4 shipped',
    foot: 'LDBC IS-1 · graphalytics · scaling · criterion',
  },
  {
    label: 'scaling tier',
    value: '100K nodes',
    foot: 'insert_throughput + p50/p95/p99 tracked',
  },
]

export function BenchmarkStrip() {
  const { ref, isInView } = useSectionInView<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-labelledby="benchmark-heading"
      className="border-t border-border/60 bg-background py-16"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div
          className={cn(
            'flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between',
            isInView ? 'animate-reveal-up animate-fill-both' : 'opacity-0'
          )}
        >
          <div className="max-w-sm">
            <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Pre-implementation · storage-model gates
            </p>
            <h2
              id="benchmark-heading"
              className="font-display text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl"
            >
              Numbers we publish, not numbers we promise.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Today&apos;s published benchmarks live in
              <code className="ml-1 rounded bg-muted px-1.5 py-px font-mono text-[12px]">
                crates/ogdb-bench
              </code>
              {' '}and exercise the storage model under synthetic load. Engine-level
              numbers — create, ingest, traversal — land alongside the WAL-backed
              run and will be stamped to the build sha.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                className="bg-card px-5 py-4"
              >
                <dt className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {metric.label}
                </dt>
                <dd className="mt-1.5 font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                  {metric.value}
                </dd>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  {metric.foot}
                </p>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
