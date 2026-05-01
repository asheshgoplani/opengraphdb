// EVAL-FRONTEND-QUALITY-CYCLE3.md H-6 — minimal markdown → HTML renderer.
//
// We render markdown loaded via Vite's `?raw` import, so the source is
// build-time-known and shipped alongside the bundle. No user-supplied
// content ever reaches this function. That said, every text segment is
// HTML-escaped before being interpolated, so even a future change that
// renders user content does not introduce XSS through this surface.
//
// Supported syntax (chosen to cover what's actually used in the three
// `documentation/ai-integration/*.md` patterns):
//
//   - ATX headings: # / ## / ### / #### / #####
//   - Fenced code blocks: ```lang … ```
//   - Inline code: `code`
//   - Paragraphs (blank-line separated)
//   - Bullet lists: leading `- ` or `* `
//   - Ordered lists: leading `1. `, `2. ` … (renumbered to <ol>)
//   - Bold: **text**
//   - Italic: *text* / _text_
//   - Links: [text](url) — only http(s) and same-origin paths allowed
//   - Horizontal rule: --- on its own line
//
// Unsupported (not used by current docs): tables, blockquote nesting,
// task lists, footnotes, image embeds, raw HTML.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch)
}

/**
 * Returns true when the given URL is safe to render in an `<a href>`. We
 * only allow http(s) absolute URLs and same-origin paths starting with
 * `/` or `#`. Anything else (javascript:, data:, vbscript:, etc.) is
 * filtered to `#` so a malicious markdown file (or a future one with a
 * typo) cannot exfiltrate or execute.
 */
function isSafeUrl(url: string): boolean {
  if (url.startsWith('/') || url.startsWith('#')) return true
  if (/^https?:\/\//i.test(url)) return true
  return false
}

function applyInline(text: string): string {
  // Process inline tokens in order: code first (it shields the inside
  // from bold/italic/link transforms), then links, then bold, then italic.
  // We HTML-escape eagerly inside each token so the rest of the pipeline
  // does not re-escape what's already inside `<code>`.
  let working = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '`') {
      const close = text.indexOf('`', i + 1)
      if (close > i) {
        const inner = text.slice(i + 1, close)
        working += `<code>${escapeHtml(inner)}</code>`
        i = close + 1
        continue
      }
    }
    if (ch === '[') {
      const closeBracket = text.indexOf('](', i + 1)
      if (closeBracket > i) {
        const closeParen = text.indexOf(')', closeBracket + 2)
        if (closeParen > closeBracket) {
          const label = text.slice(i + 1, closeBracket)
          const url = text.slice(closeBracket + 2, closeParen)
          const safeUrl = isSafeUrl(url) ? url : '#'
          working += `<a href="${escapeHtml(safeUrl)}">${applyInline(label)}</a>`
          i = closeParen + 1
          continue
        }
      }
    }
    if (ch === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2)
      if (close > i) {
        const inner = text.slice(i + 2, close)
        working += `<strong>${applyInline(inner)}</strong>`
        i = close + 2
        continue
      }
    }
    if ((ch === '*' || ch === '_') && text[i + 1] !== ch) {
      const close = text.indexOf(ch, i + 1)
      if (close > i) {
        const inner = text.slice(i + 1, close)
        // Avoid eating `*` inside the middle of a word (`a*b*c` should
        // not italicize). Require whitespace or start before the opener.
        const before = i === 0 ? ' ' : text[i - 1] ?? ' '
        if (/\s|^|[(>]/.test(before)) {
          working += `<em>${applyInline(inner)}</em>`
          i = close + 1
          continue
        }
      }
    }
    working += ch ? escapeHtml(ch) : ''
    i += 1
  }
  return working
}

interface BlockHeading {
  type: 'heading'
  level: number
  text: string
}
interface BlockCode {
  type: 'code'
  lang: string
  body: string
}
interface BlockList {
  type: 'list'
  ordered: boolean
  items: string[]
}
interface BlockParagraph {
  type: 'paragraph'
  text: string
}
interface BlockHr {
  type: 'hr'
}

type Block = BlockHeading | BlockCode | BlockList | BlockParagraph | BlockHr

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const lineAt = (idx: number): string => lines[idx] ?? ''

  while (i < lines.length) {
    const line = lineAt(i)

    // Fenced code block.
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const body: string[] = []
      i += 1
      while (i < lines.length && !lineAt(i).startsWith('```')) {
        body.push(lineAt(i))
        i += 1
      }
      i += 1 // skip closing fence (or end-of-file)
      blocks.push({ type: 'code', lang, body: body.join('\n') })
      continue
    }

    // ATX heading.
    const headingMatch = /^(#{1,5})\s+(.*)$/.exec(line)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: (headingMatch[1] ?? '').length,
        text: (headingMatch[2] ?? '').trim(),
      })
      i += 1
      continue
    }

    // Horizontal rule.
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    // Bullet / ordered list. Consume contiguous list lines.
    const isBullet = /^[-*]\s+/.test(line)
    const isOrdered = /^\d+\.\s+/.test(line)
    if (isBullet || isOrdered) {
      const ordered = !isBullet
      const items: string[] = []
      while (i < lines.length) {
        const cur = lineAt(i)
        const m = ordered
          ? /^\d+\.\s+(.*)$/.exec(cur)
          : /^[-*]\s+(.*)$/.exec(cur)
        if (!m) break
        items.push(m[1] ?? '')
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // Blank line.
    if (line.trim() === '') {
      i += 1
      continue
    }

    // Paragraph: gather until blank or block boundary.
    const paragraph: string[] = [line]
    i += 1
    while (i < lines.length) {
      const cur = lineAt(i)
      if (
        cur.trim() === '' ||
        cur.startsWith('```') ||
        /^(#{1,5})\s+/.test(cur) ||
        /^-{3,}\s*$/.test(cur) ||
        /^[-*]\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur)
      ) {
        break
      }
      paragraph.push(cur)
      i += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
  }

  return blocks
}

export function renderMarkdown(source: string): string {
  const blocks = parseBlocks(source)
  const out: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const level = block.level
        out.push(`<h${level}>${applyInline(block.text)}</h${level}>`)
        break
      }
      case 'code': {
        const langClass = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : ''
        out.push(`<pre><code${langClass}>${escapeHtml(block.body)}</code></pre>`)
        break
      }
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul'
        const items = block.items.map((item) => `<li>${applyInline(item)}</li>`).join('')
        out.push(`<${tag}>${items}</${tag}>`)
        break
      }
      case 'paragraph':
        out.push(`<p>${applyInline(block.text)}</p>`)
        break
      case 'hr':
        out.push('<hr />')
        break
    }
  }
  return out.join('\n')
}
