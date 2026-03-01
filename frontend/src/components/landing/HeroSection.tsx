import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="py-20 sm:py-32">
      <div className="mx-auto max-w-4xl space-y-8 px-4 text-center sm:px-6">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          The Graph Database Built for Speed
        </h1>
        <p className="mx-auto max-w-3xl text-pretty text-base text-muted-foreground sm:text-lg">
          OpenGraphDB is Rust-native, Cypher-first, and AI/MCP-ready out of the
          box, so teams can query fast, ship fast, and connect graph workflows
          directly to modern agent tooling.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/playground">Try the Playground</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/app">Open App</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
