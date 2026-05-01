import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

const LAUREATE_LABEL = 'Laureate'
const CATEGORY_LABEL = 'Category'
const COUNTRY_LABEL = 'Country'
const INSTITUTION_LABEL = 'Institution'

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

interface LaureateSeed {
  id: string
  name: string
  gender: string
  birthYear: number
  birthCountry: string
  wikidataId: string
  category: string
  prizeYear: number
  institution?: string
}

const LAUREATE_SEEDS: LaureateSeed[] = [
  // Physics laureates
  { id: 'wd-l-1', name: 'Albert Einstein', gender: 'male', birthYear: 1879, birthCountry: 'DE', wikidataId: 'Q937', category: 'Physics', prizeYear: 1921, institution: 'ETH Zurich' },
  { id: 'wd-l-2', name: 'Niels Bohr', gender: 'male', birthYear: 1885, birthCountry: 'DK', wikidataId: 'Q7018', category: 'Physics', prizeYear: 1922, institution: 'University of Copenhagen' },
  { id: 'wd-l-3', name: 'Werner Heisenberg', gender: 'male', birthYear: 1901, birthCountry: 'DE', wikidataId: 'Q43287', category: 'Physics', prizeYear: 1932, institution: 'University of Leipzig' },
  { id: 'wd-l-4', name: 'Max Planck', gender: 'male', birthYear: 1858, birthCountry: 'DE', wikidataId: 'Q9021', category: 'Physics', prizeYear: 1918, institution: 'University of Berlin' },
  { id: 'wd-l-5', name: 'Richard Feynman', gender: 'male', birthYear: 1918, birthCountry: 'US', wikidataId: 'Q39246', category: 'Physics', prizeYear: 1965, institution: 'Caltech' },
  { id: 'wd-l-6', name: 'Marie Curie', gender: 'female', birthYear: 1867, birthCountry: 'PL', wikidataId: 'Q7186', category: 'Physics', prizeYear: 1903, institution: 'University of Paris' },
  { id: 'wd-l-7', name: 'Erwin Schrodinger', gender: 'male', birthYear: 1887, birthCountry: 'AT', wikidataId: 'Q41226', category: 'Physics', prizeYear: 1933, institution: 'University of Vienna' },
  { id: 'wd-l-8', name: 'Paul Dirac', gender: 'male', birthYear: 1902, birthCountry: 'GB', wikidataId: 'Q41126', category: 'Physics', prizeYear: 1933, institution: 'Cambridge' },
  // Chemistry laureates
  { id: 'wd-l-9', name: 'Linus Pauling', gender: 'male', birthYear: 1901, birthCountry: 'US', wikidataId: 'Q44472', category: 'Chemistry', prizeYear: 1954, institution: 'Caltech' },
  { id: 'wd-l-10', name: 'Dorothy Hodgkin', gender: 'female', birthYear: 1910, birthCountry: 'GB', wikidataId: 'Q154445', category: 'Chemistry', prizeYear: 1964, institution: 'Oxford' },
  { id: 'wd-l-11', name: 'Fritz Haber', gender: 'male', birthYear: 1868, birthCountry: 'DE', wikidataId: 'Q57444', category: 'Chemistry', prizeYear: 1918 },
  { id: 'wd-l-12', name: 'Ada Yonath', gender: 'female', birthYear: 1939, birthCountry: 'IL', wikidataId: 'Q216649', category: 'Chemistry', prizeYear: 2009, institution: 'Weizmann Institute' },
  { id: 'wd-l-13', name: 'Frances Arnold', gender: 'female', birthYear: 1956, birthCountry: 'US', wikidataId: 'Q4689104', category: 'Chemistry', prizeYear: 2018, institution: 'Caltech' },
  // Medicine laureates
  { id: 'wd-l-14', name: 'Alexander Fleming', gender: 'male', birthYear: 1881, birthCountry: 'GB', wikidataId: 'Q188456', category: 'Medicine', prizeYear: 1945, institution: 'Imperial College London' },
  { id: 'wd-l-15', name: 'James Watson', gender: 'male', birthYear: 1928, birthCountry: 'US', wikidataId: 'Q190056', category: 'Medicine', prizeYear: 1962, institution: 'Harvard' },
  { id: 'wd-l-16', name: 'Rosalind Franklin', gender: 'female', birthYear: 1920, birthCountry: 'GB', wikidataId: 'Q128307', category: 'Medicine', prizeYear: 0 },
  { id: 'wd-l-17', name: 'Elizabeth Blackburn', gender: 'female', birthYear: 1948, birthCountry: 'AU', wikidataId: 'Q213800', category: 'Medicine', prizeYear: 2009, institution: 'UC San Francisco' },
  { id: 'wd-l-18', name: 'Tu Youyou', gender: 'female', birthYear: 1930, birthCountry: 'CN', wikidataId: 'Q270610', category: 'Medicine', prizeYear: 2015 },
  // Literature laureates
  { id: 'wd-l-19', name: 'Ernest Hemingway', gender: 'male', birthYear: 1899, birthCountry: 'US', wikidataId: 'Q23434', category: 'Literature', prizeYear: 1954 },
  { id: 'wd-l-20', name: 'Toni Morrison', gender: 'female', birthYear: 1931, birthCountry: 'US', wikidataId: 'Q72334', category: 'Literature', prizeYear: 1993 },
  { id: 'wd-l-21', name: 'Gabriel Garcia Marquez', gender: 'male', birthYear: 1927, birthCountry: 'CO', wikidataId: 'Q5878', category: 'Literature', prizeYear: 1982 },
  { id: 'wd-l-22', name: 'Pablo Neruda', gender: 'male', birthYear: 1904, birthCountry: 'CL', wikidataId: 'Q61000', category: 'Literature', prizeYear: 1971 },
  { id: 'wd-l-23', name: 'Kazuo Ishiguro', gender: 'male', birthYear: 1954, birthCountry: 'JP', wikidataId: 'Q154003', category: 'Literature', prizeYear: 2017 },
  // Peace laureates
  { id: 'wd-l-24', name: 'Martin Luther King Jr.', gender: 'male', birthYear: 1929, birthCountry: 'US', wikidataId: 'Q8027', category: 'Peace', prizeYear: 1964 },
  { id: 'wd-l-25', name: 'Malala Yousafzai', gender: 'female', birthYear: 1997, birthCountry: 'PK', wikidataId: 'Q35280', category: 'Peace', prizeYear: 2014 },
  { id: 'wd-l-26', name: 'Barack Obama', gender: 'male', birthYear: 1961, birthCountry: 'US', wikidataId: 'Q76', category: 'Peace', prizeYear: 2009 },
  { id: 'wd-l-27', name: 'Nelson Mandela', gender: 'male', birthYear: 1918, birthCountry: 'ZA', wikidataId: 'Q8027', category: 'Peace', prizeYear: 1993 },
  { id: 'wd-l-28', name: 'Mother Teresa', gender: 'female', birthYear: 1910, birthCountry: 'MK', wikidataId: 'Q30547', category: 'Peace', prizeYear: 1979 },
  { id: 'wd-l-29', name: 'Aung San Suu Kyi', gender: 'female', birthYear: 1945, birthCountry: 'MM', wikidataId: 'Q36295', category: 'Peace', prizeYear: 1991 },
  { id: 'wd-l-30', name: 'Wangari Maathai', gender: 'female', birthYear: 1940, birthCountry: 'KE', wikidataId: 'Q234292', category: 'Peace', prizeYear: 2004 },
  // Economics laureates
  { id: 'wd-l-31', name: 'Milton Friedman', gender: 'male', birthYear: 1912, birthCountry: 'US', wikidataId: 'Q49734', category: 'Economics', prizeYear: 1976, institution: 'University of Chicago' },
  { id: 'wd-l-32', name: 'Paul Samuelson', gender: 'male', birthYear: 1915, birthCountry: 'US', wikidataId: 'Q191143', category: 'Economics', prizeYear: 1970, institution: 'MIT' },
  { id: 'wd-l-33', name: 'Amartya Sen', gender: 'male', birthYear: 1933, birthCountry: 'IN', wikidataId: 'Q193134', category: 'Economics', prizeYear: 1998, institution: 'Harvard' },
  { id: 'wd-l-34', name: 'Daniel Kahneman', gender: 'male', birthYear: 1934, birthCountry: 'IL', wikidataId: 'Q171695', category: 'Economics', prizeYear: 2002, institution: 'Princeton' },
  { id: 'wd-l-35', name: 'Elinor Ostrom', gender: 'female', birthYear: 1933, birthCountry: 'US', wikidataId: 'Q237488', category: 'Economics', prizeYear: 2009, institution: 'Indiana University' },
  // Marie Curie also won Chemistry
  { id: 'wd-l-36', name: 'Linus Pauling (Peace)', gender: 'male', birthYear: 1901, birthCountry: 'US', wikidataId: 'Q44472-peace', category: 'Peace', prizeYear: 1962, institution: 'Caltech' },
]

