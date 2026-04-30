// Pure helper extracted from ApiClient.request so the
// "which field of the error body do we surface" decision can be unit-
// tested without spinning up the rest of the client (which transitively
// imports Vite-aliased modules).
//
// QA bug #4 (2026-04-30): backend returns `{ error: "..." }`, but the
// pre-fix client read `body.message`, so the real reason was dropped and
// users saw "Bad Request" (HTTP statusText) instead. Prefer body.error,
// fall back to body.message for any legacy / non-ogdb endpoint, then
// statusText. See client.test.ts for the regression matrix.
export function extractErrorMessage(
  body: unknown,
  statusText: string,
): string {
  if (body && typeof body === 'object') {
    const candidate = body as { error?: unknown; message?: unknown }
    if (typeof candidate.error === 'string' && candidate.error.length > 0) {
      return candidate.error
    }
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message
    }
  }
  return statusText
}
