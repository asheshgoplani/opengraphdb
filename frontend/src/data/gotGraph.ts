import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

const CHARACTER_LABEL = 'Character'
const SEASON_LABEL = 'Season'

function toNodeId(value: string | number | GraphNode): string | number {
  return typeof value === 'object' ? value.id : value
}

function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    labels: [...node.labels],
    properties: { ...node.properties },
  }
}

function cloneLink(link: GraphEdge): GraphEdge {
  return {
    ...link,
    source: toNodeId(link.source),
    target: toNodeId(link.target),
    properties: { ...link.properties },
  }
}

function cloneGraphData(data: GraphData): GraphData {
  return {
    nodes: data.nodes.map(cloneNode),
    links: data.links.map(cloneLink),
  }
}

function buildSubgraph(data: GraphData, links: GraphEdge[]): GraphData {
  const referencedNodeIds = new Set<string | number>()
  for (const link of links) {
    referencedNodeIds.add(toNodeId(link.source))
    referencedNodeIds.add(toNodeId(link.target))
  }
  return {
    nodes: data.nodes.filter((node) => referencedNodeIds.has(node.id)).map(cloneNode),
    links: links.map(cloneLink),
  }
}

interface CharacterSeed {
  id: string
  name: string
  characterId: string
  house?: string
  allegiance?: string
}

