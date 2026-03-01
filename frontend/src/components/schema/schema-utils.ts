import type { SchemaResponse } from '../../types/api.js'

export type SchemaSectionKey = 'labels' | 'relationshipTypes' | 'propertyKeys'

export function getSchemaSectionItems(
  schema: SchemaResponse | undefined,
  section: SchemaSectionKey
): string[] {
  return schema?.[section] ?? []
}
