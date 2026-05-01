import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'

export interface Triple {
  subject: string
  predicate: string
  object: string
}

export interface ParsedRDF {
  triples: Triple[]
  uniqueSubjects: number
  uniquePredicates: number
  uniqueObjects: number
  format: 'turtle' | 'ntriples' | 'nquads' | 'jsonld'
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDFS_SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'

function detectFormat(filename: string, text: string): ParsedRDF['format'] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.jsonld') || lower.endsWith('.json')) return 'jsonld'
  if (lower.endsWith('.nq')) return 'nquads'
  if (lower.endsWith('.nt')) return 'ntriples'
  if (lower.endsWith('.ttl') || lower.endsWith('.n3')) return 'turtle'
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'jsonld'
  return 'turtle'
}

export function parseRDFText(text: string, filename: string): ParsedRDF {
  const format = detectFormat(filename, text)
  let triples: Triple[] = []
  if (format === 'jsonld') {
    triples = parseJsonLd(text)
  } else if (format === 'ntriples' || format === 'nquads') {
    triples = parseNTriples(text)
  } else {
    triples = parseTurtle(text)
  }

  const subjects = new Set<string>()
  const predicates = new Set<string>()
  const objects = new Set<string>()
  for (const t of triples) {
    subjects.add(t.subject)
    predicates.add(t.predicate)
    objects.add(t.object)
  }

  return {
    triples,
    uniqueSubjects: subjects.size,
    uniquePredicates: predicates.size,
    uniqueObjects: objects.size,
    format,
  }
}

function stripComments(line: string): string {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inString = !inString
    if (ch === '#' && !inString) return line.slice(0, i)
  }
  return line
}

function parseNTriples(text: string): Triple[] {
  const triples: Triple[] = []
  const lines = text.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = stripComments(rawLine).trim()
    if (!line) continue
    const tokens = tokenize(line)
    if (tokens.length < 3) continue
    const [s, p, o] = tokens
    triples.push({
      subject: unwrap(s),
      predicate: unwrap(p),
      object: tokens.length > 3 && o ? unwrap(o) : unwrap(o ?? ''),
    })
  }
  return triples
}

function parseTurtle(text: string): Triple[] {
  const prefixes: Record<string, string> = {}
  const triples: Triple[] = []
  const lines = text.split(/\r?\n/)
  let currentSubject: string | null = null

  for (const rawLine of lines) {
    const line = stripComments(rawLine).trim()
    if (!line) continue

    const prefixMatch = /^@prefix\s+([\w-]*):\s*<([^>]+)>\s*\.?$/i.exec(line)
    if (prefixMatch) {
      prefixes[prefixMatch[1]] = prefixMatch[2]
      continue
    }
    const baseMatch = /^@base\s+<([^>]+)>\s*\.?$/i.exec(line)
    if (baseMatch) {
      prefixes[''] = baseMatch[1]
      continue
    }

    const endsWithDot = line.endsWith(' .') || line === '.'
    const endsWithSemi = line.endsWith(';')
    const endsWithComma = line.endsWith(',')
    const body = line.replace(/\s*[.;,]\s*$/, '').trim()
    if (!body) continue

    const tokens = tokenize(body)
    let s: string | null = currentSubject
    let p: string | null = null
    let rest: string[] = []

    if (endsWithComma && currentSubject && triples.length > 0) {
      p = triples[triples.length - 1].predicate
      rest = tokens
    } else if (endsWithSemi || (!endsWithDot && tokens.length >= 2 && currentSubject)) {
      if (tokens.length >= 2 && currentSubject && !looksLikeSubject(tokens[0], prefixes)) {
        p = expand(tokens[0], prefixes)
        rest = tokens.slice(1)
      } else if (tokens.length >= 2) {
        s = expand(tokens[0], prefixes)
        p = expand(tokens[1], prefixes)
        rest = tokens.slice(2)
      } else {
        continue
      }
    } else {
      if (tokens.length >= 3) {
        s = expand(tokens[0], prefixes)
        p = expand(tokens[1], prefixes)
        rest = tokens.slice(2)
      } else if (tokens.length === 2 && currentSubject) {
        p = expand(tokens[0], prefixes)
        rest = tokens.slice(1)
      } else {
        continue
      }
    }

    if (!s || !p) continue
    for (const obj of rest) {
      triples.push({
        subject: s,
        predicate: p,
        object: expand(obj, prefixes),
      })
    }
    currentSubject = s
    if (endsWithDot) currentSubject = null
  }

  return triples
}

function looksLikeSubject(token: string, prefixes: Record<string, string>): boolean {
  if (token.startsWith('<')) return true
  if (token.startsWith('_:')) return true
  if (/^[\w-]+:[\w-]+$/.test(token)) {
    const prefix = token.split(':')[0]
    return prefixes[prefix] !== undefined
  }
  return false
}