interface CategorySeed {
  id: string
  name: string
  field: string
}

const CATEGORY_SEEDS: CategorySeed[] = [
  { id: 'wd-cat-physics', name: 'Physics', field: 'Natural Sciences' },
  { id: 'wd-cat-chemistry', name: 'Chemistry', field: 'Natural Sciences' },
  { id: 'wd-cat-medicine', name: 'Medicine', field: 'Life Sciences' },
  { id: 'wd-cat-literature', name: 'Literature', field: 'Humanities' },
  { id: 'wd-cat-peace', name: 'Peace', field: 'Social' },
  { id: 'wd-cat-economics', name: 'Economics', field: 'Social Sciences' },
]

const CATEGORY_NAME_TO_ID: Record<string, string> = {
  Physics: 'wd-cat-physics',
  Chemistry: 'wd-cat-chemistry',
  Medicine: 'wd-cat-medicine',
  Literature: 'wd-cat-literature',
  Peace: 'wd-cat-peace',
  Economics: 'wd-cat-economics',
}

interface CountrySeed {
  id: string
  code: string
  name: string
}

const COUNTRY_SEEDS: CountrySeed[] = [
  { id: 'wd-co-us', code: 'US', name: 'United States' },
  { id: 'wd-co-de', code: 'DE', name: 'Germany' },
  { id: 'wd-co-gb', code: 'GB', name: 'United Kingdom' },
  { id: 'wd-co-fr', code: 'FR', name: 'France' },
  { id: 'wd-co-pl', code: 'PL', name: 'Poland' },
  { id: 'wd-co-jp', code: 'JP', name: 'Japan' },
  { id: 'wd-co-in', code: 'IN', name: 'India' },
  { id: 'wd-co-za', code: 'ZA', name: 'South Africa' },
  { id: 'wd-co-pk', code: 'PK', name: 'Pakistan' },
  { id: 'wd-co-cn', code: 'CN', name: 'China' },
]

