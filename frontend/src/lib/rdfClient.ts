export type RdfFormat = 'ttl' | 'nt' | 'xml' | 'jsonld' | 'nq'

export interface ImportResponse {
  ok: true
  db_path: string
  format: RdfFormat | string
  processed_records: number
  imported_nodes: number
  imported_edges: number
  skipped_records?: number
  committed_batches?: number
  created_nodes?: number
  total_nodes: number
  total_edges: number
  warnings?: string[]
}

export type UploadOutcome =
  | { kind: 'ok'; response: ImportResponse }
  | { kind: 'backend-down' }
  | { kind: 'error'; status: number; message: string }

const FORMAT_BY_EXTENSION: Record<string, RdfFormat> = {
  ttl: 'ttl',
  nt: 'nt',
  nq: 'nq',
  jsonld: 'jsonld',
  json: 'jsonld',
  rdf: 'xml',
  xml: 'xml',
  n3: 'nt',
}

export function rdfFormatFromFilename(name: string): RdfFormat {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return 'ttl'
  const ext = lower.slice(dot + 1)
  return FORMAT_BY_EXTENSION[ext] ?? 'ttl'
}

export function contentTypeFor(format: RdfFormat): string {
  switch (format) {
    case 'ttl':
      return 'text/turtle'
    case 'nt':
      return 'application/n-triples'
    case 'xml':
      return 'application/rdf+xml'
    case 'jsonld':
      return 'application/ld+json'
    case 'nq':
      return 'application/n-quads'
  }
}

export async function uploadRdf(file: File, format: RdfFormat): Promise<UploadOutcome> {
  const body = await file.text()
  let res: Response
  try {
    res = await fetch(`/api/rdf/import?format=${encodeURIComponent(format)}`, {
      method: 'POST',
      headers: { 'Content-Type': contentTypeFor(format) },
      body,
    })
  } catch {
    return { kind: 'backend-down' }
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return { kind: 'backend-down' }
  }
  if (res.status === 500) {
    const text = await res.text().catch(() => '')
    if (/ECONNREFUSED|proxy|connect/i.test(text)) {
      return { kind: 'backend-down' }
    }
    return { kind: 'error', status: 500, message: extractMessage(text, res.statusText) }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { kind: 'error', status: res.status, message: extractMessage(text, res.statusText) }
  }
  const response = (await res.json()) as ImportResponse
  return { kind: 'ok', response }
}

function extractMessage(body: string, fallback: string): string {
  if (!body) return fallback
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string }
    return parsed.error ?? parsed.message ?? fallback
  } catch {
    return body.length > 240 ? body.slice(0, 240) + '…' : body
  }
}
