import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'

export type PlaygroundQueryKey = 'all' | 'movies-only' | 'actors-only' | 'acted-in' | 'directed'

const MOVIE_LABEL = 'Movie'
const PERSON_LABEL = 'Person'
const GENRE_LABEL = 'Genre'

function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    labels: [...node.labels],
    properties: { ...node.properties },
  }
}

function cloneGraphData(graphData: GraphData): GraphData {
  return {
    nodes: graphData.nodes.map(cloneNode),
    links: graphData.links.map((link) => ({
      ...link,
      properties: { ...link.properties },
    })),
  }
}

const BASE_NODES: GraphNode[] = [
  { id: 1, labels: [MOVIE_LABEL], properties: { title: 'The Matrix', released: 1999 }, label: MOVIE_LABEL },
  { id: 2, labels: [MOVIE_LABEL], properties: { title: 'The Matrix Reloaded', released: 2003 }, label: MOVIE_LABEL },
  { id: 3, labels: [MOVIE_LABEL], properties: { title: 'The Matrix Revolutions', released: 2003 }, label: MOVIE_LABEL },
  { id: 4, labels: [MOVIE_LABEL], properties: { title: 'Jerry Maguire', released: 1996 }, label: MOVIE_LABEL },
  { id: 5, labels: [MOVIE_LABEL], properties: { title: 'Top Gun', released: 1986 }, label: MOVIE_LABEL },
  { id: 6, labels: [MOVIE_LABEL], properties: { title: 'A Few Good Men', released: 1992 }, label: MOVIE_LABEL },
  { id: 7, labels: [PERSON_LABEL], properties: { name: 'Keanu Reeves', born: 1964 }, label: PERSON_LABEL },
  { id: 8, labels: [PERSON_LABEL], properties: { name: 'Laurence Fishburne', born: 1961 }, label: PERSON_LABEL },
  { id: 9, labels: [PERSON_LABEL], properties: { name: 'Carrie-Anne Moss', born: 1967 }, label: PERSON_LABEL },
  { id: 10, labels: [PERSON_LABEL], properties: { name: 'Lana Wachowski', born: 1965 }, label: PERSON_LABEL },
  { id: 11, labels: [PERSON_LABEL], properties: { name: 'Lilly Wachowski', born: 1967 }, label: PERSON_LABEL },
  { id: 12, labels: [PERSON_LABEL], properties: { name: 'Tom Cruise', born: 1962 }, label: PERSON_LABEL },
  { id: 13, labels: [PERSON_LABEL], properties: { name: 'Cuba Gooding Jr.', born: 1968 }, label: PERSON_LABEL },
  { id: 14, labels: [PERSON_LABEL], properties: { name: 'Cameron Crowe', born: 1957 }, label: PERSON_LABEL },
  { id: 15, labels: [PERSON_LABEL], properties: { name: 'Tom Hanks', born: 1956 }, label: PERSON_LABEL },
  { id: 16, labels: [PERSON_LABEL], properties: { name: 'Meg Ryan', born: 1961 }, label: PERSON_LABEL },
  { id: 17, labels: [PERSON_LABEL], properties: { name: 'Tony Scott', born: 1944 }, label: PERSON_LABEL },
  { id: 18, labels: [PERSON_LABEL], properties: { name: 'Rob Reiner', born: 1947 }, label: PERSON_LABEL },
]

