import { Bot, Database, Terminal, Zap } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

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

export function FeaturesSection() {
  return (
    <section className="bg-muted/50 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title} className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Icon className="h-5 w-5 text-primary" />
                    {feature.title}
                  </CardTitle>
                  <CardDescription>{feature.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
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