const COUNTRY_CODE_TO_ID: Record<string, string> = {
  US: 'wd-co-us',
  DE: 'wd-co-de',
  AT: 'wd-co-de',
  GB: 'wd-co-gb',
  FR: 'wd-co-fr',
  PL: 'wd-co-pl',
  JP: 'wd-co-jp',
  IN: 'wd-co-in',
  ZA: 'wd-co-za',
  PK: 'wd-co-pk',
  CN: 'wd-co-cn',
  DK: 'wd-co-gb',
  IL: 'wd-co-de',
  CO: 'wd-co-us',
  CL: 'wd-co-us',
  AU: 'wd-co-gb',
  MK: 'wd-co-de',
  MM: 'wd-co-cn',
  KE: 'wd-co-za',
}

interface InstitutionSeed {
  id: string
  name: string
  country: string
}

const INSTITUTION_SEEDS: InstitutionSeed[] = [
  { id: 'wd-inst-mit', name: 'MIT', country: 'US' },
  { id: 'wd-inst-caltech', name: 'Caltech', country: 'US' },
  { id: 'wd-inst-harvard', name: 'Harvard', country: 'US' },
  { id: 'wd-inst-princeton', name: 'Princeton', country: 'US' },
  { id: 'wd-inst-cambridge', name: 'Cambridge', country: 'GB' },
  { id: 'wd-inst-oxford', name: 'Oxford', country: 'GB' },
  { id: 'wd-inst-uchicago', name: 'University of Chicago', country: 'US' },
  { id: 'wd-inst-weizmann', name: 'Weizmann Institute', country: 'IL' },
]

const INSTITUTION_NAME_TO_ID: Record<string, string> = {
  'MIT': 'wd-inst-mit',
  'Caltech': 'wd-inst-caltech',
  'Harvard': 'wd-inst-harvard',
  'Princeton': 'wd-inst-princeton',
  'Cambridge': 'wd-inst-cambridge',
  'Oxford': 'wd-inst-oxford',
  'University of Chicago': 'wd-inst-uchicago',
  'Weizmann Institute': 'wd-inst-weizmann',
}

let edgeIdCounter = 1