const ADDITIONAL_MOVIES: GraphNode[] = [
  { id: 19, labels: [MOVIE_LABEL], properties: { title: 'The Godfather', released: 1972 }, label: MOVIE_LABEL },
  { id: 20, labels: [MOVIE_LABEL], properties: { title: 'The Godfather Part II', released: 1974 }, label: MOVIE_LABEL },
  { id: 21, labels: [MOVIE_LABEL], properties: { title: 'Pulp Fiction', released: 1994 }, label: MOVIE_LABEL },
  { id: 22, labels: [MOVIE_LABEL], properties: { title: 'The Dark Knight', released: 2008 }, label: MOVIE_LABEL },
  { id: 23, labels: [MOVIE_LABEL], properties: { title: 'Inception', released: 2010 }, label: MOVIE_LABEL },
  { id: 24, labels: [MOVIE_LABEL], properties: { title: 'Interstellar', released: 2014 }, label: MOVIE_LABEL },
  { id: 25, labels: [MOVIE_LABEL], properties: { title: 'The Shawshank Redemption', released: 1994 }, label: MOVIE_LABEL },
  { id: 26, labels: [MOVIE_LABEL], properties: { title: 'Forrest Gump', released: 1994 }, label: MOVIE_LABEL },
  { id: 27, labels: [MOVIE_LABEL], properties: { title: 'Jurassic Park', released: 1993 }, label: MOVIE_LABEL },
  { id: 28, labels: [MOVIE_LABEL], properties: { title: 'Titanic', released: 1997 }, label: MOVIE_LABEL },
  { id: 29, labels: [MOVIE_LABEL], properties: { title: "Schindler's List", released: 1993 }, label: MOVIE_LABEL },
  { id: 30, labels: [MOVIE_LABEL], properties: { title: 'Good Will Hunting', released: 1997 }, label: MOVIE_LABEL },
  { id: 31, labels: [MOVIE_LABEL], properties: { title: 'The Silence of the Lambs', released: 1991 }, label: MOVIE_LABEL },
  { id: 32, labels: [MOVIE_LABEL], properties: { title: 'Fight Club', released: 1999 }, label: MOVIE_LABEL },
  { id: 33, labels: [MOVIE_LABEL], properties: { title: 'Top Gun: Maverick', released: 2022 }, label: MOVIE_LABEL },
  { id: 34, labels: [MOVIE_LABEL], properties: { title: 'Saving Private Ryan', released: 1998 }, label: MOVIE_LABEL },
  { id: 35, labels: [MOVIE_LABEL], properties: { title: 'Gladiator', released: 2000 }, label: MOVIE_LABEL },
  { id: 36, labels: [MOVIE_LABEL], properties: { title: 'Cast Away', released: 2000 }, label: MOVIE_LABEL },
  { id: 73, labels: [MOVIE_LABEL], properties: { title: 'The Fellowship of the Ring', released: 2001 }, label: MOVIE_LABEL },
  { id: 74, labels: [MOVIE_LABEL], properties: { title: 'The Two Towers', released: 2002 }, label: MOVIE_LABEL },
  { id: 75, labels: [MOVIE_LABEL], properties: { title: 'The Return of the King', released: 2003 }, label: MOVIE_LABEL },
  { id: 76, labels: [MOVIE_LABEL], properties: { title: 'The Departed', released: 2006 }, label: MOVIE_LABEL },
  { id: 77, labels: [MOVIE_LABEL], properties: { title: 'The Wolf of Wall Street', released: 2013 }, label: MOVIE_LABEL },
  { id: 78, labels: [MOVIE_LABEL], properties: { title: 'The Irishman', released: 2019 }, label: MOVIE_LABEL },
  { id: 79, labels: [MOVIE_LABEL], properties: { title: 'Avatar', released: 2009 }, label: MOVIE_LABEL },
  { id: 80, labels: [MOVIE_LABEL], properties: { title: 'Avatar: The Way of Water', released: 2022 }, label: MOVIE_LABEL },
  { id: 81, labels: [MOVIE_LABEL], properties: { title: 'Star Wars: A New Hope', released: 1977 }, label: MOVIE_LABEL },
  { id: 82, labels: [MOVIE_LABEL], properties: { title: 'The Empire Strikes Back', released: 1980 }, label: MOVIE_LABEL },
  { id: 83, labels: [MOVIE_LABEL], properties: { title: 'Return of the Jedi', released: 1983 }, label: MOVIE_LABEL },
  { id: 84, labels: [MOVIE_LABEL], properties: { title: 'The Force Awakens', released: 2015 }, label: MOVIE_LABEL },
  { id: 85, labels: [MOVIE_LABEL], properties: { title: 'Iron Man', released: 2008 }, label: MOVIE_LABEL },
  { id: 86, labels: [MOVIE_LABEL], properties: { title: 'The Avengers', released: 2012 }, label: MOVIE_LABEL },
  {
    id: 87,
    labels: [MOVIE_LABEL],
    properties: { title: 'Captain America: Civil War', released: 2016 },
    label: MOVIE_LABEL,
  },
  { id: 88, labels: [MOVIE_LABEL], properties: { title: 'Black Panther', released: 2018 }, label: MOVIE_LABEL },
  { id: 89, labels: [MOVIE_LABEL], properties: { title: 'Dune', released: 2021 }, label: MOVIE_LABEL },
  { id: 90, labels: [MOVIE_LABEL], properties: { title: 'Dune: Part Two', released: 2024 }, label: MOVIE_LABEL },
  { id: 91, labels: [MOVIE_LABEL], properties: { title: 'Mad Max: Fury Road', released: 2015 }, label: MOVIE_LABEL },
  { id: 92, labels: [MOVIE_LABEL], properties: { title: 'Oppenheimer', released: 2023 }, label: MOVIE_LABEL },
]

