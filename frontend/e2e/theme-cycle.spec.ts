/**
 * theme-cycle.spec.ts — C17 coverage gap H7: 3-state theme cycle e2e.
 *
 * COVERAGE-AUDIT.md (H7, UC22, SB28) flagged that the existing theme e2e
 * (`no-token-leaks.spec.ts`) only flips `light` ↔ `dark` by toggling the
 * `<html>` class directly — it never goes through `useSettingsStore`,
 * `getNextTheme`, or `ThemeProvider`. The `system` branch (the default for
 * fresh users) is silently breakable: if `resolveTheme` regressed or
 * `THEME_ORDER` got reshuffled, no test would catch it.
 *
 * The user-visible contract being pinned here:
 *   1. Cycle order is exactly  system → light → dark → system  (per
 *      `theme-utils.ts` `THEME_ORDER`). A regression that flipped the order
 *      to system→dark→light would break the title-attribute affordance and
 *      any downstream a11y wiring.
 *   2. `theme: 'system'` resolves through `prefers-color-scheme` — set the
 *      OS to dark and `<html>` gets the `dark` class; set it to light and
 *      `<html>` gets the `light` class. The branch that translates
 *      preference → class lives in `ThemeProvider`'s media-query effect
 *      and was previously untested e2e.
 *   3. `theme: 'light' | 'dark'` is honoured verbatim regardless of OS
 *      preference (the explicit override path).
 *
 * Why localStorage seeding instead of clicking a button:
 *   `ThemeToggle` is mounted in `Header.tsx` → `AppShell` → `App.tsx` only.
 *   The dev/app builds (`AppRouter`, `AppShellRouter`) don't wrap routes in
 *   `AppShell`, so there's no clickable toggle on `/`, `/playground`,
 *   `/claims`, or `/docs/:slug`. The only way to drive `useSettingsStore`
 *   from these pages is to seed the persisted blob (the same blob the
 *   `setTheme` action writes) and reload — which exercises the exact same
 *   integration path: store → ThemeProvider effect → documentElement class.
 */
import { expect, test, type Page } from '@playwright/test'

type ThemePref = 'system' | 'light' | 'dark'

async function seedTheme(page: Page, theme: ThemePref): Promise<void> {
  await page.addInitScript((t) => {
    window.localStorage.setItem(
      'ogdb-settings',
      JSON.stringify({ state: { theme: t }, version: 1 }),
    )
  }, theme)
}

async function readHtmlClass(page: Page): Promise<string> {
  return await page.evaluate(() => document.documentElement.className)
}

