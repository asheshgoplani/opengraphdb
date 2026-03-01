import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

const AIRPORT_LABEL = 'Airport'
const COUNTRY_LABEL = 'Country'
const CONTINENT_LABEL = 'Continent'

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

interface AirportSeed {
  id: string
  code: string
  icao: string
  name: string
  city: string
  country: string
  region: string
  lat: number
  lon: number
  runways: number
  elev: number
}

const AIRPORT_SEEDS: AirportSeed[] = [
  // North America - USA
  { id: 'ar-atl', code: 'ATL', icao: 'KATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', country: 'US', region: 'US-GA', lat: 33.6367, lon: -84.4281, runways: 5, elev: 1026 },
  { id: 'ar-jfk', code: 'JFK', icao: 'KJFK', name: 'John F. Kennedy International', city: 'New York', country: 'US', region: 'US-NY', lat: 40.6413, lon: -73.7781, runways: 4, elev: 13 },
  { id: 'ar-lax', code: 'LAX', icao: 'KLAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'US', region: 'US-CA', lat: 33.9425, lon: -118.4081, runways: 4, elev: 125 },
  { id: 'ar-ord', code: 'ORD', icao: 'KORD', name: "O'Hare International", city: 'Chicago', country: 'US', region: 'US-IL', lat: 41.9742, lon: -87.9073, runways: 8, elev: 672 },
  { id: 'ar-dfw', code: 'DFW', icao: 'KDFW', name: 'Dallas/Fort Worth International', city: 'Dallas', country: 'US', region: 'US-TX', lat: 32.8998, lon: -97.0403, runways: 7, elev: 607 },
  { id: 'ar-den', code: 'DEN', icao: 'KDEN', name: 'Denver International', city: 'Denver', country: 'US', region: 'US-CO', lat: 39.8561, lon: -104.6737, runways: 6, elev: 5431 },
  { id: 'ar-sfo', code: 'SFO', icao: 'KSFO', name: 'San Francisco International', city: 'San Francisco', country: 'US', region: 'US-CA', lat: 37.6213, lon: -122.3790, runways: 4, elev: 13 },
  { id: 'ar-sea', code: 'SEA', icao: 'KSEA', name: 'Seattle-Tacoma International', city: 'Seattle', country: 'US', region: 'US-WA', lat: 47.4502, lon: -122.3088, runways: 3, elev: 433 },
  { id: 'ar-mia', code: 'MIA', icao: 'KMIA', name: 'Miami International', city: 'Miami', country: 'US', region: 'US-FL', lat: 25.7959, lon: -80.2870, runways: 4, elev: 8 },
  { id: 'ar-bos', code: 'BOS', icao: 'KBOS', name: 'Logan International', city: 'Boston', country: 'US', region: 'US-MA', lat: 42.3656, lon: -71.0096, runways: 6, elev: 19 },
  // North America - Canada
  { id: 'ar-yyz', code: 'YYZ', icao: 'CYYZ', name: 'Toronto Pearson International', city: 'Toronto', country: 'CA', region: 'CA-ON', lat: 43.6772, lon: -79.6306, runways: 5, elev: 569 },
  { id: 'ar-yvr', code: 'YVR', icao: 'CYVR', name: 'Vancouver International', city: 'Vancouver', country: 'CA', region: 'CA-BC', lat: 49.1947, lon: -123.1792, runways: 3, elev: 14 },
  // Europe
  { id: 'ar-lhr', code: 'LHR', icao: 'EGLL', name: 'Heathrow Airport', city: 'London', country: 'GB', region: 'EU-GB', lat: 51.4775, lon: -0.4614, runways: 2, elev: 83 },
  { id: 'ar-cdg', code: 'CDG', icao: 'LFPG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'FR', region: 'EU-FR', lat: 49.0097, lon: 2.5479, runways: 4, elev: 392 },
  { id: 'ar-fra', code: 'FRA', icao: 'EDDF', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE', region: 'EU-DE', lat: 50.0379, lon: 8.5622, runways: 4, elev: 364 },
  { id: 'ar-ams', code: 'AMS', icao: 'EHAM', name: 'Amsterdam Schiphol Airport', city: 'Amsterdam', country: 'NL', region: 'EU-NL', lat: 52.3086, lon: 4.7639, runways: 6, elev: -11 },
  { id: 'ar-mad', code: 'MAD', icao: 'LEMD', name: 'Adolfo Suarez Madrid-Barajas', city: 'Madrid', country: 'ES', region: 'EU-ES', lat: 40.4936, lon: -3.5669, runways: 4, elev: 1998 },
  { id: 'ar-bcn', code: 'BCN', icao: 'LEBL', name: 'Barcelona El Prat Airport', city: 'Barcelona', country: 'ES', region: 'EU-ES', lat: 41.2971, lon: 2.0785, runways: 3, elev: 12 },
  { id: 'ar-muc', code: 'MUC', icao: 'EDDM', name: 'Munich Airport', city: 'Munich', country: 'DE', region: 'EU-DE', lat: 48.3537, lon: 11.7750, runways: 2, elev: 1487 },
  { id: 'ar-zrh', code: 'ZRH', icao: 'LSZH', name: 'Zurich Airport', city: 'Zurich', country: 'CH', region: 'EU-CH', lat: 47.4647, lon: 8.5492, runways: 3, elev: 1416 },
  { id: 'ar-fcо', code: 'FCO', icao: 'LIRF', name: 'Leonardo da Vinci International', city: 'Rome', country: 'IT', region: 'EU-IT', lat: 41.7999, lon: 12.2462, runways: 3, elev: 13 },
  { id: 'ar-ist', code: 'IST', icao: 'LTFM', name: 'Istanbul Airport', city: 'Istanbul', country: 'TR', region: 'EU-TR', lat: 41.2753, lon: 28.7519, runways: 3, elev: 325 },
  { id: 'ar-cph', code: 'CPH', icao: 'EKCH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'DK', region: 'EU-DK', lat: 55.6181, lon: 12.6561, runways: 3, elev: 17 },
  // Middle East
  { id: 'ar-dxb', code: 'DXB', icao: 'OMDB', name: 'Dubai International', city: 'Dubai', country: 'AE', region: 'ME-AE', lat: 25.2532, lon: 55.3657, runways: 2, elev: 62 },
  { id: 'ar-doh', code: 'DOH', icao: 'OTBH', name: 'Hamad International', city: 'Doha', country: 'QA', region: 'ME-QA', lat: 25.2731, lon: 51.6081, runways: 2, elev: 13 },
  { id: 'ar-auh', code: 'AUH', icao: 'OMAA', name: 'Abu Dhabi International', city: 'Abu Dhabi', country: 'AE', region: 'ME-AE', lat: 24.4330, lon: 54.6511, runways: 2, elev: 88 },
  // Asia Pacific
  { id: 'ar-hnd', code: 'HND', icao: 'RJTT', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'JP', region: 'AP-JP', lat: 35.5494, lon: 139.7798, runways: 4, elev: 35 },
  { id: 'ar-nrt', code: 'NRT', icao: 'RJAA', name: 'Narita International Airport', city: 'Tokyo', country: 'JP', region: 'AP-JP', lat: 35.7720, lon: 140.3929, runways: 2, elev: 141 },
  { id: 'ar-sin', code: 'SIN', icao: 'WSSS', name: 'Changi Airport', city: 'Singapore', country: 'SG', region: 'AP-SG', lat: 1.3644, lon: 103.9915, runways: 3, elev: 22 },
  { id: 'ar-hkg', code: 'HKG', icao: 'VHHH', name: 'Hong Kong International', city: 'Hong Kong', country: 'HK', region: 'AP-HK', lat: 22.3080, lon: 113.9185, runways: 2, elev: 28 },
  { id: 'ar-pek', code: 'PEK', icao: 'ZBAA', name: 'Beijing Capital International', city: 'Beijing', country: 'CN', region: 'AP-CN', lat: 40.0801, lon: 116.5846, runways: 3, elev: 116 },
  { id: 'ar-pkx', code: 'PKX', icao: 'ZBAD', name: 'Beijing Daxing International', city: 'Beijing', country: 'CN', region: 'AP-CN', lat: 39.5098, lon: 116.4105, runways: 4, elev: 97 },
  { id: 'ar-pvg', code: 'PVG', icao: 'ZSPD', name: 'Shanghai Pudong International', city: 'Shanghai', country: 'CN', region: 'AP-CN', lat: 31.1443, lon: 121.8083, runways: 4, elev: 13 },
  { id: 'ar-icn', code: 'ICN', icao: 'RKSI', name: 'Incheon International', city: 'Seoul', country: 'KR', region: 'AP-KR', lat: 37.4600, lon: 126.4407, runways: 4, elev: 23 },
  { id: 'ar-syd', code: 'SYD', icao: 'YSSY', name: 'Sydney Kingsford Smith International', city: 'Sydney', country: 'AU', region: 'AP-AU', lat: -33.9461, lon: 151.1772, runways: 3, elev: 21 },
  { id: 'ar-mel', code: 'MEL', icao: 'YMML', name: 'Melbourne Airport', city: 'Melbourne', country: 'AU', region: 'AP-AU', lat: -37.6690, lon: 144.8410, runways: 2, elev: 434 },
  { id: 'ar-bkk', code: 'BKK', icao: 'VTBS', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'TH', region: 'AP-TH', lat: 13.6900, lon: 100.7501, runways: 2, elev: 5 },
  { id: 'ar-kul', code: 'KUL', icao: 'WMKK', name: 'Kuala Lumpur International', city: 'Kuala Lumpur', country: 'MY', region: 'AP-MY', lat: 2.7456, lon: 101.7099, runways: 2, elev: 69 },
  { id: 'ar-del', code: 'DEL', icao: 'VIDP', name: 'Indira Gandhi International', city: 'New Delhi', country: 'IN', region: 'AP-IN', lat: 28.5562, lon: 77.1000, runways: 3, elev: 777 },
  { id: 'ar-bom', code: 'BOM', icao: 'VABB', name: 'Chhatrapati Shivaji Maharaj International', city: 'Mumbai', country: 'IN', region: 'AP-IN', lat: 19.0896, lon: 72.8656, runways: 2, elev: 37 },
  // Africa
  { id: 'ar-jnb', code: 'JNB', icao: 'FAOR', name: 'O.R. Tambo International', city: 'Johannesburg', country: 'ZA', region: 'AF-ZA', lat: -26.1392, lon: 28.2460, runways: 2, elev: 5558 },
  { id: 'ar-cai', code: 'CAI', icao: 'HECA', name: 'Cairo International', city: 'Cairo', country: 'EG', region: 'AF-EG', lat: 30.1219, lon: 31.4056, runways: 3, elev: 382 },
  // South America
  { id: 'ar-gru', code: 'GRU', icao: 'SBGR', name: 'São Paulo/Guarulhos International', city: 'São Paulo', country: 'BR', region: 'SA-BR', lat: -23.4356, lon: -46.4731, runways: 3, elev: 2459 },
  { id: 'ar-bog', code: 'BOG', icao: 'SKBO', name: 'El Dorado International', city: 'Bogota', country: 'CO', region: 'SA-CO', lat: 4.7016, lon: -74.1469, runways: 2, elev: 8360 },
]

interface CountrySeed {
  id: string
  code: string
  name: string
  continent: string
}

const COUNTRY_SEEDS: CountrySeed[] = [
  { id: 'ar-c-us', code: 'US', name: 'United States', continent: 'ar-ct-na' },
  { id: 'ar-c-ca', code: 'CA', name: 'Canada', continent: 'ar-ct-na' },
  { id: 'ar-c-gb', code: 'GB', name: 'United Kingdom', continent: 'ar-ct-eu' },
  { id: 'ar-c-fr', code: 'FR', name: 'France', continent: 'ar-ct-eu' },
  { id: 'ar-c-de', code: 'DE', name: 'Germany', continent: 'ar-ct-eu' },
  { id: 'ar-c-nl', code: 'NL', name: 'Netherlands', continent: 'ar-ct-eu' },
  { id: 'ar-c-es', code: 'ES', name: 'Spain', continent: 'ar-ct-eu' },
  { id: 'ar-c-ae', code: 'AE', name: 'United Arab Emirates', continent: 'ar-ct-me' },
  { id: 'ar-c-jp', code: 'JP', name: 'Japan', continent: 'ar-ct-ap' },
  { id: 'ar-c-cn', code: 'CN', name: 'China', continent: 'ar-ct-ap' },
  { id: 'ar-c-sg', code: 'SG', name: 'Singapore', continent: 'ar-ct-ap' },
  { id: 'ar-c-au', code: 'AU', name: 'Australia', continent: 'ar-ct-ap' },
  { id: 'ar-c-in', code: 'IN', name: 'India', continent: 'ar-ct-ap' },
  { id: 'ar-c-br', code: 'BR', name: 'Brazil', continent: 'ar-ct-sa' },
  { id: 'ar-c-za', code: 'ZA', name: 'South Africa', continent: 'ar-ct-af' },
]

interface ContinentSeed {
  id: string
  code: string
  name: string
}

const CONTINENT_SEEDS: ContinentSeed[] = [
  { id: 'ar-ct-na', code: 'NA', name: 'North America' },
  { id: 'ar-ct-eu', code: 'EU', name: 'Europe' },
  { id: 'ar-ct-ap', code: 'AP', name: 'Asia Pacific' },
  { id: 'ar-ct-me', code: 'ME', name: 'Middle East' },
  { id: 'ar-ct-sa', code: 'SA', name: 'South America' },
  { id: 'ar-ct-af', code: 'AF', name: 'Africa' },
]

const AIRPORT_COUNTRY_MAP: Record<string, string> = {
  US: 'ar-c-us',
  CA: 'ar-c-ca',
  GB: 'ar-c-gb',
  FR: 'ar-c-fr',
  DE: 'ar-c-de',
  NL: 'ar-c-nl',
  ES: 'ar-c-es',
  CH: 'ar-c-de',
  IT: 'ar-c-de',
  TR: 'ar-c-de',
  DK: 'ar-c-de',
  AE: 'ar-c-ae',
  QA: 'ar-c-ae',
  JP: 'ar-c-jp',
  CN: 'ar-c-cn',
  HK: 'ar-c-cn',
  KR: 'ar-c-jp',
  SG: 'ar-c-sg',
  AU: 'ar-c-au',
  IN: 'ar-c-in',
  TH: 'ar-c-sg',
  MY: 'ar-c-sg',
  BR: 'ar-c-br',
  CO: 'ar-c-br',
  ZA: 'ar-c-za',
  EG: 'ar-c-za',
}

interface RouteSeed {
  src: string
  dst: string
  dist: number
}

const ROUTE_SEEDS: RouteSeed[] = [
  // Transatlantic routes
  { src: 'ar-jfk', dst: 'ar-lhr', dist: 5570 },
  { src: 'ar-jfk', dst: 'ar-cdg', dist: 5837 },
  { src: 'ar-jfk', dst: 'ar-fra', dist: 6197 },
  { src: 'ar-jfk', dst: 'ar-ams', dist: 5866 },
  { src: 'ar-lax', dst: 'ar-lhr', dist: 8749 },
  { src: 'ar-lax', dst: 'ar-cdg', dist: 9125 },
  { src: 'ar-bos', dst: 'ar-lhr', dist: 5267 },
  { src: 'ar-mia', dst: 'ar-mad', dist: 7683 },
  { src: 'ar-atl', dst: 'ar-lhr', dist: 7001 },
  { src: 'ar-ord', dst: 'ar-lhr', dist: 6349 },
  // US domestic routes
  { src: 'ar-atl', dst: 'ar-jfk', dist: 1214 },
  { src: 'ar-atl', dst: 'ar-lax', dist: 3121 },
  { src: 'ar-atl', dst: 'ar-ord', dist: 974 },
  { src: 'ar-atl', dst: 'ar-dfw', dist: 1143 },
  { src: 'ar-atl', dst: 'ar-mia', dist: 947 },
  { src: 'ar-jfk', dst: 'ar-lax', dist: 3983 },
  { src: 'ar-jfk', dst: 'ar-ord', dist: 1185 },
  { src: 'ar-lax', dst: 'ar-sfo', dist: 559 },
  { src: 'ar-lax', dst: 'ar-sea', dist: 1547 },
  { src: 'ar-lax', dst: 'ar-dfw', dist: 2272 },
  { src: 'ar-lax', dst: 'ar-ord', dist: 2995 },
  { src: 'ar-ord', dst: 'ar-dfw', dist: 1289 },
  { src: 'ar-ord', dst: 'ar-den', dist: 1476 },
  { src: 'ar-sfo', dst: 'ar-sea', dist: 1091 },
  { src: 'ar-dfw', dst: 'ar-mia', dist: 2161 },
  { src: 'ar-den', dst: 'ar-lax', dist: 1530 },
  // North America to Canada
  { src: 'ar-jfk', dst: 'ar-yyz', dist: 573 },
  { src: 'ar-ord', dst: 'ar-yyz', dist: 717 },
  { src: 'ar-sfo', dst: 'ar-yvr', dist: 1078 },
  { src: 'ar-lax', dst: 'ar-yvr', dist: 1745 },
  // European intra-routes
  { src: 'ar-lhr', dst: 'ar-cdg', dist: 344 },
  { src: 'ar-lhr', dst: 'ar-fra', dist: 632 },
  { src: 'ar-lhr', dst: 'ar-ams', dist: 366 },
  { src: 'ar-lhr', dst: 'ar-mad', dist: 1242 },
  { src: 'ar-cdg', dst: 'ar-fra', dist: 479 },
  { src: 'ar-cdg', dst: 'ar-ams', dist: 397 },
  { src: 'ar-fra', dst: 'ar-ams', dist: 363 },
  { src: 'ar-fra', dst: 'ar-muc', dist: 305 },
  { src: 'ar-fra', dst: 'ar-ist', dist: 2238 },
  { src: 'ar-ams', dst: 'ar-cph', dist: 622 },
  { src: 'ar-mad', dst: 'ar-bcn', dist: 503 },
  { src: 'ar-lhr', dst: 'ar-ist', dist: 2543 },
  { src: 'ar-muc', dst: 'ar-zrh', dist: 292 },
  { src: 'ar-cdg', dst: 'ar-fcо', dist: 1106 },
  // Europe to Middle East
  { src: 'ar-lhr', dst: 'ar-dxb', dist: 5492 },
  { src: 'ar-fra', dst: 'ar-dxb', dist: 4865 },
  { src: 'ar-cdg', dst: 'ar-dxb', dist: 5245 },
  { src: 'ar-ist', dst: 'ar-dxb', dist: 2636 },
  { src: 'ar-dxb', dst: 'ar-doh', dist: 369 },
  { src: 'ar-dxb', dst: 'ar-auh', dist: 118 },
  // Long haul Asia routes
  { src: 'ar-dxb', dst: 'ar-sin', dist: 5841 },
  { src: 'ar-dxb', dst: 'ar-hnd', dist: 7969 },
  { src: 'ar-dxb', dst: 'ar-hkg', dist: 6318 },
  { src: 'ar-dxb', dst: 'ar-pvg', dist: 6977 },
  { src: 'ar-sin', dst: 'ar-hkg', dist: 2571 },
  { src: 'ar-sin', dst: 'ar-bkk', dist: 1437 },
  { src: 'ar-sin', dst: 'ar-kul', dist: 314 },
  { src: 'ar-sin', dst: 'ar-syd', dist: 6302 },
  { src: 'ar-hkg', dst: 'ar-pek', dist: 1975 },
  { src: 'ar-hkg', dst: 'ar-pvg', dist: 1253 },
  { src: 'ar-hkg', dst: 'ar-hnd', dist: 2906 },
  { src: 'ar-icn', dst: 'ar-hnd', dist: 1159 },
  { src: 'ar-icn', dst: 'ar-pvg', dist: 866 },
  { src: 'ar-pek', dst: 'ar-pvg', dist: 1074 },
  { src: 'ar-del', dst: 'ar-bom', dist: 1148 },
  { src: 'ar-del', dst: 'ar-sin', dist: 4147 },
  { src: 'ar-del', dst: 'ar-dxb', dist: 2196 },
  // Ultra-long haul
  { src: 'ar-jfk', dst: 'ar-sin', dist: 15345 },
  { src: 'ar-lax', dst: 'ar-sin', dist: 14113 },
  { src: 'ar-lax', dst: 'ar-syd', dist: 12068 },
  { src: 'ar-jfk', dst: 'ar-hnd', dist: 10836 },
  { src: 'ar-lhr', dst: 'ar-sin', dist: 10841 },
  { src: 'ar-lhr', dst: 'ar-syd', dist: 16993 },
  // North America to Asia
  { src: 'ar-lax', dst: 'ar-hnd', dist: 8756 },
  { src: 'ar-lax', dst: 'ar-hkg', dist: 11659 },
  { src: 'ar-ord', dst: 'ar-hnd', dist: 10147 },
  { src: 'ar-sfo', dst: 'ar-hnd', dist: 8277 },
  { src: 'ar-sfo', dst: 'ar-hkg', dist: 11122 },
  { src: 'ar-jfk', dst: 'ar-hkg', dist: 12972 },
  // South America
  { src: 'ar-mia', dst: 'ar-gru', dist: 7096 },
  { src: 'ar-jfk', dst: 'ar-gru', dist: 9728 },
  { src: 'ar-gru', dst: 'ar-bog', dist: 3919 },
  { src: 'ar-lhr', dst: 'ar-gru', dist: 9451 },
  // Africa
  { src: 'ar-lhr', dst: 'ar-jnb', dist: 9074 },
  { src: 'ar-fra', dst: 'ar-jnb', dist: 8649 },
  { src: 'ar-dxb', dst: 'ar-jnb', dist: 6432 },
  { src: 'ar-lhr', dst: 'ar-cai', dist: 3524 },
  { src: 'ar-fra', dst: 'ar-cai', dist: 2915 },
  { src: 'ar-jnb', dst: 'ar-cai', dist: 6264 },
]

let edgeIdCounter = 1

const ROUTE_LINKS: GraphEdge[] = ROUTE_SEEDS.map((route) => ({
  id: `ar-r-${edgeIdCounter++}`,
  source: route.src,
  target: route.dst,
  type: 'ROUTE',
  properties: { dist: route.dist },
}))

const COUNTRY_CONTAINS_LINKS: GraphEdge[] = COUNTRY_SEEDS.map((country) => ({
  id: `ar-cc-${edgeIdCounter++}`,
  source: country.continent,
  target: country.id,
  type: 'CONTAINS',
  properties: {},
}))

const AIRPORT_IN_COUNTRY_LINKS: GraphEdge[] = AIRPORT_SEEDS.map((airport) => ({
  id: `ar-ac-${edgeIdCounter++}`,
  source: AIRPORT_COUNTRY_MAP[airport.country] ?? 'ar-c-us',
  target: airport.id,
  type: 'CONTAINS',
  properties: {},
}))

export const AIR_ROUTES_SAMPLE: GraphData = {
  nodes: [
    ...AIRPORT_SEEDS.map((airport) => ({
      id: airport.id,
      labels: [AIRPORT_LABEL],
      label: AIRPORT_LABEL,
      properties: {
        code: airport.code,
        icao: airport.icao,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        region: airport.region,
        lat: airport.lat,
        lon: airport.lon,
        runways: airport.runways,
        elev: airport.elev,
        _label: AIRPORT_LABEL,
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
    ...CONTINENT_SEEDS.map((continent) => ({
      id: continent.id,
      labels: [CONTINENT_LABEL],
      label: CONTINENT_LABEL,
      properties: {
        code: continent.code,
        name: continent.name,
        _label: CONTINENT_LABEL,
      },
    })),
  ],
  links: [...ROUTE_LINKS, ...COUNTRY_CONTAINS_LINKS, ...AIRPORT_IN_COUNTRY_LINKS],
}

function filterUsAirports(data: GraphData): GraphData {
  return {
    nodes: data.nodes
      .filter((node) => node.labels.includes(AIRPORT_LABEL) && node.properties.country === 'US')
      .map(cloneNode),
    links: [],
  }
}

function filterTransatlanticRoutes(data: GraphData): GraphData {
  const links = data.links.filter((link) => {
    if (link.type !== 'ROUTE') return false
    const srcId = toNodeId(link.source)
    const dstId = toNodeId(link.target)
    const srcNode = data.nodes.find((n) => n.id === srcId)
    const dstNode = data.nodes.find((n) => n.id === dstId)
    if (!srcNode || !dstNode) return false
    const srcRegion = srcNode.properties.region as string
    const dstRegion = dstNode.properties.region as string
    return srcRegion.startsWith('US') && dstRegion.startsWith('EU')
  })
  return buildSubgraph(data, links)
}

function filterTopHubs(data: GraphData): GraphData {
  const routeLinks = data.links.filter((link) => link.type === 'ROUTE')
  const connectionCount = new Map<string | number, number>()
  for (const link of routeLinks) {
    const srcId = toNodeId(link.source)
    const dstId = toNodeId(link.target)
    connectionCount.set(srcId, (connectionCount.get(srcId) ?? 0) + 1)
    connectionCount.set(dstId, (connectionCount.get(dstId) ?? 0) + 1)
  }
  const sortedByConnections = [...connectionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id]) => id)
  const topHubSet = new Set(sortedByConnections)
  return {
    nodes: data.nodes.filter((node) => topHubSet.has(node.id)).map(cloneNode),
    links: [],
  }
}

function filterEuropeanNetwork(data: GraphData): GraphData {
  const links = data.links.filter((link) => {
    if (link.type !== 'ROUTE') return false
    const srcId = toNodeId(link.source)
    const dstId = toNodeId(link.target)
    const srcNode = data.nodes.find((n) => n.id === srcId)
    const dstNode = data.nodes.find((n) => n.id === dstId)
    if (!srcNode || !dstNode) return false
    return (srcNode.properties.region as string).startsWith('EU') && (dstNode.properties.region as string).startsWith('EU')
  })
  return buildSubgraph(data, links)
}

function filterLongHaulRoutes(data: GraphData): GraphData {
  const links = data.links.filter((link) => link.type === 'ROUTE' && (link.properties.dist as number) > 5000)
  return buildSubgraph(data, links)
}

export const AIR_ROUTES_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All airports and routes',
    description: 'Complete air routes network with airports, countries, and continents',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: AIR_ROUTES_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'us-airports',
    label: 'US airports',
    description: 'All major US hub airports in the dataset',
    cypher: "MATCH (a:Airport) WHERE a.country = 'US' RETURN a",
    expectedResultCount: filterUsAirports(AIR_ROUTES_SAMPLE).nodes.length,
    filterFn: (data) => filterUsAirports(data),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [{ nameCol: 'code', propsCol: 'props', label: AIRPORT_LABEL }],
    },
  },
  {
    key: 'transatlantic',
    label: 'Transatlantic routes',
    description: 'Routes connecting US airports to European airports',
    cypher:
      "MATCH (a1:Airport)-[r:ROUTE]->(a2:Airport) WHERE a1.region STARTS WITH 'US' AND a2.region STARTS WITH 'EU' RETURN a1, r, a2",
    expectedResultCount: filterTransatlanticRoutes(AIR_ROUTES_SAMPLE).links.length,
    filterFn: (data) => filterTransatlanticRoutes(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'a1', propsCol: 'a1Props', label: AIRPORT_LABEL },
        { nameCol: 'a2', propsCol: 'a2Props', label: AIRPORT_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'a1', dstCol: 'a2', type: 'ROUTE' }],
    },
  },
  {
    key: 'hub-analysis',
    label: 'Top hub airports',
    description: 'The 15 most connected hub airports by route count',
    cypher:
      'MATCH (a:Airport)-[:ROUTE]-() WITH a, count(*) AS routes ORDER BY routes DESC LIMIT 15 RETURN a, routes',
    expectedResultCount: filterTopHubs(AIR_ROUTES_SAMPLE).nodes.length,
    filterFn: (data) => filterTopHubs(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [{ nameCol: 'code', propsCol: 'props', label: AIRPORT_LABEL }],
    },
  },
  {
    key: 'european-network',
    label: 'European airport network',
    description: 'Routes between European airports showing intra-continental connectivity',
    cypher:
      "MATCH (a:Airport)-[r:ROUTE]->(b:Airport) WHERE a.region STARTS WITH 'EU' AND b.region STARTS WITH 'EU' RETURN a, r, b",
    expectedResultCount: filterEuropeanNetwork(AIR_ROUTES_SAMPLE).links.length,
    filterFn: (data) => filterEuropeanNetwork(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'a', propsCol: 'aProps', label: AIRPORT_LABEL },
        { nameCol: 'b', propsCol: 'bProps', label: AIRPORT_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'a', dstCol: 'b', type: 'ROUTE' }],
    },
  },
  {
    key: 'long-haul',
    label: 'Longest routes',
    description: 'Ultra-long-haul routes over 5000 km connecting continents',
    cypher:
      'MATCH (a1:Airport)-[r:ROUTE]->(a2:Airport) WHERE r.dist > 5000 RETURN a1, r, a2 ORDER BY r.dist DESC',
    expectedResultCount: filterLongHaulRoutes(AIR_ROUTES_SAMPLE).links.length,
    filterFn: (data) => filterLongHaulRoutes(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'a1', propsCol: 'a1Props', label: AIRPORT_LABEL },
        { nameCol: 'a2', propsCol: 'a2Props', label: AIRPORT_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'a1', dstCol: 'a2', type: 'ROUTE' }],
    },
  },
]
