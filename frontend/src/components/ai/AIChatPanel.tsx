import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { Send, Trash2, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAIChatStore } from '@/stores/ai-chat'
import { AIChatMessage } from './AIChatMessage'
import { AIDownloadProgress } from './AIDownloadProgress'
import { AITypingIndicator } from './AITypingIndicator'
import { MCPActivityPanel } from './MCPActivityPanel'

const EXAMPLE_PROMPTS = [
  'Show all node labels',
  'Find the most connected nodes',
  'What relationships exist?',
  'Count nodes by label',
]

interface AIChatPanelProps {
  onRunQuery: (cypher: string, messageId: string) => void
  onSendMessage: (text: string) => void
}

export function AIChatPanel({ onRunQuery, onSendMessage }: AIChatPanelProps) {
  const messages = useAIChatStore((s) => s.messages)
  const isOpen = useAIChatStore((s) => s.isOpen)
  const isLoading = useAIChatStore((s) => s.isLoading)
  const downloadProgress = useAIChatStore((s) => s.downloadProgress)
  const setIsOpen = useAIChatStore((s) => s.setIsOpen)
  const clearMessages = useAIChatStore((s) => s.clearMessages)

  const [inputValue, setInputValue] = useState('')
  const [showActivity, setShowActivity] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const lastMessage = messages[messages.length - 1]
  const lastMessageContent = lastMessage?.content ?? ''

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, lastMessageContent])

  function handleSubmit() {
    const text = inputValue.trim()
    if (!text || isLoading) return
    setInputValue('')
    onSendMessage(text)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }

  function handlePromptClick(prompt: string) {
    onSendMessage(prompt)
  }

  function handleCopyQuery(cypher: string) {
    void navigator.clipboard.writeText(cypher)
  }

  const isEmpty = messages.length === 0

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="flex h-full w-[420px] flex-col gap-0 border-l bg-card/90 p-0 backdrop-blur-md sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <SheetTitle className="text-base">AI Assistant</SheetTitle>
              <SheetDescription className="text-xs">
                Ask questions about your graph data in natural language.
              </SheetDescription>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                title="Clear conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </SheetHeader>

        {downloadProgress !== null && (
          <div className="shrink-0 pt-3">
            <AIDownloadProgress
              message={downloadProgress.message}
              percent={downloadProgress.percent}
            />
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        >
          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <p className="max-w-[260px] text-sm text-muted-foreground">
                  Ask me anything about your graph data. I'll generate Cypher queries to find the answers.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handlePromptClick(prompt)}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <AIChatMessage
                  key={msg.id}
                  message={msg}
                  onRunQuery={onRunQuery}
                  onCopyQuery={handleCopyQuery}
                />
              ))}
              {isLoading && <AITypingIndicator />}
            </>
          )}
        </div>

        <div className="shrink-0 border-t bg-card/60 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Ask about your graph data..."
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              style={{ height: 'auto', minHeight: '40px' }}
            />
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !inputValue.trim()}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            Enter to send, Shift+Enter for newline
          </p>
        </div>

        <div className="shrink-0 border-t">
          <button
            onClick={() => setShowActivity((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <span className="font-medium">Activity</span>
            {showActivity ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          {showActivity && (
            <div className="px-4 pb-3">
              <MCPActivityPanel />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
