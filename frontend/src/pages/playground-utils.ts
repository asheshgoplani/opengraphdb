import type { GuidedQuery } from '@/data/datasets'

export const QUERY_CATEGORIES = ['Explore', 'Traverse', 'Analyze'] as const
export type QueryCategory = (typeof QUERY_CATEGORIES)[number]

// Semantic-token-driven indicator colour per category. Routed through
// `bg-[hsl(var(--token))]` rather than raw palette so the token-leak gate
// (frontend/scripts/check-token-leaks.sh) stays at baseline.
export const CATEGORY_INDICATOR: Record<QueryCategory, string> = {
  Explore: 'bg-[hsl(var(--primary))]',
  Traverse: 'bg-[hsl(var(--accent))]',
  Analyze: 'bg-[hsl(var(--violet))]',
}

export function groupQueriesByCategory(
  queries: GuidedQuery[],
): Record<QueryCategory, GuidedQuery[]> {
  const grouped: Record<QueryCategory, GuidedQuery[]> = {
    Explore: [],
    Traverse: [],
    Analyze: [],
  }

  for (const query of queries) {
    grouped[query.category ?? 'Explore'].push(query)
  }

  return grouped
}
