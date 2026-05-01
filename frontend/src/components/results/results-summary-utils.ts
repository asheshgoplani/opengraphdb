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
