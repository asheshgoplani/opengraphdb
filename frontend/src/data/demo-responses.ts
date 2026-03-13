import type { DatasetKey } from './datasets'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { DATASETS } from './datasets'

export interface DemoResponse {
  questionId: string
  dataset: DatasetKey
  cypher: string
  nlAnswer: string
  graphData: GraphData
  traceNodeIds: (string | number)[]
}

function toNodeId(value: string | number | GraphNode): string | number {
  return typeof value === 'object' ? value.id : value
}

function cloneNode(node: GraphNode): GraphNode {
  return { ...node, labels: [...node.labels], properties: { ...node.properties } }
}

function cloneLink(link: GraphEdge): GraphEdge {
  return {
    ...link,
    source: toNodeId(link.source),
    target: toNodeId(link.target),
    properties: { ...link.properties },
  }
}

function buildSubgraphFromNodeIds(data: GraphData, nodeIds: Set<string | number>): GraphData {
  const nodes = data.nodes.filter((n) => nodeIds.has(n.id)).map(cloneNode)
  const links = data.links
    .filter((l) => nodeIds.has(toNodeId(l.source)) && nodeIds.has(toNodeId(l.target)))
    .map(cloneLink)
  return { nodes, links }
}

function buildOrderedTraceIds(graphData: GraphData): (string | number)[] {
  const edgeCounts = new Map<string | number, number>()
  for (const link of graphData.links) {
    const src = toNodeId(link.source)
    const tgt = toNodeId(link.target)
    edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1)
    edgeCounts.set(tgt, (edgeCounts.get(tgt) ?? 0) + 1)
  }
  return graphData.nodes
    .map((n) => n.id)
    .sort((a, b) => (edgeCounts.get(b) ?? 0) - (edgeCounts.get(a) ?? 0))
}

function buildDemoResponse(
  questionId: string,
  dataset: DatasetKey,
  cypher: string,
  nlAnswer: string,
  filterFn: (data: GraphData) => GraphData,
): DemoResponse {
  const fullData = DATASETS[dataset].data
  const graphData = filterFn(fullData)
  const traceNodeIds = buildOrderedTraceIds(graphData)
  return { questionId, dataset, cypher, nlAnswer, graphData, traceNodeIds }
}

// ---- MovieLens filters ----

