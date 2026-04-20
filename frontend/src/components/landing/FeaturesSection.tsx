import { Bot, Database, Terminal, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSectionInView } from './useSectionInView'

const FEATURES = [
  {
    title: 'Rust-native core',
    description:
      'Storage, MVCC, and traversals run in Rust — no JVM, no GC pauses, predictable latency from the first query.',
    icon: Zap,
  },
  {
    title: 'Cypher, with care',
    description:
      'A familiar surface tuned for ergonomics. Codebase-friendly grammar; openCypher TCK targeted from day one.',
    icon: Terminal,
  },
  {
    title: 'Built for agents',
    description:
      'First-class MCP, machine-readable plans, and stable result shapes — graph as a primitive, not an afterthought.',
    icon: Bot,
  },
  {
    title: 'Embed or serve',
    description:
      'A single binary you can ship inside the app, or run as a Bolt/HTTP server. Backups are file copies.',
    icon: Database,
  },
]

const REVEAL_DELAY = ['', 'animate-delay-100', 'animate-delay-200', 'animate-delay-300']

export function FeaturesSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>()

  return (
    <section
      id="features"
      ref={ref}
      className="scroll-mt-24 border-t border-border/60 bg-background py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div
          className={cn(
            'mb-16 max-w-2xl',
            isInView ? 'animate-reveal-up animate-fill-both' : 'opacity-0'
          )}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            02 — What it is
          </p>
          <h2 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            A graph database that{' '}
            <span className="italic text-muted-foreground">earns</span> its place
            in the stack.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-14 sm:grid-cols-2 lg:gap-x-20">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.title}
                data-testid="feature-card"
                className={cn(
                  'group relative pl-16',
                  isInView
                    ? `animate-reveal-up animate-fill-both ${REVEAL_DELAY[index] ?? ''}`
                    : 'opacity-0'
                )}
              >
                <span
                  aria-hidden="true"
                  className="font-display absolute -top-2 left-0 text-5xl font-light leading-none text-muted-foreground/35"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card text-foreground/80">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl font-medium tracking-tight text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