const CHARACTER_SEEDS: CharacterSeed[] = [
  { id: 'got-ned', name: 'Eddard Stark', characterId: 'NED', house: 'Stark', allegiance: 'North' },
  { id: 'got-cat', name: 'Catelyn Stark', characterId: 'CAT', house: 'Tully', allegiance: 'North' },
  { id: 'got-rob', name: 'Robb Stark', characterId: 'ROB', house: 'Stark', allegiance: 'North' },
  { id: 'got-san', name: 'Sansa Stark', characterId: 'SAN', house: 'Stark', allegiance: 'North' },
  { id: 'got-ary', name: 'Arya Stark', characterId: 'ARY', house: 'Stark', allegiance: 'North' },
  { id: 'got-bra', name: 'Bran Stark', characterId: 'BRA', house: 'Stark', allegiance: 'North' },
  { id: 'got-ric', name: 'Rickon Stark', characterId: 'RIC', house: 'Stark', allegiance: 'North' },
  { id: 'got-jon', name: 'Jon Snow', characterId: 'JON', house: 'Stark', allegiance: 'Night\'s Watch' },
  { id: 'got-dae', name: 'Daenerys Targaryen', characterId: 'DAE', house: 'Targaryen', allegiance: 'Targaryen' },
  { id: 'got-vis', name: 'Viserys Targaryen', characterId: 'VIS', house: 'Targaryen', allegiance: 'Targaryen' },
  { id: 'got-tyr', name: 'Tyrion Lannister', characterId: 'TYR', house: 'Lannister', allegiance: 'Lannister' },
  { id: 'got-cer', name: 'Cersei Lannister', characterId: 'CER', house: 'Lannister', allegiance: 'Lannister' },
  { id: 'got-jai', name: 'Jaime Lannister', characterId: 'JAI', house: 'Lannister', allegiance: 'Kingsguard' },
  { id: 'got-jof', name: 'Joffrey Baratheon', characterId: 'JOF', house: 'Baratheon', allegiance: 'Lannister' },
  { id: 'got-rob2', name: 'Robert Baratheon', characterId: 'ROB2', house: 'Baratheon', allegiance: 'Iron Throne' },
  { id: 'got-sta', name: 'Stannis Baratheon', characterId: 'STA', house: 'Baratheon', allegiance: 'Iron Throne' },
  { id: 'got-ren', name: 'Renly Baratheon', characterId: 'REN', house: 'Baratheon', allegiance: 'Iron Throne' },
  { id: 'got-tho', name: 'Theon Greyjoy', characterId: 'THO', house: 'Greyjoy', allegiance: 'Iron Islands' },
  { id: 'got-bae', name: 'Petyr Baelish', characterId: 'BAE', house: 'None', allegiance: 'Self' },
  { id: 'got-var', name: 'Varys', characterId: 'VAR', house: 'None', allegiance: 'Realm' },
  { id: 'got-sam', name: 'Samwell Tarly', characterId: 'SAM', house: 'Tarly', allegiance: 'Night\'s Watch' },
  { id: 'got-bri', name: 'Brienne of Tarth', characterId: 'BRI', house: 'None', allegiance: 'Stark' },
  { id: 'got-mee', name: 'Melisandre', characterId: 'MEE', house: 'None', allegiance: 'Lord of Light' },
  { id: 'got-dav', name: 'Davos Seaworth', characterId: 'DAV', house: 'Seaworth', allegiance: 'Baratheon' },
  { id: 'got-ser', name: 'Jorah Mormont', characterId: 'SER', house: 'Mormont', allegiance: 'Targaryen' },
  { id: 'got-dro', name: 'Khal Drogo', characterId: 'DRO', house: 'None', allegiance: 'Dothraki' },
  { id: 'got-bro', name: 'Bronn', characterId: 'BRO', house: 'None', allegiance: 'Lannister' },
  { id: 'got-hound', name: 'Sandor Clegane', characterId: 'HOUND', house: 'Clegane', allegiance: 'Lannister' },
  { id: 'got-mountain', name: 'Gregor Clegane', characterId: 'MOUN', house: 'Clegane', allegiance: 'Lannister' },
  { id: 'got-edd', name: 'Eddison Tollett', characterId: 'EDD', house: 'None', allegiance: 'Night\'s Watch' },
  { id: 'got-pod', name: 'Podrick Payne', characterId: 'POD', house: 'None', allegiance: 'Lannister' },
  { id: 'got-shae', name: 'Shae', characterId: 'SHA', house: 'None', allegiance: 'Self' },
  { id: 'got-mar', name: 'Margaery Tyrell', characterId: 'MAR', house: 'Tyrell', allegiance: 'Highgarden' },
  { id: 'got-lor', name: 'Loras Tyrell', characterId: 'LOR', house: 'Tyrell', allegiance: 'Highgarden' },
  { id: 'got-ole', name: 'Olenna Tyrell', characterId: 'OLE', house: 'Tyrell', allegiance: 'Highgarden' },
  { id: 'got-mis', name: 'Missandei', characterId: 'MIS', house: 'None', allegiance: 'Targaryen' },
  { id: 'got-gre', name: 'Grey Worm', characterId: 'GRE', house: 'None', allegiance: 'Targaryen' },
  { id: 'got-obb', name: 'Oberyn Martell', characterId: 'OBB', house: 'Martell', allegiance: 'Dorne' },
  { id: 'got-gend', name: 'Gendry', characterId: 'GEN', house: 'Baratheon', allegiance: 'None' },
  { id: 'got-tormund', name: 'Tormund Giantsbane', characterId: 'TOR', house: 'None', allegiance: 'Free Folk' },
  { id: 'got-night', name: 'Night King', characterId: 'NIK', house: 'None', allegiance: 'White Walkers' },
  { id: 'got-littlefinger', name: 'Lysa Tully', characterId: 'LYS', house: 'Tully', allegiance: 'Tully' },
  { id: 'got-hodor', name: 'Hodor', characterId: 'HOD', house: 'None', allegiance: 'Stark' },
  { id: 'got-ygritte', name: 'Ygritte', characterId: 'YGR', house: 'None', allegiance: 'Free Folk' },
  { id: 'got-myrcella', name: 'Myrcella Baratheon', characterId: 'MYR', house: 'Baratheon', allegiance: 'Lannister' },
]

interface SeasonSeed {
  id: string
  number: number
  name: string
}

const SEASON_SEEDS: SeasonSeed[] = [
  { id: 'got-s1', number: 1, name: 'Season 1' },
  { id: 'got-s2', number: 2, name: 'Season 2' },
  { id: 'got-s3', number: 3, name: 'Season 3' },
  { id: 'got-s4', number: 4, name: 'Season 4' },
  { id: 'got-s5', number: 5, name: 'Season 5' },
  { id: 'got-s6', number: 6, name: 'Season 6' },
  { id: 'got-s7', number: 7, name: 'Season 7' },
  { id: 'got-s8', number: 8, name: 'Season 8' },
]

