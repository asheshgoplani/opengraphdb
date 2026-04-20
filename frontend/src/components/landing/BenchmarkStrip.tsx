import { cn } from '@/lib/utils'
import { useSectionInView } from './useSectionInView'

const METRICS = [
  {
    label: 'create_node',
    value: '37µs',
    foot: 'p50, single writer',
  },
  {
    label: '1k node ingest',
    value: '40ms',
    foot: 'cold, MVCC',
  },
  {
    label: '2-hop traversal',
    value: '< 1ms',
    foot: 'in-memory CSR',
  },
  {
    label: 'BEIR · LDBC',
    value: 'soon',
    foot: 'standard suites',
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
              Verified · in-tree benchmarks
            </p>
            <h2
              id="benchmark-heading"
              className="font-display text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl"
            >
              Numbers we publish, not numbers we promise.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every figure here lives in
              <code className="ml-1 rounded bg-muted px-1.5 py-px font-mono text-[12px]">
                benches/
              </code>
              {' '}and re-runs on every release tag.
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