const WON_PRIZE_LINKS: GraphEdge[] = LAUREATE_SEEDS
  .filter((l) => l.prizeYear > 0 && CATEGORY_NAME_TO_ID[l.category])
  .map((laureate) => ({
    id: `wd-wp-${edgeIdCounter++}`,
    source: laureate.id,
    target: CATEGORY_NAME_TO_ID[laureate.category]!,
    type: 'WON_PRIZE_IN',
    properties: { year: laureate.prizeYear },
  }))

const BORN_IN_LINKS: GraphEdge[] = LAUREATE_SEEDS
  .filter((l) => COUNTRY_CODE_TO_ID[l.birthCountry])
  .map((laureate) => ({
    id: `wd-bi-${edgeIdCounter++}`,
    source: laureate.id,
    target: COUNTRY_CODE_TO_ID[laureate.birthCountry]!,
    type: 'BORN_IN',
    properties: {},
  }))

const AFFILIATED_WITH_LINKS: GraphEdge[] = LAUREATE_SEEDS
  .filter((l) => l.institution && INSTITUTION_NAME_TO_ID[l.institution])
  .map((laureate) => ({
    id: `wd-af-${edgeIdCounter++}`,
    source: laureate.id,
    target: INSTITUTION_NAME_TO_ID[laureate.institution!]!,
    type: 'AFFILIATED_WITH',
    properties: {},
  }))

export const WIKIDATA_SAMPLE: GraphData = {
  nodes: [
    ...LAUREATE_SEEDS.map((laureate) => ({
      id: laureate.id,
      labels: [LAUREATE_LABEL],
      label: LAUREATE_LABEL,
      properties: {
        name: laureate.name,
        gender: laureate.gender,
        birthYear: laureate.birthYear,
        birthCountry: laureate.birthCountry,
        wikidataId: laureate.wikidataId,
        category: laureate.category,
        _label: LAUREATE_LABEL,
      },
    })),
    ...CATEGORY_SEEDS.map((category) => ({
      id: category.id,
      labels: [CATEGORY_LABEL],
      label: CATEGORY_LABEL,
      properties: {
        name: category.name,
        field: category.field,
        _label: CATEGORY_LABEL,
      },
    })),
    ...COUNTRY_SEEDS.map((country) => ({
      id: country.id,
      labels: [COUNTRY_LABEL],
      label: COUNTRY_LABEL,
      properties: {
        code: country.code,
        name: country.name,
        _label: COUNTRY_LABEL,
      },
    })),
    ...INSTITUTION_SEEDS.map((institution) => ({
      id: institution.id,
      labels: [INSTITUTION_LABEL],
      label: INSTITUTION_LABEL,
      properties: {
        name: institution.name,
        country: institution.country,
        _label: INSTITUTION_LABEL,
      },
    })),
  ],
  links: [...WON_PRIZE_LINKS, ...BORN_IN_LINKS, ...AFFILIATED_WITH_LINKS],
}

function filterPhysicsLaureates(data: GraphData): GraphData {
  const physicsNode = data.nodes.find(
    (node) => node.labels.includes(CATEGORY_LABEL) && node.properties.name === 'Physics'
  )
  if (!physicsNode) return { nodes: [], links: [] }
  const links = data.links.filter(
    (link) => link.type === 'WON_PRIZE_IN' && toNodeId(link.target) === physicsNode.id
  )
  return buildSubgraph(data, links)
}

function filterByCountry(data: GraphData): GraphData {
  const links = data.links.filter((link) => link.type === 'BORN_IN')
  return buildSubgraph(data, links)
}

function filterInstitutions(data: GraphData): GraphData {
  const links = data.links.filter((link) => link.type === 'AFFILIATED_WITH')
  return buildSubgraph(data, links)
}

function filterPeacePrize(data: GraphData): GraphData {
  const peaceNode = data.nodes.find(
    (node) => node.labels.includes(CATEGORY_LABEL) && node.properties.name === 'Peace'
  )
  if (!peaceNode) return { nodes: [], links: [] }
  const links = data.links.filter(
    (link) => link.type === 'WON_PRIZE_IN' && toNodeId(link.target) === peaceNode.id
  )
  return buildSubgraph(data, links)
}

