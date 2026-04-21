import type { DatasetKey } from './datasets'

export interface DemoQuestion {
  id: string
  text: string
  dataset: DatasetKey
  category: 'popular' | 'explore' | 'insight'
}

export const DEMO_QUESTIONS: Record<DatasetKey, DemoQuestion[]> = {
  movielens: [
    { id: 'ml-top-rated', text: 'What are the highest rated movies?', dataset: 'movielens', category: 'popular' },
    { id: 'ml-sci-fi', text: 'Show me sci-fi movies and their genres', dataset: 'movielens', category: 'explore' },
    { id: 'ml-genre-connections', text: 'Which genres are most connected to each other?', dataset: 'movielens', category: 'insight' },
    { id: 'ml-popular-tags', text: 'What are the most popular movie tags?', dataset: 'movielens', category: 'explore' },
    { id: 'ml-comedy-drama', text: 'Find movies that are both comedy and drama', dataset: 'movielens', category: 'explore' },
    { id: 'ml-crime-thrillers', text: 'Show crime and thriller movies network', dataset: 'movielens', category: 'insight' },
  ],
  airroutes: [
    { id: 'ar-busiest', text: 'Which airports have the most connections?', dataset: 'airroutes', category: 'popular' },
    { id: 'ar-transatlantic', text: 'Show transatlantic routes between Europe and North America', dataset: 'airroutes', category: 'explore' },
    { id: 'ar-country-hubs', text: 'What are the major hub airports by country?', dataset: 'airroutes', category: 'insight' },
    { id: 'ar-shortest-path', text: 'Find routes between London and Tokyo', dataset: 'airroutes', category: 'explore' },
    { id: 'ar-asia-pacific', text: 'Show the Asia Pacific airport network', dataset: 'airroutes', category: 'explore' },
    { id: 'ar-middle-east', text: 'Which Middle East airports connect to Europe?', dataset: 'airroutes', category: 'insight' },
  ],
  got: [
    { id: 'got-most-connected', text: 'Who are the most connected characters?', dataset: 'got', category: 'popular' },
    { id: 'got-stark', text: 'Show all characters connected to the Starks', dataset: 'got', category: 'explore' },
    { id: 'got-houses', text: 'Which houses have the most interactions?', dataset: 'got', category: 'insight' },
    { id: 'got-bridges', text: 'Who are the bridge characters between major houses?', dataset: 'got', category: 'insight' },
    { id: 'got-strongest', text: 'What are the strongest character relationships?', dataset: 'got', category: 'explore' },
    { id: 'got-lannister', text: 'Show the Lannister family network', dataset: 'got', category: 'explore' },
  ],
  wikidata: [
    { id: 'wd-laureates', text: 'Show Nobel Prize laureates by category', dataset: 'wikidata', category: 'popular' },
    { id: 'wd-physics', text: 'Who won the Nobel Prize in Physics?', dataset: 'wikidata', category: 'explore' },
    { id: 'wd-countries', text: 'Which countries produced the most laureates?', dataset: 'wikidata', category: 'insight' },
    { id: 'wd-institutions', text: 'What institutions are connected to Nobel winners?', dataset: 'wikidata', category: 'explore' },
    { id: 'wd-multi-winner', text: 'Are there laureates who won multiple prizes?', dataset: 'wikidata', category: 'insight' },
    { id: 'wd-women', text: 'Show female Nobel Prize winners', dataset: 'wikidata', category: 'explore' },
  ],
  community: [
    { id: 'cg-dense', text: 'Show the full community graph', dataset: 'community', category: 'popular' },
    { id: 'cg-bridges', text: 'Which edges cross between clusters?', dataset: 'community', category: 'insight' },
    { id: 'cg-hubs', text: 'Find the most connected nodes per cluster', dataset: 'community', category: 'explore' },
  ],
}
