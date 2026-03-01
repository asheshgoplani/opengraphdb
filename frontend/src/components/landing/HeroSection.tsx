import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { HeroGraphBackground } from './HeroGraphBackground'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-36">
      <HeroGraphBackground />

      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
        <div className="mx-auto max-w-3xl space-y-8 animate-fade-in animate-fill-both">
          <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-7xl">
            Knowledge Graph Workflows That Feel Instant
          </h1>

          <p className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
            OpenGraphDB delivers a graph-native stack for querying, exploring,
            and shipping real-world graph applications with Rust performance and
            Cypher ergonomics.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild size="lg" className="min-w-48">
              <Link to="/playground">Try the Playground</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-40 bg-background/70">
              <Link to="/app">Open App</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  )
}
