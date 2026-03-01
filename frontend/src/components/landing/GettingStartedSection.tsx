const STEPS = [
  {
    title: 'Install OpenGraphDB',
    command: 'cargo install opengraphdb',
  },
  {
    title: 'Start the Server',
    command: 'opengraphdb serve --port 8080',
  },
  {
    title: 'Query Your Graph',
    command: 'MATCH (n) RETURN n LIMIT 25',
  },
]

export function GettingStartedSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold sm:text-3xl">Getting Started</h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Go from install to first Cypher query in minutes.
          </p>
        </div>
        <div className="space-y-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-lg border bg-card p-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                {index + 1}. {step.title}
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-sm">
                <code>{step.command}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