// Characters that appear in each season (by characterId)
const SEASON_APPEARANCES: Record<string, string[]> = {
  'got-s1': ['got-ned', 'got-cat', 'got-rob', 'got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-vis', 'got-tyr', 'got-cer', 'got-jai', 'got-jof', 'got-rob2', 'got-tho', 'got-bae', 'got-var', 'got-sam', 'got-dro', 'got-hound', 'got-ric'],
  'got-s2': ['got-cat', 'got-rob', 'got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-jof', 'got-sta', 'got-ren', 'got-tho', 'got-bae', 'got-var', 'got-sam', 'got-bri', 'got-mee', 'got-dav', 'got-ser', 'got-bro', 'got-hound', 'got-ygritte'],
  'got-s3': ['got-cat', 'got-rob', 'got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-jof', 'got-sta', 'got-tho', 'got-bae', 'got-var', 'got-sam', 'got-bri', 'got-mee', 'got-dav', 'got-ser', 'got-bro', 'got-hound', 'got-pod', 'got-shae', 'got-mar', 'got-mis', 'got-gre', 'got-ygritte', 'got-hodor', 'got-edd'],
  'got-s4': ['got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-jof', 'got-sta', 'got-tho', 'got-bae', 'got-var', 'got-sam', 'got-bri', 'got-mee', 'got-dav', 'got-ser', 'got-bro', 'got-hound', 'got-pod', 'got-shae', 'got-mar', 'got-ole', 'got-mis', 'got-gre', 'got-obb', 'got-ygritte', 'got-hodor', 'got-edd'],
  'got-s5': ['got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-sta', 'got-tho', 'got-bae', 'got-var', 'got-sam', 'got-bri', 'got-mee', 'got-dav', 'got-ser', 'got-bro', 'got-pod', 'got-mar', 'got-mis', 'got-gre', 'got-myrcella', 'got-edd', 'got-tormund'],
  'got-s6': ['got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-tho', 'got-bae', 'got-var', 'got-sam', 'got-bri', 'got-mee', 'got-dav', 'got-ser', 'got-bro', 'got-pod', 'got-mar', 'got-mis', 'got-gre', 'got-hodor', 'got-edd', 'got-tormund', 'got-gend'],
  'got-s7': ['got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-tho', 'got-var', 'got-sam', 'got-bri', 'got-mee', 'got-dav', 'got-ser', 'got-bro', 'got-pod', 'got-mis', 'got-gre', 'got-edd', 'got-tormund', 'got-gend', 'got-night'],
  'got-s8': ['got-san', 'got-ary', 'got-bra', 'got-jon', 'got-dae', 'got-tyr', 'got-cer', 'got-jai', 'got-tho', 'got-var', 'got-sam', 'got-bri', 'got-dav', 'got-ser', 'got-bro', 'got-pod', 'got-mis', 'got-gre', 'got-edd', 'got-tormund', 'got-gend', 'got-night'],
}

let edgeIdCounter = 1

const APPEARS_IN_LINKS: GraphEdge[] = Object.entries(SEASON_APPEARANCES).flatMap(([seasonId, characterIds]) =>
  characterIds.map((charId) => ({
    id: `got-ai-${edgeIdCounter++}`,
    source: charId,
    target: seasonId,
    type: 'APPEARS_IN',
    properties: {},
  }))
)

interface InteractionSeed {
  src: string
  dst: string
  weight: number
  season: number
}

