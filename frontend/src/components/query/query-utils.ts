export function prepareCypherQuery(rawQuery: string, resultLimit: number): string {
  const query = rawQuery.trim()
  if (!query) return ''

  const hasLimit = /\bLIMIT\b/i.test(query)
  return hasLimit ? query : `${query} LIMIT ${resultLimit}`
}