const GENRE_NODES: GraphNode[] = [
  { id: 37, labels: [GENRE_LABEL], properties: { name: 'Action' }, label: GENRE_LABEL },
  { id: 38, labels: [GENRE_LABEL], properties: { name: 'Drama' }, label: GENRE_LABEL },
  { id: 39, labels: [GENRE_LABEL], properties: { name: 'Thriller' }, label: GENRE_LABEL },
  { id: 40, labels: [GENRE_LABEL], properties: { name: 'Sci-Fi' }, label: GENRE_LABEL },
  { id: 41, labels: [GENRE_LABEL], properties: { name: 'Crime' }, label: GENRE_LABEL },
  { id: 42, labels: [GENRE_LABEL], properties: { name: 'Comedy' }, label: GENRE_LABEL },
  { id: 43, labels: [GENRE_LABEL], properties: { name: 'Romance' }, label: GENRE_LABEL },
  { id: 44, labels: [GENRE_LABEL], properties: { name: 'War' }, label: GENRE_LABEL },
]

const ADDITIONAL_PEOPLE: GraphNode[] = [
  { id: 45, labels: [PERSON_LABEL], properties: { name: 'Leonardo DiCaprio', born: 1974 }, label: PERSON_LABEL },
  { id: 46, labels: [PERSON_LABEL], properties: { name: 'Matt Damon', born: 1970 }, label: PERSON_LABEL },
  { id: 47, labels: [PERSON_LABEL], properties: { name: 'Morgan Freeman', born: 1937 }, label: PERSON_LABEL },
  { id: 48, labels: [PERSON_LABEL], properties: { name: 'Tim Robbins', born: 1958 }, label: PERSON_LABEL },
  { id: 49, labels: [PERSON_LABEL], properties: { name: 'Brad Pitt', born: 1963 }, label: PERSON_LABEL },
  { id: 50, labels: [PERSON_LABEL], properties: { name: 'Jodie Foster', born: 1962 }, label: PERSON_LABEL },
  { id: 51, labels: [PERSON_LABEL], properties: { name: 'Anthony Hopkins', born: 1937 }, label: PERSON_LABEL },
  { id: 52, labels: [PERSON_LABEL], properties: { name: 'Jeff Goldblum', born: 1952 }, label: PERSON_LABEL },
  { id: 53, labels: [PERSON_LABEL], properties: { name: 'Sam Neill', born: 1947 }, label: PERSON_LABEL },
  { id: 54, labels: [PERSON_LABEL], properties: { name: 'Robert De Niro', born: 1943 }, label: PERSON_LABEL },
  { id: 55, labels: [PERSON_LABEL], properties: { name: 'Al Pacino', born: 1940 }, label: PERSON_LABEL },
  { id: 56, labels: [PERSON_LABEL], properties: { name: 'Marlon Brando', born: 1924 }, label: PERSON_LABEL },
  { id: 57, labels: [PERSON_LABEL], properties: { name: 'Edward Norton', born: 1969 }, label: PERSON_LABEL },
  { id: 58, labels: [PERSON_LABEL], properties: { name: 'Russell Crowe', born: 1964 }, label: PERSON_LABEL },
  { id: 59, labels: [PERSON_LABEL], properties: { name: 'Francis Ford Coppola', born: 1939 }, label: PERSON_LABEL },
  { id: 60, labels: [PERSON_LABEL], properties: { name: 'Quentin Tarantino', born: 1963 }, label: PERSON_LABEL },
  { id: 61, labels: [PERSON_LABEL], properties: { name: 'Christopher Nolan', born: 1970 }, label: PERSON_LABEL },
  { id: 62, labels: [PERSON_LABEL], properties: { name: 'Robert Zemeckis', born: 1952 }, label: PERSON_LABEL },
  { id: 63, labels: [PERSON_LABEL], properties: { name: 'Frank Darabont', born: 1959 }, label: PERSON_LABEL },
  { id: 64, labels: [PERSON_LABEL], properties: { name: 'Steven Spielberg', born: 1946 }, label: PERSON_LABEL },
  { id: 65, labels: [PERSON_LABEL], properties: { name: 'James Cameron', born: 1954 }, label: PERSON_LABEL },
  { id: 66, labels: [PERSON_LABEL], properties: { name: 'Gus Van Sant', born: 1952 }, label: PERSON_LABEL },
  { id: 67, labels: [PERSON_LABEL], properties: { name: 'Jonathan Demme', born: 1944 }, label: PERSON_LABEL },
  { id: 68, labels: [PERSON_LABEL], properties: { name: 'David Fincher', born: 1962 }, label: PERSON_LABEL },
  { id: 69, labels: [PERSON_LABEL], properties: { name: 'Peter Jackson', born: 1961 }, label: PERSON_LABEL },
  { id: 70, labels: [PERSON_LABEL], properties: { name: 'Martin Scorsese', born: 1942 }, label: PERSON_LABEL },
  { id: 71, labels: [PERSON_LABEL], properties: { name: 'Ridley Scott', born: 1937 }, label: PERSON_LABEL },
  { id: 72, labels: [PERSON_LABEL], properties: { name: 'Liam Neeson', born: 1952 }, label: PERSON_LABEL },
  { id: 93, labels: [PERSON_LABEL], properties: { name: 'Elijah Wood', born: 1981 }, label: PERSON_LABEL },
  { id: 94, labels: [PERSON_LABEL], properties: { name: 'Ian McKellen', born: 1939 }, label: PERSON_LABEL },
  { id: 95, labels: [PERSON_LABEL], properties: { name: 'Viggo Mortensen', born: 1958 }, label: PERSON_LABEL },
  { id: 96, labels: [PERSON_LABEL], properties: { name: 'Orlando Bloom', born: 1977 }, label: PERSON_LABEL },
  { id: 97, labels: [PERSON_LABEL], properties: { name: 'Mark Hamill', born: 1951 }, label: PERSON_LABEL },
  { id: 98, labels: [PERSON_LABEL], properties: { name: 'Harrison Ford', born: 1942 }, label: PERSON_LABEL },
  { id: 99, labels: [PERSON_LABEL], properties: { name: 'Carrie Fisher', born: 1956 }, label: PERSON_LABEL },
  { id: 100, labels: [PERSON_LABEL], properties: { name: 'Daisy Ridley', born: 1992 }, label: PERSON_LABEL },
  { id: 101, labels: [PERSON_LABEL], properties: { name: 'Adam Driver', born: 1983 }, label: PERSON_LABEL },
  { id: 102, labels: [PERSON_LABEL], properties: { name: 'Robert Downey Jr.', born: 1965 }, label: PERSON_LABEL },
  { id: 103, labels: [PERSON_LABEL], properties: { name: 'Chris Evans', born: 1981 }, label: PERSON_LABEL },
  { id: 104, labels: [PERSON_LABEL], properties: { name: 'Chadwick Boseman', born: 1976 }, label: PERSON_LABEL },
  { id: 105, labels: [PERSON_LABEL], properties: { name: 'Zendaya', born: 1996 }, label: PERSON_LABEL },
  { id: 106, labels: [PERSON_LABEL], properties: { name: 'Timothee Chalamet', born: 1995 }, label: PERSON_LABEL },
  { id: 107, labels: [PERSON_LABEL], properties: { name: 'Florence Pugh', born: 1996 }, label: PERSON_LABEL },
  { id: 108, labels: [PERSON_LABEL], properties: { name: 'Cillian Murphy', born: 1976 }, label: PERSON_LABEL },
  { id: 109, labels: [PERSON_LABEL], properties: { name: 'Emily Blunt', born: 1983 }, label: PERSON_LABEL },
  { id: 110, labels: [PERSON_LABEL], properties: { name: 'George Miller', born: 1945 }, label: PERSON_LABEL },
  { id: 111, labels: [PERSON_LABEL], properties: { name: 'Denis Villeneuve', born: 1967 }, label: PERSON_LABEL },
  { id: 112, labels: [PERSON_LABEL], properties: { name: 'Ryan Gosling', born: 1980 }, label: PERSON_LABEL },
  { id: 113, labels: [PERSON_LABEL], properties: { name: 'Margot Robbie', born: 1990 }, label: PERSON_LABEL },
  { id: 114, labels: [PERSON_LABEL], properties: { name: 'Matthew McConaughey', born: 1969 }, label: PERSON_LABEL },
  { id: 115, labels: [PERSON_LABEL], properties: { name: 'Anne Hathaway', born: 1982 }, label: PERSON_LABEL },
  { id: 116, labels: [PERSON_LABEL], properties: { name: 'Ben Affleck', born: 1972 }, label: PERSON_LABEL },
  { id: 117, labels: [PERSON_LABEL], properties: { name: 'Robin Williams', born: 1951 }, label: PERSON_LABEL },
  { id: 118, labels: [PERSON_LABEL], properties: { name: 'Uma Thurman', born: 1970 }, label: PERSON_LABEL },
  { id: 119, labels: [PERSON_LABEL], properties: { name: 'Samuel L. Jackson', born: 1948 }, label: PERSON_LABEL },
  { id: 120, labels: [PERSON_LABEL], properties: { name: 'John Travolta', born: 1954 }, label: PERSON_LABEL },
]

