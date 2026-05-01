import type { GuidedQuery } from '@/data/datasets'

export const QUERY_CATEGORIES = ['Explore', 'Traverse', 'Analyze'] as const
export type QueryCategory = (typeof QUERY_CATEGORIES)[number]

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