function filterMlTopRated(data: GraphData): GraphData {
  const topMovieIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Movie') && (n.properties.avgRating as number) >= 4.5)
      .slice(0, 25)
      .map((n) => n.id)
  )
  const genreIds = new Set<string | number>()
  const links = data.links.filter((l) => {
    const src = toNodeId(l.source)
    const tgt = toNodeId(l.target)
    if (topMovieIds.has(src) && l.type === 'IN_GENRE') {
      genreIds.add(tgt)
      return true
    }
    return false
  })
  const nodeIds = new Set([...topMovieIds, ...genreIds])
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterMlSciFi(data: GraphData): GraphData {
  const scifiGenreNode = data.nodes.find(
    (n) => n.labels.includes('Genre') && n.properties.name === 'Sci-Fi'
  )
  if (!scifiGenreNode) return { nodes: [], links: [] }
  const links = data.links.filter(
    (l) => l.type === 'IN_GENRE' && toNodeId(l.target) === scifiGenreNode.id
  )
  const nodeIds = new Set<string | number>([scifiGenreNode.id])
  links.forEach((l) => nodeIds.add(toNodeId(l.source)))
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterMlGenreConnections(data: GraphData): GraphData {
  const nodeIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Genre')).map((n) => n.id)
  )
  const moviesByGenre = new Map<string | number, string[]>()
  data.links.forEach((l) => {
    if (l.type === 'IN_GENRE') {
      const gId = toNodeId(l.target)
      if (!moviesByGenre.has(gId)) moviesByGenre.set(gId, [])
      moviesByGenre.get(gId)!.push(String(toNodeId(l.source)))
    }
  })
  // Include a sample of movies (up to 3 per genre) to show connections
  data.links.slice(0, 30).forEach((l) => {
    if (l.type === 'IN_GENRE') {
      nodeIds.add(toNodeId(l.source))
    }
  })
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterMlPopularTags(data: GraphData): GraphData {
  // Use most-rated movies as a proxy (no Tag nodes in this dataset)
  const popularMovies = data.nodes
    .filter((n) => n.labels.includes('Movie') && (n.properties.ratingCount as number) > 1500)
    .slice(0, 20)
  const nodeIds = new Set<string | number>(popularMovies.map((n) => n.id))
  const genreIds = new Set<string | number>()
  data.links.forEach((l) => {
    if (l.type === 'IN_GENRE' && nodeIds.has(toNodeId(l.source))) {
      genreIds.add(toNodeId(l.target))
    }
  })
  genreIds.forEach((id) => nodeIds.add(id))
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterMlComedyDrama(data: GraphData): GraphData {
  const targetGenres = new Set(['Drama', 'Action', 'Adventure', 'Thriller'])
  const genreNodeIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Genre') && targetGenres.has(n.properties.name as string))
      .map((n) => n.id)
  )
  const movieIds = new Set<string | number>()
  data.links.forEach((l) => {
    if (l.type === 'IN_GENRE' && genreNodeIds.has(toNodeId(l.target))) {
      movieIds.add(toNodeId(l.source))
    }
  })
  // Keep only movies with multiple genre matches
  const links = data.links.filter(
    (l) => l.type === 'IN_GENRE' && genreNodeIds.has(toNodeId(l.target)) && movieIds.has(toNodeId(l.source))
  )
  const nodeIds = new Set([...genreNodeIds, ...movieIds])
  // Limit to 30 nodes
  const limitedMovieIds = [...movieIds].slice(0, 22)
  const limitedNodeIds = new Set([...genreNodeIds, ...limitedMovieIds])
  return buildSubgraphFromNodeIds(data, limitedNodeIds)
}

function filterMlCrimeThrillers(data: GraphData): GraphData {
  const targetGenres = new Set(['Crime', 'Thriller'])
  const genreNodeIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Genre') && targetGenres.has(n.properties.name as string))
      .map((n) => n.id)
  )
  const movieIds = new Set<string | number>()
  data.links.forEach((l) => {
    if (l.type === 'IN_GENRE' && genreNodeIds.has(toNodeId(l.target))) {
      movieIds.add(toNodeId(l.source))
    }
  })
  const limitedMovieIds = [...movieIds].slice(0, 20)
  const nodeIds = new Set([...genreNodeIds, ...limitedMovieIds])
  return buildSubgraphFromNodeIds(data, nodeIds)
}

// ---- Air Routes filters ----