const INTERACTION_SEEDS: InteractionSeed[] = [
  // Season 1 core interactions
  { src: 'got-ned', dst: 'got-cat', weight: 32, season: 1 },
  { src: 'got-ned', dst: 'got-rob', weight: 28, season: 1 },
  { src: 'got-ned', dst: 'got-san', weight: 20, season: 1 },
  { src: 'got-ned', dst: 'got-ary', weight: 22, season: 1 },
  { src: 'got-ned', dst: 'got-bra', weight: 14, season: 1 },
  { src: 'got-ned', dst: 'got-jon', weight: 24, season: 1 },
  { src: 'got-ned', dst: 'got-rob2', weight: 30, season: 1 },
  { src: 'got-ned', dst: 'got-cer', weight: 18, season: 1 },
  { src: 'got-ned', dst: 'got-bae', weight: 22, season: 1 },
  { src: 'got-ned', dst: 'got-var', weight: 16, season: 1 },
  { src: 'got-ned', dst: 'got-tho', weight: 12, season: 1 },
  { src: 'got-cat', dst: 'got-rob', weight: 24, season: 1 },
  { src: 'got-cat', dst: 'got-bae', weight: 18, season: 1 },
  { src: 'got-cat', dst: 'got-tyr', weight: 14, season: 1 },
  { src: 'got-dae', dst: 'got-vis', weight: 22, season: 1 },
  { src: 'got-dae', dst: 'got-dro', weight: 28, season: 1 },
  { src: 'got-dae', dst: 'got-ser', weight: 20, season: 1 },
  { src: 'got-tyr', dst: 'got-cer', weight: 26, season: 1 },
  { src: 'got-tyr', dst: 'got-jai', weight: 18, season: 1 },
  { src: 'got-tyr', dst: 'got-jof', weight: 16, season: 1 },
  { src: 'got-cer', dst: 'got-jai', weight: 22, season: 1 },
  { src: 'got-cer', dst: 'got-jof', weight: 14, season: 1 },
  { src: 'got-cer', dst: 'got-rob2', weight: 18, season: 1 },
  { src: 'got-rob2', dst: 'got-jai', weight: 12, season: 1 },
  { src: 'got-jon', dst: 'got-sam', weight: 26, season: 1 },
  { src: 'got-jon', dst: 'got-tho', weight: 16, season: 1 },
  { src: 'got-bae', dst: 'got-var', weight: 20, season: 1 },
  { src: 'got-hound', dst: 'got-san', weight: 12, season: 1 },
  { src: 'got-hound', dst: 'got-jof', weight: 14, season: 1 },
  { src: 'got-ary', dst: 'got-san', weight: 18, season: 1 },
  // Season 2 interactions
  { src: 'got-rob', dst: 'got-cat', weight: 24, season: 2 },
  { src: 'got-tyr', dst: 'got-cer', weight: 30, season: 2 },
  { src: 'got-tyr', dst: 'got-bro', weight: 22, season: 2 },
  { src: 'got-tyr', dst: 'got-pod', weight: 18, season: 2 },
  { src: 'got-dae', dst: 'got-ser', weight: 28, season: 2 },
  { src: 'got-jon', dst: 'got-ygritte', weight: 24, season: 2 },
  { src: 'got-sta', dst: 'got-mee', weight: 26, season: 2 },
  { src: 'got-sta', dst: 'got-dav', weight: 22, season: 2 },
  { src: 'got-bri', dst: 'got-cat', weight: 20, season: 2 },
  { src: 'got-bri', dst: 'got-jai', weight: 16, season: 2 },
  { src: 'got-san', dst: 'got-tyr', weight: 14, season: 2 },
  // Season 3 interactions
  { src: 'got-tyr', dst: 'got-shae', weight: 24, season: 3 },
  { src: 'got-tyr', dst: 'got-cer', weight: 22, season: 3 },
  { src: 'got-tyr', dst: 'got-mar', weight: 14, season: 3 },
  { src: 'got-dae', dst: 'got-mis', weight: 24, season: 3 },
  { src: 'got-dae', dst: 'got-gre', weight: 18, season: 3 },
  { src: 'got-jon', dst: 'got-ygritte', weight: 30, season: 3 },
  { src: 'got-jai', dst: 'got-bri', weight: 28, season: 3 },
  { src: 'got-bra', dst: 'got-hodor', weight: 22, season: 3 },
  { src: 'got-ary', dst: 'got-hound', weight: 26, season: 3 },
  { src: 'got-cat', dst: 'got-rob', weight: 20, season: 3 },
  // Season 4-8 key interactions
  { src: 'got-tyr', dst: 'got-obb', weight: 20, season: 4 },
  { src: 'got-tyr', dst: 'got-jai', weight: 22, season: 4 },
  { src: 'got-ary', dst: 'got-hound', weight: 30, season: 4 },
  { src: 'got-jon', dst: 'got-ygritte', weight: 18, season: 4 },
  { src: 'got-dae', dst: 'got-tyr', weight: 24, season: 5 },
  { src: 'got-dae', dst: 'got-ser', weight: 22, season: 5 },
  { src: 'got-jon', dst: 'got-tormund', weight: 20, season: 5 },
  { src: 'got-san', dst: 'got-tho', weight: 18, season: 5 },
  { src: 'got-jon', dst: 'got-dae', weight: 28, season: 7 },
  { src: 'got-jon', dst: 'got-night', weight: 24, season: 7 },
  { src: 'got-tyr', dst: 'got-dae', weight: 30, season: 7 },
  { src: 'got-san', dst: 'got-ary', weight: 26, season: 7 },
  { src: 'got-jon', dst: 'got-night', weight: 32, season: 8 },
  { src: 'got-ary', dst: 'got-night', weight: 28, season: 8 },
  { src: 'got-dae', dst: 'got-cer', weight: 22, season: 8 },
  { src: 'got-jon', dst: 'got-dae', weight: 30, season: 8 },
  { src: 'got-tyr', dst: 'got-cer', weight: 24, season: 8 },
]