const BASE_LINKS: GraphEdge[] = [
  { id: 1, source: 7, target: 1, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
  { id: 2, source: 7, target: 2, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
  { id: 3, source: 7, target: 3, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
  { id: 4, source: 8, target: 1, type: 'ACTED_IN', properties: { roles: ['Morpheus'] } },
  { id: 5, source: 8, target: 2, type: 'ACTED_IN', properties: { roles: ['Morpheus'] } },
  { id: 6, source: 8, target: 3, type: 'ACTED_IN', properties: { roles: ['Morpheus'] } },
  { id: 7, source: 9, target: 1, type: 'ACTED_IN', properties: { roles: ['Trinity'] } },
  { id: 8, source: 9, target: 2, type: 'ACTED_IN', properties: { roles: ['Trinity'] } },
  { id: 9, source: 9, target: 3, type: 'ACTED_IN', properties: { roles: ['Trinity'] } },
  { id: 10, source: 12, target: 4, type: 'ACTED_IN', properties: { roles: ['Jerry Maguire'] } },
  { id: 11, source: 13, target: 4, type: 'ACTED_IN', properties: { roles: ['Rod Tidwell'] } },
  { id: 12, source: 12, target: 5, type: 'ACTED_IN', properties: { roles: ['Pete Mitchell'] } },
  { id: 13, source: 12, target: 6, type: 'ACTED_IN', properties: { roles: ['Lt. Daniel Kaffee'] } },
  { id: 14, source: 10, target: 1, type: 'DIRECTED', properties: {} },
  { id: 15, source: 10, target: 2, type: 'DIRECTED', properties: {} },
  { id: 16, source: 10, target: 3, type: 'DIRECTED', properties: {} },
  { id: 17, source: 11, target: 1, type: 'DIRECTED', properties: {} },
  { id: 18, source: 11, target: 2, type: 'DIRECTED', properties: {} },
  { id: 19, source: 11, target: 3, type: 'DIRECTED', properties: {} },
  { id: 20, source: 14, target: 4, type: 'DIRECTED', properties: {} },
  { id: 21, source: 17, target: 5, type: 'DIRECTED', properties: {} },
  { id: 22, source: 18, target: 6, type: 'DIRECTED', properties: {} },
  { id: 23, source: 10, target: 1, type: 'WROTE', properties: {} },
  { id: 24, source: 10, target: 2, type: 'WROTE', properties: {} },
  { id: 25, source: 10, target: 3, type: 'WROTE', properties: {} },
  { id: 26, source: 11, target: 1, type: 'WROTE', properties: {} },
  { id: 27, source: 11, target: 2, type: 'WROTE', properties: {} },
  { id: 28, source: 11, target: 3, type: 'WROTE', properties: {} },
  { id: 29, source: 14, target: 4, type: 'WROTE', properties: {} },
  { id: 30, source: 17, target: 5, type: 'WROTE', properties: {} },
  { id: 31, source: 18, target: 6, type: 'WROTE', properties: {} },
]

interface MovieRelationshipSeed {
  movieId: number
  actors: number[]
  director: number
  writer?: number
  genres: number[]
}

const MOVIE_RELATIONSHIPS: MovieRelationshipSeed[] = [
  { movieId: 19, actors: [55, 56], director: 59, writer: 59, genres: [38, 41] },
  { movieId: 20, actors: [55, 54], director: 59, writer: 59, genres: [38, 41] },
  { movieId: 21, actors: [118, 119, 120], director: 60, writer: 60, genres: [41, 39] },
  { movieId: 22, actors: [49, 57], director: 61, writer: 61, genres: [37, 39] },
  { movieId: 23, actors: [45, 49], director: 61, writer: 61, genres: [37, 40, 39] },
  { movieId: 24, actors: [114, 115], director: 61, writer: 61, genres: [38, 40] },
  { movieId: 25, actors: [47, 48], director: 63, writer: 63, genres: [38] },
  { movieId: 26, actors: [15, 117], director: 62, writer: 62, genres: [38, 42, 43] },
  { movieId: 27, actors: [52, 53], director: 64, writer: 64, genres: [37, 40] },
  { movieId: 28, actors: [45, 113], director: 65, writer: 65, genres: [38, 43] },
  { movieId: 29, actors: [72], director: 64, writer: 64, genres: [38, 44] },
  { movieId: 30, actors: [46, 117, 116], director: 66, writer: 46, genres: [38] },
  { movieId: 31, actors: [50, 51], director: 67, writer: 67, genres: [39, 41] },
  { movieId: 32, actors: [49, 57], director: 68, writer: 68, genres: [39, 38] },
  { movieId: 33, actors: [12, 112], director: 71, writer: 71, genres: [37] },
  { movieId: 34, actors: [15, 46], director: 64, writer: 64, genres: [44, 38] },
  { movieId: 35, actors: [58, 72], director: 71, writer: 71, genres: [37, 38] },
  { movieId: 36, actors: [15, 113], director: 62, writer: 62, genres: [38, 42] },
  { movieId: 73, actors: [93, 94, 95, 96], director: 69, writer: 69, genres: [37, 38] },
  { movieId: 74, actors: [93, 94, 95, 96], director: 69, writer: 69, genres: [37, 38] },
  { movieId: 75, actors: [93, 94, 95, 96], director: 69, writer: 69, genres: [37, 38] },
  { movieId: 76, actors: [45, 54, 55], director: 70, writer: 70, genres: [41, 39] },
  { movieId: 77, actors: [45, 113, 112], director: 70, writer: 70, genres: [41, 38] },
  { movieId: 78, actors: [54, 55], director: 70, writer: 70, genres: [41, 38] },
  { movieId: 79, actors: [113, 114], director: 65, writer: 65, genres: [37, 40] },
  { movieId: 80, actors: [113, 114], director: 65, writer: 65, genres: [37, 40] },
  { movieId: 81, actors: [97, 98, 99], director: 69, writer: 69, genres: [37, 40] },
  { movieId: 82, actors: [97, 98, 99], director: 69, writer: 69, genres: [37, 40] },
  { movieId: 83, actors: [97, 98, 99], director: 69, writer: 69, genres: [37, 40] },
  { movieId: 84, actors: [100, 101, 98], director: 69, writer: 69, genres: [37, 40] },
  { movieId: 85, actors: [102, 103], director: 61, writer: 61, genres: [37, 40] },
  { movieId: 86, actors: [102, 103, 104], director: 61, writer: 61, genres: [37, 40] },
  { movieId: 87, actors: [103, 102, 104], director: 61, writer: 61, genres: [37, 38] },
  { movieId: 88, actors: [104, 103], director: 61, writer: 61, genres: [37, 38] },
  { movieId: 89, actors: [106, 105, 114], director: 111, writer: 111, genres: [40, 38] },
  { movieId: 90, actors: [106, 105, 107], director: 111, writer: 111, genres: [40, 38] },
  { movieId: 91, actors: [112, 113], director: 110, writer: 110, genres: [37, 39] },
  { movieId: 92, actors: [108, 109, 102], director: 61, writer: 61, genres: [38, 39] },
]

function buildAdditionalLinks(startId: number): GraphEdge[] {
  let linkId = startId
  const links: GraphEdge[] = []

  for (const { movieId, actors, director, writer, genres } of MOVIE_RELATIONSHIPS) {
    for (const actorId of actors) {
      links.push({
        id: linkId,
        source: actorId,
        target: movieId,
        type: 'ACTED_IN',
        properties: { roles: ['Performer'] },
      })
      linkId += 1
    }

    links.push({
      id: linkId,
      source: director,
      target: movieId,
      type: 'DIRECTED',
      properties: {},
    })
    linkId += 1

    links.push({
      id: linkId,
      source: writer ?? director,
      target: movieId,
      type: 'WROTE',
      properties: {},
    })
    linkId += 1

    for (const genreId of genres) {
      links.push({
        id: linkId,
        source: movieId,
        target: genreId,
        type: 'IN_GENRE',
        properties: {},
      })
      linkId += 1
    }
  }

  return links
}

const ADDITIONAL_LINKS = buildAdditionalLinks(32)

export const MOVIES_SAMPLE: GraphData = {
  nodes: [...BASE_NODES, ...ADDITIONAL_MOVIES, ...GENRE_NODES, ...ADDITIONAL_PEOPLE],
  links: [...BASE_LINKS, ...ADDITIONAL_LINKS],
}

function filterByRelationshipType(type: string): GraphData {
  const filteredLinks = MOVIES_SAMPLE.links.filter((link) => link.type === type)
  const referencedNodeIds = new Set<string | number>()

  for (const link of filteredLinks) {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target
    referencedNodeIds.add(sourceId)
    referencedNodeIds.add(targetId)
  }

  return {
    nodes: MOVIES_SAMPLE.nodes
      .filter((node) => referencedNodeIds.has(node.id))
      .map(cloneNode),
    links: filteredLinks.map((link) => ({
      ...link,
      properties: { ...link.properties },
    })),
  }
}

export function runPlaygroundQuery(key: PlaygroundQueryKey): GraphData {
  switch (key) {
    case 'all':
      return cloneGraphData(MOVIES_SAMPLE)
    case 'movies-only':
      return {
        nodes: MOVIES_SAMPLE.nodes.filter((n) => n.labels.includes(MOVIE_LABEL)).map(cloneNode),
        links: [],
      }
    case 'actors-only':
      return {
        nodes: MOVIES_SAMPLE.nodes.filter((n) => n.labels.includes(PERSON_LABEL)).map(cloneNode),
        links: [],
      }
    case 'acted-in':
      return filterByRelationshipType('ACTED_IN')
    case 'directed':
      return filterByRelationshipType('DIRECTED')
    default:
      return cloneGraphData(MOVIES_SAMPLE)
  }
}
