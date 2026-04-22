import { expect, test } from '@playwright/test'
import { writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// R6 feature-inventory + orphan guard.
//
// Walks /playground, enumerates every interactive element (data-testid, role,
// button, input, textarea, a[href]) — then cross-references against every
// other spec file under frontend/e2e/ to produce a coverage matrix.
//
// Writes:
//   /tmp/R6-inventory.json      — raw inventory
//   test-results/R6-inventory.json — raw inventory (in-tree copy)
//   test-results/R6-coverage-matrix.json — per-element → covering specs
//   /tmp/R6-orphans.json        — just the orphaned elements
//
// Asserts: every (data-testid) on /playground is referenced by at least one
// other spec file (or is explicitly allow-listed below because coverage lives
// via a role-based locator instead of a testid).

// Testids that are covered via role-based or text-based locators in other
// specs (verified manually) — NOT orphans.
const ROLE_COVERED_TESTIDS = new Set<string>([
  // covered by getByRole('button', { name: /Power mode/i }) in polish-cohesion + claims
  'power-mode-panel',
])

type InventoryItem = {
  kind: 'testid' | 'button' | 'tab' | 'input' | 'textarea' | 'link'
  testid: string | null
  role: string | null
  label: string
  tag: string
}

test('R6 — /playground interactive inventory + orphan guard', async ({ page }) => {
  await page.goto('/playground')
  await page.waitForLoadState('networkidle')
  // Open schema tab too so elements only rendered in that tab are counted.
  await page.getByRole('tab', { name: 'Schema' }).click()
  await page.waitForTimeout(300)
  // Toggle Power mode so the cypher editor testids show up in the inventory.
  await page.getByRole('button', { name: /Power mode/i }).click()
  await page.waitForTimeout(200)
  // Back to Graph tab for the canvas/status stuff.
  await page.getByRole('tab', { name: 'Graph' }).click()
  await page.waitForTimeout(200)

  const inventory: InventoryItem[] = await page.evaluate(() => {
    const items: Array<{
      kind: string
      testid: string | null
      role: string | null
      label: string
      tag: string
    }> = []
    const seen = new Set<string>()

    function push(item: (typeof items)[0]) {
      const key = `${item.kind}::${item.testid ?? ''}::${item.role ?? ''}::${item.label}::${item.tag}`
      if (seen.has(key)) return
      seen.add(key)
      items.push(item)
    }

    // (1) Every element with a data-testid.
    for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
      push({
        kind: 'testid',
        testid: el.getAttribute('data-testid'),
        role: el.getAttribute('role'),
        label:
          el.getAttribute('aria-label') ||
          (el as HTMLElement).innerText?.trim().slice(0, 60) ||
          '',
        tag: el.tagName.toLowerCase(),
      })
    }

    // (2) Every button (role=button or <button>).
    const buttonSelectors = 'button, [role="button"]'
    for (const el of Array.from(document.querySelectorAll(buttonSelectors))) {
      push({
        kind: 'button',
        testid: el.getAttribute('data-testid'),
        role: el.getAttribute('role') ?? 'button',
        label:
          el.getAttribute('aria-label') ||
          (el as HTMLElement).innerText?.trim().slice(0, 60) ||
          '',
        tag: el.tagName.toLowerCase(),
      })
    }

    // (3) Tabs.
    for (const el of Array.from(document.querySelectorAll('[role="tab"]'))) {
      push({
        kind: 'tab',
        testid: el.getAttribute('data-testid'),
        role: 'tab',
        label: el.getAttribute('aria-label') || (el as HTMLElement).innerText?.trim() || '',
        tag: el.tagName.toLowerCase(),
      })
    }

    // (4) Inputs / textareas / selects.
    for (const el of Array.from(document.querySelectorAll('input, textarea, select'))) {
      push({
        kind: el.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'input',
        testid: el.getAttribute('data-testid'),
        role: el.getAttribute('role'),
        label:
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('name') ||
          '',
        tag: el.tagName.toLowerCase(),
      })
    }

    // (5) Anchors with href — exclude the header 'Back' link (structural nav).
    for (const el of Array.from(document.querySelectorAll('a[href]'))) {
      const label = (el as HTMLElement).innerText?.trim() || el.getAttribute('aria-label') || ''
      if (/^back$/i.test(label)) continue
      push({
        kind: 'link',
        testid: el.getAttribute('data-testid'),
        role: el.getAttribute('role'),
        label: label.slice(0, 60),
        tag: 'a',
      })
    }

    return items as InventoryItem[]
  })

  // Write raw inventory.
  const outDir = 'test-results'
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'R6-inventory.json'), JSON.stringify(inventory, null, 2))
  writeFileSync('/tmp/R6-inventory.json', JSON.stringify(inventory, null, 2))

  // Load every other spec's source text, skipping the feature-inventory spec itself.
  const specsDir = join(process.cwd(), 'e2e')
  const specFiles = (readdirSync(specsDir, { recursive: true, encoding: 'utf8' }) as string[])
    .filter((f) => typeof f === 'string' && f.endsWith('.spec.ts'))
    .filter((f) => !f.endsWith('R6-feature-inventory.spec.ts'))
  const allSpecText = specFiles
    .map((f) => ({ f, text: readFileSync(join(specsDir, f), 'utf8') }))

  function specsReferencing(needle: string): string[] {
    return allSpecText.filter(({ text }) => text.includes(needle)).map((x) => x.f)
  }

  // Build coverage matrix (testid → specs that reference it).
  const testids = Array.from(
    new Set(
      inventory
        .filter((i) => i.testid)
        .map((i) => i.testid!)
        .filter(Boolean),
    ),
  )
  const coverage = testids.map((id) => {
    const matching = specsReferencing(id)
    const covered =
      matching.length > 0 || ROLE_COVERED_TESTIDS.has(id)
    return {
      testid: id,
      covered,
      coveredVia:
        matching.length > 0
          ? 'testid'
          : ROLE_COVERED_TESTIDS.has(id)
            ? 'role-or-text'
            : 'orphan',
      specs: matching,
    }
  })
  writeFileSync(join(outDir, 'R6-coverage-matrix.json'), JSON.stringify(coverage, null, 2))

  const orphans = coverage.filter((c) => !c.covered).map((c) => c.testid)
  writeFileSync('/tmp/R6-orphans.json', JSON.stringify(orphans, null, 2))

  // Also record role/text-only elements so the triage can see them.
  const roleOnly = inventory
    .filter((i) => !i.testid && i.label)
    .map((i) => ({ kind: i.kind, role: i.role, label: i.label }))
  writeFileSync('/tmp/R6-role-only.json', JSON.stringify(roleOnly, null, 2))

  expect(orphans, `orphan testids on /playground: ${orphans.join(', ')}`).toEqual([])
})