function filterSharedInstitutions(data: GraphData): GraphData {
  const affiliatedLinks = data.links.filter((link) => link.type === 'AFFILIATED_WITH')
  const institutionToLaureates = new Map<string | number, Set<string | number>>()
  for (const link of affiliatedLinks) {
    const laureateId = toNodeId(link.source)
    const instId = toNodeId(link.target)
    const laureates = institutionToLaureates.get(instId) ?? new Set<string | number>()
    laureates.add(laureateId)
    institutionToLaureates.set(instId, laureates)
  }
  const sharedInstIds = new Set<string | number>()
  for (const [instId, laureates] of institutionToLaureates.entries()) {
    if (laureates.size > 1) sharedInstIds.add(instId)
  }
  const links = affiliatedLinks.filter((link) => sharedInstIds.has(toNodeId(link.target)))
  return buildSubgraph(data, links)
}

export const WIKIDATA_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All laureates and connections',
    description: 'Complete Nobel Prize knowledge graph with laureates, categories, countries, and institutions',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: WIKIDATA_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'physics-laureates',
    label: 'Physics Nobel laureates',
    description: 'All laureates who won the Nobel Prize in Physics',
    cypher: "MATCH (l:Laureate)-[:WON_PRIZE_IN]->(c:Category {name: 'Physics'}) RETURN l, c",
    expectedResultCount: filterPhysicsLaureates(WIKIDATA_SAMPLE).nodes.length,
    filterFn: (data) => filterPhysicsLaureates(data),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'name', propsCol: 'props', label: LAUREATE_LABEL },
        { nameCol: 'category', propsCol: 'catProps', label: CATEGORY_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'l', dstCol: 'c', type: 'WON_PRIZE_IN' }],
    },
  },
  {
    key: 'by-country',
    label: 'Laureates by country',
    description: 'Birth country connections showing geographic distribution of Nobel laureates',
    cypher: 'MATCH (l:Laureate)-[:BORN_IN]->(c:Country) RETURN l.name AS laureate, c.name AS country',
    expectedResultCount: filterByCountry(WIKIDATA_SAMPLE).links.length,
    filterFn: (data) => filterByCountry(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'laureate', propsCol: 'lProps', label: LAUREATE_LABEL },
        { nameCol: 'country', propsCol: 'cProps', label: COUNTRY_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'laureate', dstCol: 'country', type: 'BORN_IN' }],
    },
  },
  {
    key: 'institutional-hubs',
    label: 'University connections',
    description: 'Institutional affiliations linking laureates to universities and research centers',
    cypher: 'MATCH (l:Laureate)-[:AFFILIATED_WITH]->(i:Institution) RETURN l, i',
    expectedResultCount: filterInstitutions(WIKIDATA_SAMPLE).links.length,
    filterFn: (data) => filterInstitutions(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'l', propsCol: 'lProps', label: LAUREATE_LABEL },
        { nameCol: 'i', propsCol: 'iProps', label: INSTITUTION_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'l', dstCol: 'i', type: 'AFFILIATED_WITH' }],
    },
  },
  {
    key: 'peace-prize',
    label: 'Peace Prize winners',
    description: 'Nobel Peace Prize laureates ordered by year awarded',
    cypher:
      "MATCH (l:Laureate)-[w:WON_PRIZE_IN]->(c:Category {name: 'Peace'}) RETURN l, w, c ORDER BY w.year DESC",
    expectedResultCount: filterPeacePrize(WIKIDATA_SAMPLE).links.length,
    filterFn: (data) => filterPeacePrize(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'l', propsCol: 'lProps', label: LAUREATE_LABEL },
        { nameCol: 'c', propsCol: 'cProps', label: CATEGORY_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'l', dstCol: 'c', type: 'WON_PRIZE_IN' }],
    },
  },
  {
    key: 'cross-discipline',
    label: 'Shared institutions across disciplines',
    description: 'Universities with multiple Nobel laureates spanning different prize categories',
    cypher:
      'MATCH (l1:Laureate)-[:AFFILIATED_WITH]->(i:Institution)<-[:AFFILIATED_WITH]-(l2:Laureate) WHERE l1 <> l2 RETURN l1, l2, i',
    expectedResultCount: filterSharedInstitutions(WIKIDATA_SAMPLE).links.length,
    filterFn: (data) => filterSharedInstitutions(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'l1', propsCol: 'l1Props', label: LAUREATE_LABEL },
        { nameCol: 'l2', propsCol: 'l2Props', label: LAUREATE_LABEL },
        { nameCol: 'i', propsCol: 'iProps', label: INSTITUTION_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'l1', dstCol: 'i', type: 'AFFILIATED_WITH' }],
    },
  },
]
