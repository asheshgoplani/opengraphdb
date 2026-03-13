import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemoChat } from '@/hooks/useDemoChat'
import { useDemoStore } from '@/stores/demo'
import { DATASETS } from '@/data/datasets'
import { useSectionInView } from '@/components/landing/useSectionInView'
import { DemoDatasetSelector } from './DemoDatasetSelector'
import { DemoSuggestedQuestions } from './DemoSuggestedQuestions'
import { DemoChatInput } from './DemoChatInput'
import { DemoResponseCard } from './DemoResponseCard'
import { DemoGraphCanvas } from './DemoGraphCanvas'

export function DemoSection() {
  const { ref, isInView } = useSectionInView<HTMLElement>({ threshold: 0.05 })
  const { sendQuestion, activeDataset, setActiveDataset } = useDemoChat()
  const messages = useDemoStore((s) => s.messages)
  const graphData = useDemoStore((s) => s.graphData)
  const isLoading = useDemoStore((s) => s.isLoading)
  const isTraceAnimating = useDemoStore((s) => s.isTraceAnimating)

  const messageEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeDatasetName = DATASETS[activeDataset].meta.name

  return (
    <section
      id="demo"
      ref={ref}
      className="scroll-mt-24 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div
          className={cn(
            'mx-auto mb-8 max-w-3xl space-y-4 text-center transition-all duration-700',
            isInView ? 'animate-fade-in animate-fill-both' : 'opacity-0'
          )}
        >
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Talk to Your Knowledge Graph
          </h2>
          <p className="text-pretty text-base text-muted-foreground sm:text-lg">
            Ask questions in plain English. Watch AI generate Cypher queries and traverse your graph in real time.
          </p>
        </div>

        {/* Dataset selector */}
        <div
          className={cn(
            'mb-6 transition-all duration-700',
            isInView ? 'animate-fade-in animate-fill-both animate-delay-100' : 'opacity-0'
          )}
        >
          <DemoDatasetSelector activeDataset={activeDataset} onSelect={setActiveDataset} />
        </div>

        {/* Main demo area */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Chat interface */}
          <div
            className={cn(
              'flex flex-col gap-4 transition-all duration-700',
              isInView ? 'animate-fade-in animate-fill-both animate-delay-100' : 'opacity-0'
            )}
          >
            <DemoSuggestedQuestions
              dataset={activeDataset}
              onSelect={(q) => void sendQuestion(q.text)}
              disabled={isLoading}
            />

            {/* Conversation messages */}
            <div className="min-h-[120px] max-h-[340px] overflow-y-auto rounded-xl border border-border/40 bg-card/30 p-4">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[80px] items-center justify-center">
                  <p className="text-center text-sm text-muted-foreground/60">
                    Click a question above or type your own below
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <DemoResponseCard key={msg.id} message={msg} />
                  ))}
                  <div ref={messageEndRef} />
                </div>
              )}
            </div>

            <DemoChatInput
              onSubmit={(text) => void sendQuestion(text)}
              disabled={isLoading}
              placeholder={`Ask about ${activeDatasetName}...`}
            />

            {/* Settings upgrade path */}
            <Link
              to="/app"
              className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              <Settings className="h-3 w-3" />
              Want better results? Use your own API key
            </Link>
          </div>

          {/* Right: Graph canvas */}
          <div
            className={cn(
              'transition-all duration-700',
              isInView ? 'animate-fade-in animate-fill-both animate-delay-200' : 'opacity-0'
            )}
          >
            <DemoGraphCanvas
              graphData={graphData}
              dataset={activeDataset}
              isAnimating={isTraceAnimating}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
