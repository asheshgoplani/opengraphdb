import type { BackendQueryResponse, QueryResponse } from '../../types/api.js'

type ExportableData = QueryResponse | BackendQueryResponse

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

function isBackendResponse(data: ExportableData): data is BackendQueryResponse {
  return 'columns' in data && 'row_count' in data
}

export function buildJsonString(data: ExportableData): string {
  return JSON.stringify(data, null, 2)
}

export function buildCsvString(data: ExportableData): string {
  const rows: string[][] = []

  if (isBackendResponse(data)) {
    rows.push(data.columns)
    rows.push(
      ...data.rows.map((row) => Object.values(row).map((cell) => String(cell ?? '')))
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

export function exportAsJson(data: ExportableData, filename = 'query-results.json') {
  const blob = new Blob([buildJsonString(data)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function exportAsCsv(data: ExportableData, filename = 'query-results.csv') {
  const blob = new Blob([buildCsvString(data)], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}