test.describe('H7 · theme 3-state cycle (system → light → dark → system)', () => {
  test('cycle order is system → light → dark → system per getNextTheme', async ({
    page,
  }) => {
    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')

    // Pull the cycle function the ThemeToggle calls and walk the 3 hops.
    // Vite serves source modules at /src/<path> in dev — this is the same
    // module the ThemeToggle imports, so any regression to THEME_ORDER is
    // caught here without us reimplementing the order in the test.
    // The string-variable indirection on `import()` is intentional: TypeScript
    // refuses to resolve a Vite dev-server URL from Node, so we dodge module
    // resolution while keeping the runtime call identical.
    const order = await page.evaluate(async () => {
      const url = '/src/components/layout/theme-utils.ts'
      const mod = (await import(/* @vite-ignore */ url)) as {
        getNextTheme: (t: 'system' | 'light' | 'dark') => 'system' | 'light' | 'dark'
      }
      return [
        mod.getNextTheme('system'),
        mod.getNextTheme('light'),
        mod.getNextTheme('dark'),
      ]
    })

    expect(
      order,
      'cycle must hop system → light → dark → system; any other order would surprise users who learned the title-attribute affordance',
    ).toEqual(['light', 'dark', 'system'])
  })

  test('theme=system resolves to OS preference (dark) via ThemeProvider', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await seedTheme(page, 'system')

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const htmlClass = await readHtmlClass(page)
    expect(
      htmlClass,
      'theme=system + prefers-color-scheme=dark must apply the dark class — this is the branch ThemeProvider`s matchMedia listener owns',
    ).toContain('dark')
    expect(htmlClass).not.toContain('light')
  })

  test('theme=system resolves to OS preference (light) via ThemeProvider', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await seedTheme(page, 'system')

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const htmlClass = await readHtmlClass(page)
    expect(
      htmlClass,
      'theme=system + prefers-color-scheme=light must apply the light class',
    ).toContain('light')
    expect(htmlClass).not.toContain('dark')
  })

  test('theme=light overrides OS dark preference (explicit user choice wins)', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await seedTheme(page, 'light')

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const htmlClass = await readHtmlClass(page)
    expect(
      htmlClass,
      'theme=light must apply light even when OS prefers dark — this is the override branch',
    ).toContain('light')
    expect(htmlClass).not.toContain('dark')
  })

  test('theme=dark overrides OS light preference (explicit user choice wins)', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await seedTheme(page, 'dark')

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const htmlClass = await readHtmlClass(page)
    expect(htmlClass).toContain('dark')
    expect(htmlClass).not.toContain('light')
  })

  test('full 3-state cycle: system → light → dark → system updates html class on each hop', async ({
    page,
  }) => {
    // Pin the OS preference to dark so the 'system' state is visibly distinct
    // from the 'light' state (otherwise system-resolves-to-light and the
    // light-override hop would both leave html.classList === 'light' and we
    // couldn't tell whether the cycle moved).
    await page.emulateMedia({ colorScheme: 'dark' })
    await seedTheme(page, 'system')

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    // Step 0: system + OS=dark → html should have 'dark'
    await expect
      .poll(() => readHtmlClass(page))
      .toContain('dark')
    expect(await readHtmlClass(page)).not.toContain('light')

    // Drive the cycle the same way ThemeToggle does — call setTheme via the
    // exported store. We dynamically import the store module so we hit the
    // exact singleton ThemeProvider subscribed to.
    const advance = async () => {
      await page.evaluate(async () => {
        const settingsUrl = '/src/stores/settings.ts'
        const themeUtilsUrl = '/src/components/layout/theme-utils.ts'
        const [settings, themeUtils] = await Promise.all([
          import(/* @vite-ignore */ settingsUrl) as Promise<{
            useSettingsStore: {
              getState: () => {
                theme: 'system' | 'light' | 'dark'
                setTheme: (t: 'system' | 'light' | 'dark') => void
              }
            }
          }>,
          import(/* @vite-ignore */ themeUtilsUrl) as Promise<{
            getNextTheme: (t: 'system' | 'light' | 'dark') => 'system' | 'light' | 'dark'
          }>,
        ])
        const current = settings.useSettingsStore.getState().theme
        settings.useSettingsStore
          .getState()
          .setTheme(themeUtils.getNextTheme(current))
      })
    }

    // Hop 1: system → light
    await advance()
    await expect
      .poll(() => readHtmlClass(page), { timeout: 2000 })
      .toMatch(/(^|\s)light(\s|$)/)
    expect(await readHtmlClass(page)).not.toContain('dark')

    // Hop 2: light → dark
    await advance()
    await expect
      .poll(() => readHtmlClass(page), { timeout: 2000 })
      .toMatch(/(^|\s)dark(\s|$)/)
    expect(await readHtmlClass(page)).not.toContain('light')

    // Hop 3: dark → system (and OS still dark, so html should remain 'dark'
    // but the persisted theme must be 'system' — that's how we tell hop 3
    // landed correctly without conflating it with hop 2).
    await advance()
    const persistedTheme = await page.evaluate(() => {
      const raw = window.localStorage.getItem('ogdb-settings')
      if (!raw) return null
      try {
        return (JSON.parse(raw) as { state?: { theme?: string } }).state?.theme ?? null
      } catch {
        return null
      }
    })
    expect(
      persistedTheme,
      'after 3 hops from system the persisted theme must be back to "system"',
    ).toBe('system')

    // And the resolved html class still reflects OS=dark since system → dark.
    expect(await readHtmlClass(page)).toContain('dark')
  })
})
