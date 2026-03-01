import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

const MOVIE_LABEL = 'Movie'
const GENRE_LABEL = 'Genre'

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

function filterByRelationshipTypes(data: GraphData, types: string[]): GraphData {
  const typeSet = new Set(types)
  const links = data.links.filter((link) => typeSet.has(link.type))
  return buildSubgraph(data, links)
}

interface MovieSeed {
  id: string
  title: string
  released: number
  genres: string
  avgRating: number
  ratingCount: number
}

const MOVIE_SEEDS: MovieSeed[] = [
  { id: 'ml-m-1', title: 'The Shawshank Redemption', released: 1994, genres: 'Drama', avgRating: 4.8, ratingCount: 2358 },
  { id: 'ml-m-2', title: 'The Godfather', released: 1972, genres: 'Crime', avgRating: 4.7, ratingCount: 1921 },
  { id: 'ml-m-3', title: 'The Dark Knight', released: 2008, genres: 'Action', avgRating: 4.7, ratingCount: 2240 },
  { id: 'ml-m-4', title: 'Pulp Fiction', released: 1994, genres: 'Crime', avgRating: 4.6, ratingCount: 1854 },
  { id: 'ml-m-5', title: 'Forrest Gump', released: 1994, genres: 'Drama', avgRating: 4.6, ratingCount: 2076 },
  { id: 'ml-m-6', title: 'The Matrix', released: 1999, genres: 'Sci-Fi', avgRating: 4.5, ratingCount: 2042 },
  { id: 'ml-m-7', title: 'Inception', released: 2010, genres: 'Sci-Fi', avgRating: 4.5, ratingCount: 1987 },
  { id: 'ml-m-8', title: 'Fight Club', released: 1999, genres: 'Drama', avgRating: 4.5, ratingCount: 1820 },
  { id: 'ml-m-9', title: 'Goodfellas', released: 1990, genres: 'Crime', avgRating: 4.5, ratingCount: 1673 },
  { id: 'ml-m-10', title: "Schindler's List", released: 1993, genres: 'Drama', avgRating: 4.6, ratingCount: 1541 },
  { id: 'ml-m-11', title: 'The Lord of the Rings: The Fellowship of the Ring', released: 2001, genres: 'Fantasy', avgRating: 4.5, ratingCount: 2115 },
  { id: 'ml-m-12', title: 'The Lord of the Rings: The Return of the King', released: 2003, genres: 'Fantasy', avgRating: 4.5, ratingCount: 2089 },
  { id: 'ml-m-13', title: 'Star Wars: Episode IV', released: 1977, genres: 'Sci-Fi', avgRating: 4.5, ratingCount: 1978 },
  { id: 'ml-m-14', title: 'Interstellar', released: 2014, genres: 'Sci-Fi', avgRating: 4.4, ratingCount: 1743 },
  { id: 'ml-m-15', title: 'The Silence of the Lambs', released: 1991, genres: 'Thriller', avgRating: 4.4, ratingCount: 1502 },
  { id: 'ml-m-16', title: "Schindler's List", released: 1993, genres: 'Drama', avgRating: 4.6, ratingCount: 1431 },
  { id: 'ml-m-17', title: 'Se7en', released: 1995, genres: 'Thriller', avgRating: 4.4, ratingCount: 1647 },
  { id: 'ml-m-18', title: 'The Usual Suspects', released: 1995, genres: 'Crime', avgRating: 4.4, ratingCount: 1289 },
  { id: 'ml-m-19', title: 'Saving Private Ryan', released: 1998, genres: 'War', avgRating: 4.4, ratingCount: 1534 },
  { id: 'ml-m-20', title: 'Jurassic Park', released: 1993, genres: 'Adventure', avgRating: 4.3, ratingCount: 1876 },
  { id: 'ml-m-21', title: 'The Terminator', released: 1984, genres: 'Action', avgRating: 4.3, ratingCount: 1421 },
  { id: 'ml-m-22', title: 'Aliens', released: 1986, genres: 'Action', avgRating: 4.3, ratingCount: 1287 },
  { id: 'ml-m-23', title: 'Back to the Future', released: 1985, genres: 'Adventure', avgRating: 4.4, ratingCount: 1742 },
  { id: 'ml-m-24', title: 'The Lion King', released: 1994, genres: 'Animation', avgRating: 4.3, ratingCount: 1634 },
  { id: 'ml-m-25', title: 'Toy Story', released: 1995, genres: 'Animation', avgRating: 4.2, ratingCount: 1589 },
  { id: 'ml-m-26', title: 'Braveheart', released: 1995, genres: 'War', avgRating: 4.2, ratingCount: 1321 },
  { id: 'ml-m-27', title: 'Die Hard', released: 1988, genres: 'Action', avgRating: 4.2, ratingCount: 1456 },
  { id: 'ml-m-28', title: 'Blade Runner', released: 1982, genres: 'Sci-Fi', avgRating: 4.2, ratingCount: 1234 },
  { id: 'ml-m-29', title: 'E.T. the Extra-Terrestrial', released: 1982, genres: 'Adventure', avgRating: 4.1, ratingCount: 1398 },
  { id: 'ml-m-30', title: 'Raiders of the Lost Ark', released: 1981, genres: 'Adventure', avgRating: 4.3, ratingCount: 1487 },
  { id: 'ml-m-31', title: 'The Avengers', released: 2012, genres: 'Action', avgRating: 4.1, ratingCount: 1923 },
  { id: 'ml-m-32', title: 'Avatar', released: 2009, genres: 'Sci-Fi', avgRating: 3.9, ratingCount: 1987 },
  { id: 'ml-m-33', title: 'Titanic', released: 1997, genres: 'Drama', avgRating: 4.0, ratingCount: 1845 },
  { id: 'ml-m-34', title: 'American Beauty', released: 1999, genres: 'Drama', avgRating: 4.3, ratingCount: 1156 },
  { id: 'ml-m-35', title: 'Memento', released: 2000, genres: 'Thriller', avgRating: 4.4, ratingCount: 1234 },
  { id: 'ml-m-36', title: 'Gladiator', released: 2000, genres: 'Action', avgRating: 4.2, ratingCount: 1534 },
  { id: 'ml-m-37', title: 'The Truman Show', released: 1998, genres: 'Drama', avgRating: 4.3, ratingCount: 1342 },
  { id: 'ml-m-38', title: 'Eternal Sunshine of the Spotless Mind', released: 2004, genres: 'Drama', avgRating: 4.3, ratingCount: 1098 },
  { id: 'ml-m-39', title: 'No Country for Old Men', released: 2007, genres: 'Crime', avgRating: 4.3, ratingCount: 1145 },
  { id: 'ml-m-40', title: 'The Departed', released: 2006, genres: 'Crime', avgRating: 4.4, ratingCount: 1378 },
  { id: 'ml-m-41', title: 'A Beautiful Mind', released: 2001, genres: 'Drama', avgRating: 4.2, ratingCount: 1256 },
  { id: 'ml-m-42', title: 'Cast Away', released: 2000, genres: 'Drama', avgRating: 4.1, ratingCount: 1187 },
  { id: 'ml-m-43', title: 'The Green Mile', released: 1999, genres: 'Drama', avgRating: 4.4, ratingCount: 1198 },
  { id: 'ml-m-44', title: 'Good Will Hunting', released: 1997, genres: 'Drama', avgRating: 4.4, ratingCount: 1267 },
  { id: 'ml-m-45', title: 'V for Vendetta', released: 2005, genres: 'Action', avgRating: 4.2, ratingCount: 1312 },
  { id: 'ml-m-46', title: 'The Prestige', released: 2006, genres: 'Drama', avgRating: 4.3, ratingCount: 1198 },
  { id: 'ml-m-47', title: 'District 9', released: 2009, genres: 'Sci-Fi', avgRating: 4.1, ratingCount: 1089 },
  { id: 'ml-m-48', title: '12 Angry Men', released: 1957, genres: 'Drama', avgRating: 4.6, ratingCount: 923 },
  { id: 'ml-m-49', title: 'Whiplash', released: 2014, genres: 'Drama', avgRating: 4.4, ratingCount: 1056 },
  { id: 'ml-m-50', title: 'Mad Max: Fury Road', released: 2015, genres: 'Action', avgRating: 4.2, ratingCount: 1345 },
  { id: 'ml-m-51', title: 'The Social Network', released: 2010, genres: 'Drama', avgRating: 4.2, ratingCount: 1134 },
  { id: 'ml-m-52', title: 'Parasite', released: 2019, genres: 'Thriller', avgRating: 4.5, ratingCount: 1298 },
  { id: 'ml-m-53', title: 'Joker', released: 2019, genres: 'Crime', avgRating: 4.3, ratingCount: 1456 },
  { id: 'ml-m-54', title: 'La La Land', released: 2016, genres: 'Drama', avgRating: 4.1, ratingCount: 1234 },
  { id: 'ml-m-55', title: 'Get Out', released: 2017, genres: 'Thriller', avgRating: 4.1, ratingCount: 1089 },
  { id: 'ml-m-56', title: 'Black Panther', released: 2018, genres: 'Action', avgRating: 4.0, ratingCount: 1567 },
  { id: 'ml-m-57', title: 'The Revenant', released: 2015, genres: 'Adventure', avgRating: 4.1, ratingCount: 1143 },
  { id: 'ml-m-58', title: 'Gone Girl', released: 2014, genres: 'Thriller', avgRating: 4.2, ratingCount: 1198 },
  { id: 'ml-m-59', title: '2001: A Space Odyssey', released: 1968, genres: 'Sci-Fi', avgRating: 4.3, ratingCount: 1089 },
  { id: 'ml-m-60', title: 'Apocalypse Now', released: 1979, genres: 'War', avgRating: 4.3, ratingCount: 987 },
]

