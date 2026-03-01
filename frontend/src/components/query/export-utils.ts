import type { QueryResponse } from '../../types/api.js'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export function buildJsonString(data: QueryResponse): string {
  return JSON.stringify(data, null, 2)
}

export function buildCsvString(data: QueryResponse): string {
  const rows: string[][] = []

  if (data.columns && data.rows) {
    rows.push(data.columns)
    rows.push(
      ...data.rows.map((row) => row.map((cell) => String(cell ?? '')))
    )
  } else {
    const allPropertyKeys = Array.from(
      new Set(data.nodes.flatMap((node) => Object.keys(node.properties)))
    )

    rows.push(['id', 'labels', ...allPropertyKeys])
    rows.push(
      ...data.nodes.map((node) => [
        String(node.id),
        node.labels.join(';'),
        ...allPropertyKeys.map((key) => String(node.properties[key] ?? '')),
      ])
    )
  }

  const csvBody = rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n')

  return `\ufeff${csvBody}`
}

export function exportAsJson(data: QueryResponse, filename = 'query-results.json') {
  const blob = new Blob([buildJsonString(data)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function exportAsCsv(data: QueryResponse, filename = 'query-results.csv') {
  const blob = new Blob([buildCsvString(data)], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}