function tokenize(line: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if (ch === '<') {
      const end = line.indexOf('>', i)
      if (end === -1) break
      tokens.push(line.slice(i, end + 1))
      i = end + 1
      continue
    }
    if (ch === '"') {
      let end = i + 1
      while (end < line.length) {
        if (line[end] === '\\') {
          end += 2
          continue
        }
        if (line[end] === '"') break
        end++
      }
      const closeIdx = end
      let j = closeIdx + 1
      while (j < line.length && line[j] !== ' ' && line[j] !== '\t' && line[j] !== '.' && line[j] !== ';' && line[j] !== ',') {
        j++
      }
      tokens.push(line.slice(i, j))
      i = j
      continue
    }
    let end = i
    while (end < line.length && line[end] !== ' ' && line[end] !== '\t') end++
    const token = line.slice(i, end)
    if (token) tokens.push(token)
    i = end
  }
  return tokens
}

function unwrap(token: string): string {
  if (!token) return ''
  if (token.startsWith('<') && token.endsWith('>')) return token.slice(1, -1)
  if (token.startsWith('"')) return token
  if (token === 'a') return RDF_TYPE
  return token
}

function expand(token: string, prefixes: Record<string, string>): string {
  if (!token) return ''
  if (token === 'a') return RDF_TYPE
  if (token.startsWith('<') && token.endsWith('>')) return token.slice(1, -1)
  if (token.startsWith('"')) return token
  if (token.startsWith('_:')) return token
  const colonIdx = token.indexOf(':')
  if (colonIdx !== -1) {
    const prefix = token.slice(0, colonIdx)
    const local = token.slice(colonIdx + 1)
    const namespace = prefixes[prefix] ?? prefixes['']
    if (namespace) return `${namespace}${local}`
  }
  return token
}

function parseJsonLd(text: string): Triple[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const triples: Triple[] = []
  const items = Array.isArray(data) ? data : [data]
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const subject = toStringOrNull(obj['@id']) ?? `_:b${triples.length}`
    const types = obj['@type']
    if (types) {
      const list = Array.isArray(types) ? types : [types]
      for (const t of list) {
        const value = toStringOrNull(t)
        if (value) triples.push({ subject, predicate: RDF_TYPE, object: value })
      }
    }
    for (const [key, raw] of Object.entries(obj)) {
      if (key.startsWith('@')) continue
      const values = Array.isArray(raw) ? raw : [raw]
      for (const value of values) {
        const objectValue = jsonValueToObject(value)
        if (objectValue !== null) {
          triples.push({ subject, predicate: key, object: objectValue })
        }
      }
    }
  }
  return triples
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function jsonValueToObject(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return `"${String(value)}"`
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const id = toStringOrNull(obj['@id'])
    if (id) return id
    const lit = toStringOrNull(obj['@value'])
    if (lit) return `"${lit}"`
  }
  return null
}

export function triplesToGraphData(triples: Triple[]): GraphData {
  const nodes = new Map<string, GraphNode>()
  const links: GraphEdge[] = []
  let edgeCounter = 1

  const ensureNode = (iri: string): GraphNode => {
    let node = nodes.get(iri)
    if (node) return node
    node = {
      id: iri,
      labels: ['Resource'],
      properties: {
        _uri: iri,
        name: shortLocalName(iri),
      },
    }
    nodes.set(iri, node)
    return node
  }

  for (const { subject, predicate, object } of triples) {
    const subjectNode = ensureNode(subject)
    if (predicate === RDF_TYPE && !isLiteral(object)) {
      const labelName = shortLocalName(object)
      if (!subjectNode.labels.includes(labelName)) subjectNode.labels.unshift(labelName)
      subjectNode.properties._type = object
      continue
    }
    if (predicate === RDFS_LABEL && isLiteral(object)) {
      subjectNode.properties.name = stripLiteral(object)
      continue
    }
    if (predicate === RDFS_SUBCLASS && !isLiteral(object)) {
      const target = ensureNode(object)
      links.push({
        id: `e-${edgeCounter++}`,
        source: subjectNode.id,
        target: target.id,
        type: 'SUBCLASS_OF',
        properties: {},
      })
      continue
    }
    if (isLiteral(object)) {
      const localKey = shortLocalName(predicate)
      subjectNode.properties[localKey] = stripLiteral(object)
    } else {
      const targetNode = ensureNode(object)
      links.push({
        id: `e-${edgeCounter++}`,
        source: subjectNode.id,
        target: targetNode.id,
        type: shortLocalName(predicate).toUpperCase(),
        properties: {},
      })
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    links,
  }
}

function isLiteral(value: string): boolean {
  return value.startsWith('"')
}

function stripLiteral(value: string): string {
  if (!isLiteral(value)) return value
  const endQuote = value.lastIndexOf('"')
  if (endQuote <= 0) return value
  return value.slice(1, endQuote)
}

function shortLocalName(iri: string): string {
  if (iri.startsWith('"')) return stripLiteral(iri)
  if (iri.startsWith('_:')) return iri
  const hashIdx = iri.lastIndexOf('#')
  const slashIdx = iri.lastIndexOf('/')
  const idx = Math.max(hashIdx, slashIdx)
  if (idx >= 0 && idx < iri.length - 1) return iri.slice(idx + 1)
  return iri
}
