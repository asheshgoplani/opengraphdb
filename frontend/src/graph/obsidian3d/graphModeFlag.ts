// c14 graph-mode flag parser. Replaces the proto/3d-graph-era boolean
// `isProto3D` parser — semantics flip with the migration:
//
//   default        → '3d'           (the productionised Obsidian3DGraph)
//   ?graph=2d      → '2d'           (legacy ObsidianGraph fallback)
//   ?graph=3d      → '3d'           (explicit, same as default; kept for
//                                    backward compat with proto-era links)
//   #graph=<2d|3d> → as above; hash form is kept because AppShellRouter
//                    `/` → `/playground` <Navigate> calls history.replaceState
//                    which strips the search string before GraphCanvas
//                    can read it. NavigatePreservingQuery (this branch)
//                    fixes the search-form drop, but the hash form stays
//                    supported as a belt-and-braces share-link path.
//
// The flag is captured ONCE at module-load time (PROTO_FLAG_AT_BOOT
// pattern, lifted from proto3dFlag.ts) so that later setSearchParams
// calls in PlaygroundPage cannot flip the renderer mid-session.

export type GraphMode = '2d' | '3d'

const KNOWN: ReadonlyArray<GraphMode> = ['2d', '3d']

function asMode(raw: string | null | undefined): GraphMode | null {
  if (!raw) return null
  return KNOWN.includes(raw as GraphMode) ? (raw as GraphMode) : null
}

export function parseGraphMode(
  search: string | URLSearchParams,
  hash: string = '',
): GraphMode {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search
  const fromSearch = asMode(params.get('graph'))
  if (fromSearch) return fromSearch
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const fromHash = asMode(hashParams.get('graph'))
  if (fromHash) return fromHash
  return '3d'
}

const GRAPH_MODE_AT_BOOT: GraphMode =
  typeof window === 'undefined'
    ? '3d'
    : parseGraphMode(window.location.search, window.location.hash)

export function getGraphMode(): GraphMode {
  return GRAPH_MODE_AT_BOOT
}
