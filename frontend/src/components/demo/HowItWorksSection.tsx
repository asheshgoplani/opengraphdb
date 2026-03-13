import { MessageSquare, Search, Code, GitBranch, BarChart3 } from 'lucide-react'
import { useSectionInView } from '@/components/landing/useSectionInView'
import { cn } from '@/lib/utils'
import { PipelineStep } from './PipelineStep'

const PIPELINE_STEPS = [
  {
    icon: MessageSquare,
    title: 'Your Question',
    description: 'Ask in plain English. No query language knowledge needed.',
  },
  {
    icon: Search,
    title: 'Schema Discovery',
    description: 'MCP tools discover graph structure: node labels, relationships, properties.',
  },
  {
    icon: Code,
    title: 'Cypher Generation',
    description: 'AI Skills translate your question into an optimized Cypher query.',
  },
  {
    icon: GitBranch,
    title: 'Graph Traversal',
    description: 'RAG engine navigates the graph hierarchy and retrieves relevant subgraphs.',
  },
  {
    icon: BarChart3,
    title: 'Visual Answer',
    description:
      'Results appear as an interactive graph visualization with a natural language summary.',
  },
] as const

const ANIMATION_DELAYS = [
  '',
  'animate-delay-100',
  'animate-delay-200',
  'animate-delay-300',
  'animate-delay-[400ms]',
] as const

export function HowItWorksSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>({ threshold: 0.1 })

  return (
    <section id="how-it-works" ref={ref} className="scroll-mt-24 bg-muted/30 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div
          className={cn(
            'mx-auto mb-12 max-w-3xl space-y-4 text-center transition-all duration-700',
            isInView ? 'animate-fade-in animate-fill-both' : 'opacity-0'
          )}
        >
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            How It Works
          </h2>
          <p className="text-pretty text-base text-muted-foreground sm:text-lg">
            From natural language to visual insight in five steps. Powered by MCP, AI Skills, and
            Graph-Native RAG.
          </p>
        </div>

        {/* Pipeline flow: horizontal on desktop, vertical on mobile */}
        <div className="flex flex-col items-center gap-2 lg:flex-row lg:items-start lg:justify-between">
          {PIPELINE_STEPS.map((step, index) => (
            <PipelineStep
              key={step.title}
              icon={step.icon}
              title={step.title}
              description={step.description}
              stepNumber={index + 1}
              isLast={index === PIPELINE_STEPS.length - 1}
              animationDelay={ANIMATION_DELAYS[index] ?? ''}
              isInView={isInView}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
