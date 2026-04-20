// Deterministic dev-embeddings for the MovieLens demo. NOT real HNSW vectors.
// Each dim is a named topic; values come from substring matches on title + genre.
// In production, this is replaced by real embeddings served via ogdb-vector's HNSW index.

export const TOPIC_DIMS = [
  'space',
  'crime',
  'love',
  'war',
  'robots',
  'magic',
  'dream',
  'hero',
  'time',
  'dark',
  'adventure',
  'mind',
  'family',
  'freedom',
  'future',
  'myth',
] as const

export type Topic = (typeof TOPIC_DIMS)[number]
export const EMBEDDING_DIM = TOPIC_DIMS.length

type TopicBias = Partial<Record<Topic, number>>

const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  space: ['space', 'star', 'galaxy', 'alien', 'interstellar', 'odyssey', 'planet', 'sci-fi', 'cosmos'],
  crime: ['crime', 'mafia', 'heist', 'gangster', 'thriller', 'godfather', 'goodfella', 'mob'],
  love: ['love', 'romance', 'titanic', 'la la', 'eternal sunshine', 'beautiful', 'sunshine'],
  war: ['war', 'soldier', 'saving private', 'apocalypse', 'braveheart', 'vendetta', 'battle'],
  robots: ['terminator', 'matrix', 'robot', 'blade runner', 'cyborg', 'machine', 'ai', 'android'],
  magic: ['magic', 'fantasy', 'lord of the rings', 'ring', 'wizard', 'prestige'],
  dream: ['inception', 'dream', 'eternal sunshine', 'memento', 'truman'],
  hero: ['hero', 'avenger', 'dark knight', 'black panther', 'batman', 'superhero', 'gladiator'],
  time: ['time', 'back to the future', 'interstellar', 'memento', 'groundhog'],
  dark: ['dark', 'joker', 'seven', 'se7en', 'silence', 'fight club', 'prestige', 'parasite', 'get out'],
  adventure: ['adventure', 'raiders', 'jurassic', 'revenant', 'lion king', 'toy story', 'e.t.'],
  mind: ['mind', 'memento', 'inception', 'eternal sunshine', 'beautiful mind', 'social network', 'whiplash'],
  family: ['family', 'lion king', 'toy story', 'forrest gump', 'cast away', 'green mile', 'titanic'],
  freedom: ['shawshank', 'redemption', 'vendetta', 'gladiator', 'braveheart', 'mad max', 'revenant'],
  future: ['future', 'matrix', 'blade runner', 'avatar', 'district 9', '2001', 'interstellar'],
  myth: ['godfather', 'lord of the rings', 'star wars', 'apocalypse', 'gladiator', 'braveheart', '2001'],
}

const GENRE_BIAS: Record<string, TopicBias> = {
  'Sci-Fi': { space: 0.6, robots: 0.4, future: 0.5, mind: 0.2 },
  Fantasy: { magic: 0.8, adventure: 0.4, myth: 0.4 },
  Action: { hero: 0.5, war: 0.2, adventure: 0.3 },
  Crime: { crime: 0.9, dark: 0.3 },
  Thriller: { dark: 0.6, crime: 0.3, mind: 0.2 },
  Drama: { love: 0.2, family: 0.3, mind: 0.2, freedom: 0.1 },
  War: { war: 0.9, freedom: 0.4, myth: 0.2 },
  Adventure: { adventure: 0.8, family: 0.2 },
  Animation: { family: 0.8, adventure: 0.4, magic: 0.2 },
}

function normalise(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0))
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

export function embed(text: string, genre?: string): number[] {
  const lowered = text.toLowerCase()
  const vec = new Array<number>(EMBEDDING_DIM).fill(0)

  TOPIC_DIMS.forEach((topic, idx) => {
    let score = 0
    for (const keyword of TOPIC_KEYWORDS[topic]) {
      if (lowered.includes(keyword)) {
        score += 1
      }
    }
    vec[idx] = score
  })

  if (genre && GENRE_BIAS[genre]) {
    const bias = GENRE_BIAS[genre]
    TOPIC_DIMS.forEach((topic, idx) => {
      if (bias[topic]) {
        vec[idx] += bias[topic] ?? 0
      }
    })
  }

  // Small non-zero floor so every movie has SOME embedding.
  let anyNonZero = false
  for (const v of vec) {
    if (v > 0) {
      anyNonZero = true
      break
    }
  }
  if (!anyNonZero) {
    // Seed from title-char hash so query-zero vectors don't all collide.
    let h = 0
    for (let i = 0; i < lowered.length; i += 1) h = (h * 31 + lowered.charCodeAt(i)) >>> 0
    vec[h % EMBEDDING_DIM] += 0.3
    vec[(h >>> 4) % EMBEDDING_DIM] += 0.2
  }

  return normalise(vec)
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    dot += a[i] * b[i]
  }
  return dot
}