interface GenreSeed {
  id: string
  name: string
}

const GENRE_SEEDS: GenreSeed[] = [
  { id: 'ml-g-drama', name: 'Drama' },
  { id: 'ml-g-crime', name: 'Crime' },
  { id: 'ml-g-action', name: 'Action' },
  { id: 'ml-g-scifi', name: 'Sci-Fi' },
  { id: 'ml-g-thriller', name: 'Thriller' },
  { id: 'ml-g-adventure', name: 'Adventure' },
  { id: 'ml-g-fantasy', name: 'Fantasy' },
  { id: 'ml-g-animation', name: 'Animation' },
  { id: 'ml-g-war', name: 'War' },
]

const GENRE_NAME_TO_ID: Record<string, string> = {
  Drama: 'ml-g-drama',
  Crime: 'ml-g-crime',
  Action: 'ml-g-action',
  'Sci-Fi': 'ml-g-scifi',
  Thriller: 'ml-g-thriller',
  Adventure: 'ml-g-adventure',
  Fantasy: 'ml-g-fantasy',
  Animation: 'ml-g-animation',
  War: 'ml-g-war',
}

const IN_GENRE_LINKS: GraphEdge[] = MOVIE_SEEDS.map((movie, idx) => ({
  id: `ml-ig-${idx + 1}`,
  source: movie.id,
  target: GENRE_NAME_TO_ID[movie.genres] ?? 'ml-g-drama',
  type: 'IN_GENRE',
  properties: {},
}))

