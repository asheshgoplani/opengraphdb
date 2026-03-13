import { DEMO_QUESTIONS } from '@/data/demo-questions'
import type { DatasetKey } from '@/data/datasets'
import type { DemoQuestion } from '@/data/demo-questions'

interface DemoSuggestedQuestionsProps {
  dataset: DatasetKey
  onSelect: (question: DemoQuestion) => void
  disabled?: boolean
}

export function DemoSuggestedQuestions({ dataset, onSelect, disabled }: DemoSuggestedQuestionsProps) {
  const questions = DEMO_QUESTIONS[dataset] ?? []

  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((question, index) => (
        <button
          key={question.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(question)}
          className="animate-fade-in animate-fill-both rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {question.text}
        </button>
      ))}
    </div>
  )
}
