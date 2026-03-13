import { useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DemoChatInputProps {
  onSubmit: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export function DemoChatInput({ onSubmit, disabled, placeholder }: DemoChatInputProps) {
  const [value, setValue] = useState('')

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder ?? 'Ask a question about this dataset...'}
          className="flex-1 rounded-xl border border-border/80 bg-background/80 px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button
          type="button"
          size="icon"
          disabled={disabled || !value.trim()}
          onClick={handleSubmit}
          className="h-11 w-11 shrink-0 rounded-xl shadow-sm"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/50">
        Ask any question about this dataset, or try a suggestion above
      </p>
    </div>
  )
}
