import { Bot, Database, Terminal, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSectionInView } from './useSectionInView'

const FEATURES = [
  {
    title: 'Blazing Fast',
    subtitle: 'Performance-first core',
    description: 'Rust-native execution engine optimized for high-throughput graph workloads.',
    icon: Zap,
  },
  {
    title: 'Cypher-First',
    subtitle: 'Query with confidence',
    description: 'Use expressive Cypher queries with practical tooling built around developer flow.',
    icon: Terminal,
  },
  {
    title: 'AI-Ready',
    subtitle: 'MCP toolchain support',
    description: 'MCP-friendly interfaces make OpenGraphDB straightforward for agent integrations.',
    icon: Bot,
  },
  {
    title: 'Embeddable',
    subtitle: 'Deploy your way',
    description: 'Run as a server or embed directly with a compact operational footprint.',
    icon: Database,
  },
]

const CARD_DELAY_CLASSES = ['animate-delay-100', 'animate-delay-200', 'animate-delay-300', 'animate-delay-400']

export function FeaturesSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>()

  return (
    <section id="features" ref={ref} className="scroll-mt-24 bg-muted/40 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className={cn(
            'mx-auto mb-10 max-w-2xl space-y-3 text-center transition-all duration-700',
            isInView ? 'animate-fade-in animate-fill-both' : 'opacity-0'
          )}
        >
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Built for Performance</h2>
          <p className="text-pretty text-base text-muted-foreground sm:text-lg">
            Every component optimized for graph-native workloads.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card
                key={feature.title}
                data-testid="feature-card"
                className={cn(
                  'h-full border-border/80 bg-card/95 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5',
                  isInView
                    ? `animate-slide-up animate-fill-both ${CARD_DELAY_CLASSES[index] ?? 'animate-delay-400'}`
                    : 'translate-y-5 opacity-0'
                )}
              >
                <CardHeader className="space-y-3 p-6">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <CardDescription>{feature.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 text-sm text-muted-foreground">
                  {feature.description}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