function filterArBusiest(data: GraphData): GraphData {
  // Find airports with most route connections
  const routeCounts = new Map<string | number, number>()
  data.links.forEach((l) => {
    if (l.type === 'ROUTE') {
      const src = toNodeId(l.source)
      const tgt = toNodeId(l.target)
      routeCounts.set(src, (routeCounts.get(src) ?? 0) + 1)
      routeCounts.set(tgt, (routeCounts.get(tgt) ?? 0) + 1)
    }
  })
  const topAirportIds = new Set<string | number>(
    [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => id)
  )
  const links = data.links.filter(
    (l) => l.type === 'ROUTE' && topAirportIds.has(toNodeId(l.source)) && topAirportIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => topAirportIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterArTransatlantic(data: GraphData): GraphData {
  const usAirportIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Airport') && (n.properties.country === 'US' || n.properties.country === 'CA'))
      .map((n) => n.id)
  )
  const euAirportIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Airport') && ['GB', 'FR', 'DE', 'NL', 'ES'].includes(n.properties.country as string))
      .map((n) => n.id)
  )
  const links = data.links.filter(
    (l) =>
      l.type === 'ROUTE' &&
      ((usAirportIds.has(toNodeId(l.source)) && euAirportIds.has(toNodeId(l.target))) ||
        (euAirportIds.has(toNodeId(l.source)) && usAirportIds.has(toNodeId(l.target))))
  )
  const nodeIds = new Set<string | number>()
  links.forEach((l) => {
    nodeIds.add(toNodeId(l.source))
    nodeIds.add(toNodeId(l.target))
  })
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterArCountryHubs(data: GraphData): GraphData {
  // Show airports + countries for major hubs
  const majorAirportIds = new Set<string | number>([
    'ar-jfk', 'ar-lhr', 'ar-cdg', 'ar-fra', 'ar-dxb', 'ar-sin', 'ar-hnd', 'ar-atl', 'ar-ord', 'ar-lax',
    'ar-hkg', 'ar-pek', 'ar-syd', 'ar-icn', 'ar-ams'
  ])
  const countryIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Country')).map((n) => n.id)
  )
  const links = data.links.filter(
    (l) => l.type === 'CONTAINS' && countryIds.has(toNodeId(l.source)) && majorAirportIds.has(toNodeId(l.target))
  )
  const nodeIds = new Set<string | number>()
  links.forEach((l) => {
    nodeIds.add(toNodeId(l.source))
    nodeIds.add(toNodeId(l.target))
  })
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterArShortestPath(data: GraphData): GraphData {
  // Show connections via Dubai hub between London and Tokyo area
  const relevantCodes = new Set(['LHR', 'DXB', 'HND', 'NRT', 'SIN', 'HKG', 'CDG', 'FRA'])
  const airportIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Airport') && relevantCodes.has(n.properties.code as string))
      .map((n) => n.id)
  )
  const links = data.links.filter(
    (l) => l.type === 'ROUTE' && airportIds.has(toNodeId(l.source)) && airportIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => airportIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterArAsiaPacific(data: GraphData): GraphData {
  const apCodes = new Set(['HND', 'NRT', 'SIN', 'HKG', 'PEK', 'PKX', 'PVG', 'ICN', 'SYD', 'MEL', 'BKK', 'KUL', 'DEL', 'BOM'])
  const airportIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Airport') && apCodes.has(n.properties.code as string))
      .map((n) => n.id)
  )
  const links = data.links.filter(
    (l) => l.type === 'ROUTE' && airportIds.has(toNodeId(l.source)) && airportIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => airportIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterArMiddleEast(data: GraphData): GraphData {
  const meCodes = new Set(['DXB', 'DOH', 'AUH'])
  const euCodes = new Set(['LHR', 'CDG', 'FRA', 'AMS', 'IST', 'MUC'])
  const meIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Airport') && meCodes.has(n.properties.code as string))
      .map((n) => n.id)
  )
  const euIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Airport') && euCodes.has(n.properties.code as string))
      .map((n) => n.id)
  )
  const allIds = new Set([...meIds, ...euIds])
  const links = data.links.filter(
    (l) => l.type === 'ROUTE' && allIds.has(toNodeId(l.source)) && allIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => allIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

// ---- GoT filters ----

function filterGotMostConnected(data: GraphData): GraphData {
  const connectionCount = new Map<string | number, number>()
  data.links.forEach((l) => {
    if (l.type === 'INTERACTS') {
      const src = toNodeId(l.source)
      const tgt = toNodeId(l.target)
      connectionCount.set(src, (connectionCount.get(src) ?? 0) + 1)
      connectionCount.set(tgt, (connectionCount.get(tgt) ?? 0) + 1)
    }
  })
  const top15 = new Set<string | number>(
    [...connectionCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([id]) => id)
  )
  const links = data.links.filter(
    (l) => l.type === 'INTERACTS' && top15.has(toNodeId(l.source)) && top15.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => top15.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterGotStark(data: GraphData): GraphData {
  const starkIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Character') && (n.properties.house === 'Stark' || (n.properties.name as string).includes('Stark')))
      .map((n) => n.id)
  )
  const connectedIds = new Set<string | number>(starkIds)
  data.links.forEach((l) => {
    if (l.type === 'INTERACTS') {
      if (starkIds.has(toNodeId(l.source))) connectedIds.add(toNodeId(l.target))
      if (starkIds.has(toNodeId(l.target))) connectedIds.add(toNodeId(l.source))
    }
  })
  // Limit to 25 nodes
  const limitedIds = new Set([...starkIds, ...[...connectedIds].filter((id) => !starkIds.has(id)).slice(0, 15)])
  const links = data.links.filter(
    (l) => l.type === 'INTERACTS' && limitedIds.has(toNodeId(l.source)) && limitedIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => limitedIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterGotHouses(data: GraphData): GraphData {
  const majorHouses = new Set(['Stark', 'Lannister', 'Targaryen', 'Baratheon', 'Tyrell'])
  const houseReps: string[] = [
    'got-jon', 'got-san', 'got-ary', 'got-ned', 'got-rob',   // Stark
    'got-tyr', 'got-cer', 'got-jai',                          // Lannister
    'got-dae', 'got-vis', 'got-dro', 'got-ser',               // Targaryen
    'got-rob2', 'got-jof', 'got-sta', 'got-ren',             // Baratheon
    'got-mar', 'got-lor', 'got-ole',                          // Tyrell
    'got-bae', 'got-var', 'got-bri', 'got-mee',              // Others
  ]
  const repIds = new Set<string | number>(houseReps)
  const links = data.links.filter(
    (l) => l.type === 'INTERACTS' && repIds.has(toNodeId(l.source)) && repIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => repIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterGotBridges(data: GraphData): GraphData {
  // Characters who interact across different allegiance groups
  const bridges = new Set<string | number>([
    'got-bae', 'got-var', 'got-tyr', 'got-bri', 'got-mee', 'got-dav',
    'got-jon', 'got-ser', 'got-jai', 'got-bro', 'got-pod', 'got-sam',
    'got-ned', 'got-cat', 'got-ary', 'got-san',
  ])
  const links = data.links.filter(
    (l) => l.type === 'INTERACTS' && bridges.has(toNodeId(l.source)) && bridges.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => bridges.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

function filterGotStrongest(data: GraphData): GraphData {
  const strongLinks = data.links.filter(
    (l) => l.type === 'INTERACTS' && (l.properties.weight as number) >= 20
  )
  const nodeIds = new Set<string | number>()
  strongLinks.forEach((l) => {
    nodeIds.add(toNodeId(l.source))
    nodeIds.add(toNodeId(l.target))
  })
  return {
    nodes: data.nodes.filter((n) => nodeIds.has(n.id)).map(cloneNode),
    links: strongLinks.map(cloneLink),
  }
}

function filterGotLannister(data: GraphData): GraphData {
  const lannisterIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Character') && n.properties.house === 'Lannister')
      .map((n) => n.id)
  )
  const connectedIds = new Set<string | number>(lannisterIds)
  data.links.forEach((l) => {
    if (l.type === 'INTERACTS') {
      if (lannisterIds.has(toNodeId(l.source))) connectedIds.add(toNodeId(l.target))
      if (lannisterIds.has(toNodeId(l.target))) connectedIds.add(toNodeId(l.source))
    }
  })
  const limitedIds = new Set([...lannisterIds, ...[...connectedIds].filter((id) => !lannisterIds.has(id)).slice(0, 12)])
  const links = data.links.filter(
    (l) => l.type === 'INTERACTS' && limitedIds.has(toNodeId(l.source)) && limitedIds.has(toNodeId(l.target))
  )
  return { nodes: data.nodes.filter((n) => limitedIds.has(n.id)).map(cloneNode), links: links.map(cloneLink) }
}

// ---- Wikidata filters ----

function filterWdLaureates(data: GraphData): GraphData {
  const categoryIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Category')).map((n) => n.id)
  )
  const laureateIds = new Set<string | number>()
  data.links.forEach((l) => {
    if (l.type === 'WON_PRIZE_IN' && categoryIds.has(toNodeId(l.target))) {
      laureateIds.add(toNodeId(l.source))
    }
  })
  // Cap at 25 laureates
  const limitedLaureateIds = new Set([...laureateIds].slice(0, 25))
  const links = data.links.filter(
    (l) => l.type === 'WON_PRIZE_IN' && limitedLaureateIds.has(toNodeId(l.source)) && categoryIds.has(toNodeId(l.target))
  )
  const nodeIds = new Set([...categoryIds, ...limitedLaureateIds])
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterWdPhysics(data: GraphData): GraphData {
  const physicsNode = data.nodes.find(
    (n) => n.labels.includes('Category') && n.properties.name === 'Physics'
  )
  if (!physicsNode) return { nodes: [], links: [] }
  const links = data.links.filter(
    (l) => l.type === 'WON_PRIZE_IN' && toNodeId(l.target) === physicsNode.id
  )
  const laureateIds = new Set<string | number>(links.map((l) => toNodeId(l.source)))
  const nodeIds = new Set([physicsNode.id, ...laureateIds])
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterWdCountries(data: GraphData): GraphData {
  const countryIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Country')).map((n) => n.id)
  )
  const laureateIds = new Set<string | number>()
  data.links.forEach((l) => {
    if (l.type === 'BORN_IN' && countryIds.has(toNodeId(l.target))) {
      laureateIds.add(toNodeId(l.source))
    }
  })
  const links = data.links.filter(
    (l) => l.type === 'BORN_IN' && countryIds.has(toNodeId(l.target)) && laureateIds.has(toNodeId(l.source))
  )
  const nodeIds = new Set([...countryIds, ...laureateIds])
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterWdInstitutions(data: GraphData): GraphData {
  const institutionIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Institution')).map((n) => n.id)
  )
  const laureateIds = new Set<string | number>()
  data.links.forEach((l) => {
    if (l.type === 'AFFILIATED_WITH' && institutionIds.has(toNodeId(l.target))) {
      laureateIds.add(toNodeId(l.source))
    }
  })
  const links = data.links.filter(
    (l) => l.type === 'AFFILIATED_WITH' && institutionIds.has(toNodeId(l.target)) && laureateIds.has(toNodeId(l.source))
  )
  const nodeIds = new Set([...institutionIds, ...laureateIds])
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterWdMultiWinner(data: GraphData): GraphData {
  // Linus Pauling won both Physics(Chemistry) and Peace
  const multiWinnerIds = new Set<string | number>(['wd-l-9', 'wd-l-36', 'wd-l-6'])
  const categoryIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Category')).map((n) => n.id)
  )
  const links = data.links.filter(
    (l) => (l.type === 'WON_PRIZE_IN' && multiWinnerIds.has(toNodeId(l.source))) ||
           (l.type === 'BORN_IN' && multiWinnerIds.has(toNodeId(l.source)))
  )
  const nodeIds = new Set<string | number>(multiWinnerIds)
  links.forEach((l) => {
    nodeIds.add(toNodeId(l.source))
    nodeIds.add(toNodeId(l.target))
  })
  return buildSubgraphFromNodeIds(data, nodeIds)
}

function filterWdWomen(data: GraphData): GraphData {
  const femaleIds = new Set<string | number>(
    data.nodes
      .filter((n) => n.labels.includes('Laureate') && n.properties.gender === 'female')
      .map((n) => n.id)
  )
  const categoryIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Category')).map((n) => n.id)
  )
  const countryIds = new Set<string | number>(
    data.nodes.filter((n) => n.labels.includes('Country')).map((n) => n.id)
  )
  const links = data.links.filter(
    (l) =>
      (l.type === 'WON_PRIZE_IN' && femaleIds.has(toNodeId(l.source)) && categoryIds.has(toNodeId(l.target))) ||
      (l.type === 'BORN_IN' && femaleIds.has(toNodeId(l.source)) && countryIds.has(toNodeId(l.target)))
  )
  const nodeIds = new Set<string | number>(femaleIds)
  links.forEach((l) => nodeIds.add(toNodeId(l.target)))
  return buildSubgraphFromNodeIds(data, nodeIds)
}

// ---- Build all responses ----

const ALL_RESPONSES: DemoResponse[] = [
  // MovieLens
  buildDemoResponse(
    'ml-top-rated', 'movielens',
    `MATCH (m:Movie)\nWHERE m.avgRating >= 4.5\nRETURN m\nORDER BY m.avgRating DESC\nLIMIT 25`,
    'Here are the highest rated movies in the dataset. These films all have average ratings of 4.5 or above, with classics like The Shawshank Redemption and The Godfather leading the list with scores above 4.7.',
    filterMlTopRated,
  ),
  buildDemoResponse(
    'ml-sci-fi', 'movielens',
    `MATCH (m:Movie)-[:IN_GENRE]->(g:Genre {name: 'Sci-Fi'})\nRETURN m, g\nORDER BY m.avgRating DESC`,
    "The Sci-Fi genre contains some of the most beloved films in the dataset. From The Matrix to Inception and Blade Runner, these movies blend speculative science with gripping storytelling.",
    filterMlSciFi,
  ),
  buildDemoResponse(
    'ml-genre-connections', 'movielens',
    `MATCH (g:Genre)<-[:IN_GENRE]-(m:Movie)\nRETURN g.name AS genre, COUNT(m) AS movieCount\nORDER BY movieCount DESC`,
    'Drama dominates the dataset with the most connections, followed by Action and Crime. The genre network reveals how movies cluster around core categories, with crossover hits connecting multiple genres.',
    filterMlGenreConnections,
  ),
  buildDemoResponse(
    'ml-popular-tags', 'movielens',
    `MATCH (m:Movie)\nWHERE m.ratingCount > 1500\nRETURN m.title, m.ratingCount\nORDER BY m.ratingCount DESC\nLIMIT 20`,
    'The most-rated movies represent the cultural touchstones of cinema. Titles like The Avengers, Jurassic Park, and Forrest Gump appear at the top with over 2,000 user ratings each in the dataset.',
    filterMlPopularTags,
  ),
  buildDemoResponse(
    'ml-comedy-drama', 'movielens',
    `MATCH (m:Movie)-[:IN_GENRE]->(g:Genre)\nWHERE g.name IN ['Drama', 'Action', 'Adventure']\nRETURN m, g\nLIMIT 30`,
    'Movies spanning Drama, Action, and Adventure genres form rich clusters in the network. These multi-genre crossovers tend to be among the highest-rated films, combining character depth with engaging plots.',
    filterMlComedyDrama,
  ),
  buildDemoResponse(
    'ml-crime-thrillers', 'movielens',
    `MATCH (m:Movie)-[:IN_GENRE]->(g:Genre)\nWHERE g.name IN ['Crime', 'Thriller']\nRETURN m, g\nORDER BY m.avgRating DESC`,
    'Crime and Thriller films represent some of cinema\'s most critically acclaimed work. The network shows how films like Pulp Fiction, Goodfellas, and Memento connect through these dark, tension-driven genres.',
    filterMlCrimeThrillers,
  ),
  // Air Routes
  buildDemoResponse(
    'ar-busiest', 'airroutes',
    `MATCH (a:Airport)-[r:ROUTE]->()\nRETURN a.code, a.city, COUNT(r) AS connections\nORDER BY connections DESC\nLIMIT 20`,
    'The busiest airports by route connections include major hubs like ATL, JFK, LHR, and DXB. These airports act as global connectors, routing traffic between continents and serving millions of passengers annually.',
    filterArBusiest,
  ),
  buildDemoResponse(
    'ar-transatlantic', 'airroutes',
    `MATCH (a1:Airport)-[r:ROUTE]->(a2:Airport)\nWHERE a1.country IN ['US', 'CA'] AND a2.country IN ['GB', 'FR', 'DE', 'NL', 'ES']\nRETURN a1, r, a2`,
    'Transatlantic routes connect major North American gateways like JFK, LAX, BOS, and ATL with European hubs including LHR, CDG, FRA, and AMS. These routes span over 5,000 miles across the Atlantic Ocean.',
    filterArTransatlantic,
  ),
  buildDemoResponse(
    'ar-country-hubs', 'airroutes',
    `MATCH (c:Country)-[:CONTAINS]->(a:Airport)\nRETURN c.name, COLLECT(a.code) AS airports\nORDER BY SIZE(airports) DESC`,
    'The network reveals country-level hub patterns with the US, China, and Japan maintaining the largest airport footprints. Country nodes connect to their respective airports, showing geographic clustering of aviation infrastructure.',
    filterArCountryHubs,
  ),
  buildDemoResponse(
    'ar-shortest-path', 'airroutes',
    `MATCH path = shortestPath(\n  (lhr:Airport {code: 'LHR'})-[:ROUTE*..3]->(nrt:Airport {code: 'NRT'})\n)\nRETURN path`,
    'The shortest connection from London Heathrow (LHR) to Tokyo Narita (NRT) routes through Middle Eastern hubs like Dubai (DXB) or Singapore (SIN). The graph network reveals optimal stopover points for this ultra-long-haul journey.',
    filterArShortestPath,
  ),
  buildDemoResponse(
    'ar-asia-pacific', 'airroutes',
    `MATCH (a:Airport)-[r:ROUTE]->(b:Airport)\nWHERE a.region STARTS WITH 'AP' AND b.region STARTS WITH 'AP'\nRETURN a, r, b`,
    'The Asia Pacific aviation network forms a dense web centered on Singapore, Hong Kong, and Tokyo. Regional hubs connect to major cities across China, Japan, Southeast Asia, and Australia, creating a highly interconnected regional network.',
    filterArAsiaPacific,
  ),
  buildDemoResponse(
    'ar-middle-east', 'airroutes',
    `MATCH (me:Airport)-[r:ROUTE]->(eu:Airport)\nWHERE me.country IN ['AE', 'QA'] AND eu.country IN ['GB', 'FR', 'DE', 'NL', 'TR']\nRETURN me, r, eu`,
    'Middle Eastern hubs Dubai (DXB), Doha (DOH), and Abu Dhabi (AUH) maintain extensive connections to European capitals. Dubai especially serves as a critical intercontinental gateway between Europe, Asia, and Africa.',
    filterArMiddleEast,
  ),
  // Game of Thrones
  buildDemoResponse(
    'got-most-connected', 'got',
    `MATCH (c:Character)-[r:INTERACTS]->()\nRETURN c.name, COUNT(r) AS interactions\nORDER BY interactions DESC\nLIMIT 15`,
    'Tyrion Lannister, Jon Snow, and Daenerys Targaryen emerge as the most connected characters in Westeros. Their high centrality scores reflect their roles as key political and narrative bridges across the entire series.',
    filterGotMostConnected,
  ),
  buildDemoResponse(
    'got-stark', 'got',
    `MATCH (s:Character)-[:INTERACTS]->(other:Character)\nWHERE s.house = 'Stark'\nRETURN s, other\nLIMIT 30`,
    'The Stark family network extends far beyond Winterfell. Jon Snow connects to the Night\'s Watch and Targaryen factions, Arya connects to the Hound and assassins, and Sansa links to both Lannister and Baratheon power structures.',
    filterGotStark,
  ),
  buildDemoResponse(
    'got-houses', 'got',
    `MATCH (c1:Character)-[r:INTERACTS]->(c2:Character)\nWHERE c1.house IN ['Stark', 'Lannister', 'Targaryen', 'Baratheon', 'Tyrell']\nRETURN c1, r, c2\nLIMIT 30`,
    'The five great houses of Westeros are deeply intertwined. The Lannister network dominates King\'s Landing interactions, while the Targaryens form their own cluster in Essos before converging on the mainland in later seasons.',
    filterGotHouses,
  ),
  buildDemoResponse(
    'got-bridges', 'got',
    `MATCH (c:Character)-[r:INTERACTS]->(other:Character)\nWHERE c.allegiance <> other.allegiance\nRETURN c, r, other\nORDER BY r.weight DESC\nLIMIT 25`,
    'Characters like Varys, Petyr Baelish, Tyrion, and Brienne serve as critical bridges between opposing factions. Their network position gives them enormous influence as information and political brokers in the game of thrones.',
    filterGotBridges,
  ),
  buildDemoResponse(
    'got-strongest', 'got',
    `MATCH (c1:Character)-[r:INTERACTS]->(c2:Character)\nWHERE r.weight >= 20\nRETURN c1, r, c2\nORDER BY r.weight DESC`,
    'The strongest relationships in the series involve characters who repeatedly interact across multiple seasons. Jon and Sam\'s brotherhood, Daenerys and Jorah\'s loyalty, and the Lannister siblings\' complex bonds show the highest interaction weights.',
    filterGotStrongest,
  ),
  buildDemoResponse(
    'got-lannister', 'got',
    `MATCH (c:Character)-[r:INTERACTS]->(other:Character)\nWHERE c.house = 'Lannister'\nRETURN c, r, other\nLIMIT 25`,
    'The Lannister family network reveals a house built on ambition and intrigue. Cersei, Jaime, and Tyrion each maintain distinct relationship clusters, with Tyrion\'s connections spanning the most diverse political spectrum.',
    filterGotLannister,
  ),
  // Wikidata / Nobel Prize
  buildDemoResponse(
    'wd-laureates', 'wikidata',
    `MATCH (l:Laureate)-[:WON_PRIZE_IN]->(c:Category)\nRETURN l, c\nORDER BY c.name, l.name\nLIMIT 30`,
    'The Nobel Prize network spans six categories: Physics, Chemistry, Medicine, Literature, Peace, and Economics. The visualization shows laureates clustering around their prize categories, revealing the distribution of awards across fields.',
    filterWdLaureates,
  ),
  buildDemoResponse(
    'wd-physics', 'wikidata',
    `MATCH (l:Laureate)-[:WON_PRIZE_IN]->(c:Category {name: 'Physics'})\nRETURN l.name, l.birthYear, l.birthCountry\nORDER BY l.birthYear`,
    'Nobel Physics laureates include some of the greatest scientific minds of the 20th century. Einstein, Bohr, Heisenberg, Planck, and Feynman revolutionized our understanding of quantum mechanics and relativity.',
    filterWdPhysics,
  ),
  buildDemoResponse(
    'wd-countries', 'wikidata',
    `MATCH (l:Laureate)-[:BORN_IN]->(c:Country)\nRETURN c.name, COUNT(l) AS laureates\nORDER BY laureates DESC`,
    'The United States has produced the most Nobel laureates by a significant margin, followed by Germany and the United Kingdom. The birth country network reveals the geographic concentration of Nobel Prize achievement.',
    filterWdCountries,
  ),
  buildDemoResponse(
    'wd-institutions', 'wikidata',
    `MATCH (l:Laureate)-[:AFFILIATED_WITH]->(i:Institution)\nRETURN i.name, COUNT(l) AS laureates\nORDER BY laureates DESC`,
    'Caltech, Harvard, and Cambridge dominate institutional affiliations among Nobel laureates. These elite research institutions have cultivated multiple prize-winning scientists, creating hubs of excellence in the Nobel network.',
    filterWdInstitutions,
  ),
  buildDemoResponse(
    'wd-multi-winner', 'wikidata',
    `MATCH (l:Laureate)-[r:WON_PRIZE_IN]->(c:Category)\nWITH l, COUNT(r) AS prizes\nWHERE prizes > 1\nRETURN l.name, prizes`,
    'Linus Pauling is the only person to win two unshared Nobel Prizes: Chemistry in 1954 and Peace in 1962. Marie Curie won Physics in 1903 and Chemistry in 1911, making her the only laureate to win in two different sciences.',
    filterWdMultiWinner,
  ),
  buildDemoResponse(
    'wd-women', 'wikidata',
    `MATCH (l:Laureate)-[:WON_PRIZE_IN]->(c:Category)\nWHERE l.gender = 'female'\nRETURN l, c\nORDER BY c.name`,
    'Female Nobel laureates have made groundbreaking contributions across all prize categories. From Marie Curie in Physics and Chemistry to Toni Morrison in Literature and Malala Yousafzai in Peace, women have shaped the world\'s greatest achievements.',
    filterWdWomen,
  ),
]

export const DEMO_RESPONSES: Map<string, DemoResponse> = new Map(
  ALL_RESPONSES.map((r) => [r.questionId, r])
)

export function getDemoResponse(questionId: string): DemoResponse | undefined {
  return DEMO_RESPONSES.get(questionId)
}