const INTERACTS_LINKS: GraphEdge[] = INTERACTION_SEEDS.map((interaction, idx) => ({
  id: `got-ix-${idx + 1}`,
  source: interaction.src,
  target: interaction.dst,
  type: 'INTERACTS',
  properties: { weight: interaction.weight, season: interaction.season },
}))

export const GOT_SAMPLE: GraphData = {
  nodes: [
    ...CHARACTER_SEEDS.map((char) => ({
      id: char.id,
      labels: [CHARACTER_LABEL],
      label: CHARACTER_LABEL,
      properties: {
        name: char.name,
        characterId: char.characterId,
        house: char.house ?? 'None',
        allegiance: char.allegiance ?? 'None',
        _label: CHARACTER_LABEL,
      },
    })),
    ...SEASON_SEEDS.map((season) => ({
      id: season.id,
      labels: [SEASON_LABEL],
      label: SEASON_LABEL,
      properties: {
        number: season.number,
        name: season.name,
        _label: SEASON_LABEL,
      },
    })),
  ],
  links: [...INTERACTS_LINKS, ...APPEARS_IN_LINKS],
}

function filterSeason1Interactions(data: GraphData): GraphData {
  const links = data.links.filter(
    (link) => link.type === 'INTERACTS' && link.properties.season === 1
  )
  return buildSubgraph(data, links)
}

function filterMostConnectedCharacters(data: GraphData): GraphData {
  const interactLinks = data.links.filter((link) => link.type === 'INTERACTS')
  const connectionCount = new Map<string | number, number>()
  for (const link of interactLinks) {
    const srcId = toNodeId(link.source)
    const dstId = toNodeId(link.target)
    connectionCount.set(srcId, (connectionCount.get(srcId) ?? 0) + 1)
    connectionCount.set(dstId, (connectionCount.get(dstId) ?? 0) + 1)
  }
  const top10 = [...connectionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)
  const topSet = new Set(top10)
  return {
    nodes: data.nodes.filter((node) => topSet.has(node.id)).map(cloneNode),
    links: [],
  }
}

function filterStarkNetwork(data: GraphData): GraphData {
  const starkIds = new Set(
    data.nodes
      .filter((node) => node.labels.includes(CHARACTER_LABEL) && (node.properties.name as string).includes('Stark'))
      .map((node) => node.id)
  )
  const links = data.links.filter((link) => {
    if (link.type !== 'INTERACTS') return false
    return starkIds.has(toNodeId(link.source)) || starkIds.has(toNodeId(link.target))
  })
  return buildSubgraph(data, links)
}