export const MOVIELENS_SAMPLE: GraphData = {
  nodes: [
    ...MOVIE_SEEDS.map((movie) => ({
      id: movie.id,
      labels: [MOVIE_LABEL],
      label: MOVIE_LABEL,
      properties: {
        title: movie.title,
        released: movie.released,
        genres: movie.genres,
        avgRating: movie.avgRating,
        ratingCount: movie.ratingCount,
        _label: MOVIE_LABEL,
      },
    })),
    ...GENRE_SEEDS.map((genre) => ({
      id: genre.id,
      labels: [GENRE_LABEL],
      label: GENRE_LABEL,
      properties: {
        name: genre.name,
        _label: GENRE_LABEL,
      },
    })),
  ],
  links: IN_GENRE_LINKS,
}

function filterTopRatedMovies(data: GraphData): GraphData {
  return {
    nodes: data.nodes
      .filter((node) => node.labels.includes(MOVIE_LABEL) && (node.properties.avgRating as number) >= 4.5)
      .map(cloneNode),
    links: [],
  }
}

function filterActionMovies(data: GraphData): GraphData {
  const actionGenreNode = data.nodes.find(
    (node) => node.labels.includes(GENRE_LABEL) && node.properties.name === 'Action'
  )
  if (!actionGenreNode) return { nodes: [], links: [] }

  const links = data.links.filter(
    (link) => link.type === 'IN_GENRE' && toNodeId(link.target) === actionGenreNode.id
  )
  return buildSubgraph(data, links)
}

