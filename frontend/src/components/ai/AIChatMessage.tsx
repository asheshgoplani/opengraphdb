import { useState } from 'react'
import { Play, Copy, Check } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import type { AIChatMessage as AIChatMessageType } from '@/stores/ai-chat'

interface AIChatMessageProps {
  message: AIChatMessageType
  onRunQuery?: (cypher: string, messageId: string) => void
  onCopyQuery?: (cypher: string) => void
}

function CypherBlockActions({
  cypher,
  messageId,
  onRunQuery,
  onCopyQuery,
}: {
  cypher: string
  messageId: string
  onRunQuery?: (cypher: string, messageId: string) => void
  onCopyQuery?: (cypher: string) => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(cypher)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopyQuery?.(cypher)
  }

  return (
    <div className="mt-1.5 flex items-center gap-2">
      {onRunQuery && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRunQuery(cypher, messageId)}
          className="h-7 gap-1.5 text-xs"
        >
          <Play className="h-3 w-3" />
          Run query
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-7 gap-1.5 text-xs"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-green-500" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </Button>
    </div>
  )
}

export function AIChatMessage({ message, onRunQuery, onCopyQuery }: AIChatMessageProps) {
  const showActions = !message.isStreaming && message.cypherBlocks.length > 0

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:rounded-lg [&_pre]:bg-muted/40 [&_pre]:p-3">
        <Streamdown>{message.content}</Streamdown>
      </div>

      {showActions && message.cypherBlocks.map((cypher, index) => (
        <div key={index} className="flex flex-col gap-1">
          <CypherBlockActions
            cypher={cypher}
            messageId={message.id}
            onRunQuery={onRunQuery}
            onCopyQuery={onCopyQuery}
          />
          {message.queryError && index === message.cypherBlocks.length - 1 && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Query failed: {message.queryError}
            </p>
          )}
          {message.queryResult && index === message.cypherBlocks.length - 1 && (
            <p className="rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
              {message.queryResult}
            </p>
          )}
        </div>
      ))}

      {!showActions && message.queryError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Query failed: {message.queryError}
        </p>
      )}
      {!showActions && message.queryResult && (
        <p className="rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
          {message.queryResult}
        </p>
      )}
    </div>
  )
}