function filterMultiSeasonCharacters(data: GraphData): GraphData {
  const appearsInLinks = data.links.filter((link) => link.type === 'APPEARS_IN')
  const seasonCount = new Map<string | number, number>()
  for (const link of appearsInLinks) {
    const charId = toNodeId(link.source)
    seasonCount.set(charId, (seasonCount.get(charId) ?? 0) + 1)
  }
  const multiSeasonCharIds = new Set(
    [...seasonCount.entries()].filter(([, count]) => count > 3).map(([id]) => id)
  )
  const links = data.links.filter(
    (link) => link.type === 'APPEARS_IN' && multiSeasonCharIds.has(toNodeId(link.source))
  )
  return buildSubgraph(data, links)
}

function filterStrongestBonds(data: GraphData): GraphData {
  const links = data.links.filter(
    (link) => link.type === 'INTERACTS' && (link.properties.weight as number) > 20
  )
  return buildSubgraph(data, links)
}

export const GOT_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All characters and seasons',
    description: 'Complete Game of Thrones character network across all seasons',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: GOT_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'season-1',
    label: 'Season 1 interactions',
    description: 'Character interaction network from the first season',
    cypher: 'MATCH (c1:Character)-[i:INTERACTS {season: 1}]->(c2:Character) RETURN c1, i, c2',
    expectedResultCount: filterSeason1Interactions(GOT_SAMPLE).links.length,
    filterFn: (data) => filterSeason1Interactions(data),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'c1', propsCol: 'c1Props', label: CHARACTER_LABEL },
        { nameCol: 'c2', propsCol: 'c2Props', label: CHARACTER_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'c1', dstCol: 'c2', type: 'INTERACTS' }],
    },
  },
  {
    key: 'most-connected',
    label: 'Most connected characters',
    description: 'Top 10 characters with the highest number of interactions across all seasons',
    cypher:
      'MATCH (c:Character)-[i:INTERACTS]-() WITH c, count(i) AS interactions ORDER BY interactions DESC LIMIT 10 RETURN c, interactions',
    expectedResultCount: filterMostConnectedCharacters(GOT_SAMPLE).nodes.length,
    filterFn: (data) => filterMostConnectedCharacters(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [{ nameCol: 'name', propsCol: 'props', label: CHARACTER_LABEL }],
    },
  },
  {
    key: 'stark-network',
    label: 'Stark family network',
    description: 'The Stark characters and all their interaction connections',
    cypher:
      "MATCH (c:Character)-[i:INTERACTS]-(other:Character) WHERE c.name CONTAINS 'Stark' RETURN c, i, other",
    expectedResultCount: filterStarkNetwork(GOT_SAMPLE).links.length,
    filterFn: (data) => filterStarkNetwork(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'c', propsCol: 'cProps', label: CHARACTER_LABEL },
        { nameCol: 'other', propsCol: 'otherProps', label: CHARACTER_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'c', dstCol: 'other', type: 'INTERACTS' }],
    },
  },
  {
    key: 'cross-season',
    label: 'Characters across all seasons',
    description: 'Characters who appear in more than 3 seasons with their season connections',
    cypher:
      'MATCH (c:Character)-[:APPEARS_IN]->(s:Season) WITH c, collect(s) AS seasons WHERE size(seasons) > 3 RETURN c, seasons',
    expectedResultCount: filterMultiSeasonCharacters(GOT_SAMPLE).links.length,
    filterFn: (data) => filterMultiSeasonCharacters(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'c', propsCol: 'cProps', label: CHARACTER_LABEL },
        { nameCol: 's', propsCol: 'sProps', label: SEASON_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'c', dstCol: 's', type: 'APPEARS_IN' }],
    },
  },
  {
    key: 'strongest-bonds',
    label: 'Strongest character bonds',
    description: 'Interactions with weight above 20 representing the most significant relationships',
    cypher:
      'MATCH (c1:Character)-[i:INTERACTS]->(c2:Character) WHERE i.weight > 20 RETURN c1, i, c2 ORDER BY i.weight DESC',
    expectedResultCount: filterStrongestBonds(GOT_SAMPLE).links.length,
    filterFn: (data) => filterStrongestBonds(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'c1', propsCol: 'c1Props', label: CHARACTER_LABEL },
        { nameCol: 'c2', propsCol: 'c2Props', label: CHARACTER_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'c1', dstCol: 'c2', type: 'INTERACTS' }],
    },
  },
]