function filterMostRatedMovies(data: GraphData): GraphData {
  return {
    nodes: data.nodes
      .filter((node) => node.labels.includes(MOVIE_LABEL) && (node.properties.ratingCount as number) > 1000)
      .map(cloneNode),
    links: [],
  }
}

function filterDramaSciFiMovies(data: GraphData): GraphData {
  const targetGenres = new Set(['Drama', 'Sci-Fi'])
  const genreNodeIds = new Set(
    data.nodes
      .filter((node) => node.labels.includes(GENRE_LABEL) && targetGenres.has(node.properties.name as string))
      .map((node) => node.id)
  )
  const links = data.links.filter(
    (link) => link.type === 'IN_GENRE' && genreNodeIds.has(toNodeId(link.target))
  )
  return buildSubgraph(data, links)
}

export const MOVIELENS_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All movies and genres',
    description: 'Full MovieLens sample with all movies and genre connections',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: MOVIELENS_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'top-rated',
    label: 'Top-rated movies',
    description: 'Movies with average rating 4.5 or above',
    cypher: 'MATCH (m:Movie) WHERE m.avgRating >= 4.5 RETURN m',
    expectedResultCount: filterTopRatedMovies(MOVIELENS_SAMPLE).nodes.length,
    filterFn: (data) => filterTopRatedMovies(data),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [{ nameCol: 'title', propsCol: 'props', label: MOVIE_LABEL }],
    },
  },
  {
    key: 'genre-map',
    label: 'Movies by genre',
    description: 'Full genre network showing how movies connect to their categories',
    cypher:
      'MATCH (m:Movie)-[:IN_GENRE]->(g:Genre) RETURN m.title AS movie, g.name AS genre, PROPERTIES(m) AS movieProps, PROPERTIES(g) AS genreProps',
    expectedResultCount: MOVIELENS_SAMPLE.links.filter((link) => link.type === 'IN_GENRE').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['IN_GENRE']),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'movie', propsCol: 'movieProps', label: MOVIE_LABEL },
        { nameCol: 'genre', propsCol: 'genreProps', label: GENRE_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'movie', dstCol: 'genre', type: 'IN_GENRE' }],
    },
  },
  {
    key: 'action-movies',
    label: 'Action movie network',
    description: 'Movies in the Action genre with their genre connections',
    cypher: "MATCH (m:Movie)-[:IN_GENRE]->(g:Genre {name: 'Action'}) RETURN m, g",
    expectedResultCount: filterActionMovies(MOVIELENS_SAMPLE).nodes.length,
    filterFn: (data) => filterActionMovies(data),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'movie', propsCol: 'movieProps', label: MOVIE_LABEL },
        { nameCol: 'genre', propsCol: 'genreProps', label: GENRE_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'movie', dstCol: 'genre', type: 'IN_GENRE' }],
    },
  },
  {
    key: 'most-rated',
    label: 'Most popular movies',
    description: 'Movies with over 1000 ratings in the dataset',
    cypher: 'MATCH (m:Movie) WHERE m.ratingCount > 1000 RETURN m ORDER BY m.ratingCount DESC',
    expectedResultCount: filterMostRatedMovies(MOVIELENS_SAMPLE).nodes.length,
    filterFn: (data) => filterMostRatedMovies(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [{ nameCol: 'title', propsCol: 'props', label: MOVIE_LABEL }],
    },
  },
  {
    key: 'drama-scifi',
    label: 'Drama vs Sci-Fi',
    description: 'Movies in Drama or Sci-Fi genres for cross-category comparison',
    cypher:
      "MATCH (m:Movie)-[:IN_GENRE]->(g:Genre) WHERE g.name IN ['Drama', 'Sci-Fi'] RETURN m, g",
    expectedResultCount: filterDramaSciFiMovies(MOVIELENS_SAMPLE).nodes.length,
    filterFn: (data) => filterDramaSciFiMovies(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'movie', propsCol: 'movieProps', label: MOVIE_LABEL },
        { nameCol: 'genre', propsCol: 'genreProps', label: GENRE_LABEL },
      ],
      edgeDescriptors: [{ srcCol: 'movie', dstCol: 'genre', type: 'IN_GENRE' }],
    },
  },
]
