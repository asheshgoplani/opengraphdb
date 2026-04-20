export type MCPInvokeArgs = Record<string, unknown>

export interface MCPInvokeResult {
  tool: string
  ok: boolean
  source: 'live' | 'preview'
  elapsedMs: number
  result: unknown
  error?: string
}

// POSTs to a local dev proxy that spawns `opengraphdb mcp --request <json>`.
// If the proxy / backend is unreachable, fall back to a preview response so the
// gallery still demonstrates the JSON-RPC shape offline.
export async function invokeMcpTool(
  tool: string,
  args: MCPInvokeArgs,
  preview: unknown,
  baseUrl = '/api',
): Promise<MCPInvokeResult> {
  const start = performance.now()
  try {
    const res = await fetch(`${baseUrl}/mcp/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    return {
      tool,
      ok: true,
      source: 'live',
      elapsedMs: Math.round(performance.now() - start),
      result: body,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      tool,
      ok: true,
      source: 'preview',
      elapsedMs: Math.round(performance.now() - start),
      result: preview,
      error: message,
    }
  }
}
