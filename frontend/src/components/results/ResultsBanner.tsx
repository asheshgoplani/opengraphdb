import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { QueryResponse } from '@/types/api'
import { FileJson, FileSpreadsheet } from 'lucide-react'
import { exportAsCsv, exportAsJson } from '@/components/query/export-utils'

interface ResultsBannerProps {
  nodeCount: number
  edgeCount: number
  isLimited: boolean
  resultLimit: number
  queryResponse?: QueryResponse
}

interface ResultsSummaryInput {
  nodeCount: number
  edgeCount: number
  isLimited: boolean
  resultLimit: number
}

export function getResultsSummaryText({
  nodeCount,
  edgeCount,
  isLimited,
  resultLimit,
}: ResultsSummaryInput): string {
  if (isLimited) {
    return `Showing first ${resultLimit} records`
  }

  return `${nodeCount} nodes · ${edgeCount} edges`
}

export function ResultsBanner({
  nodeCount,
  edgeCount,
  isLimited,
  resultLimit,
  queryResponse,
}: ResultsBannerProps) {
  const summaryText = getResultsSummaryText({ nodeCount, edgeCount, isLimited, resultLimit })

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="rounded-full text-xs font-medium">
          {nodeCount} nodes
        </Badge>
        <Badge variant="secondary" className="rounded-full text-xs font-medium">
          {edgeCount} edges
        </Badge>
        {isLimited ? (
          <Badge className="rounded-full border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
            {summaryText}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 hover:bg-accent"
          title="Export JSON"
          disabled={!queryResponse}
          onClick={() => queryResponse && exportAsJson(queryResponse)}
        >
          <FileJson className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">JSON</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 hover:bg-accent"
          title="Export CSV"
          disabled={!queryResponse}
          onClick={() => queryResponse && exportAsCsv(queryResponse)}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </Button>
      </div>
    </div>
  )
}
