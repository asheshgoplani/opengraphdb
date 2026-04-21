import { expect, test } from '@playwright/test'

// RED test for fix/mcp-silent-fake.
// Today: /api/mcp/invoke 500 → mcpClient catches, returns { ok: true, source: 'preview' },
// MCPToolCard renders the canned JSON with only a 9.5px white-45 "preview" whisper.
// User cannot tell the response is canned. This test fails today because there is no
// `data-testid="mcp-source-badge"` element in the DOM (verified via grep, 2026-04-21).
//
// Goes GREEN when fix lands:
//   1. mcpClient.invokeMcpTool returns a discriminated union { source: 'live' | 'preview' | 'error' }
//      with no contradictory `ok: true` on a fetch failure.
//   2. MCPToolCard renders <SourceBadge data-testid="mcp-source-badge" data-source={source}>
//      with a visible (≥ text-[11px], box height ≥ 14px) amber/red pill on non-live source.

test.describe('MCP honesty — Try-me must surface preview / error vs live', () => {
  test('500 from /api/mcp/invoke renders a visible preview-or-error badge, never live', async ({
    page,
  }) => {
    // Stub every /api/mcp/invoke call to fail. Deterministic — independent of backend lifecycle.
    await page.route('**/api/mcp/invoke', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'no ogdb backend running' }),
      })
    })

    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    // Find the first real MCP tool card and click Try.
    const card = page.getByTestId('mcp-tool-card').first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /try/i }).click()

    // Result block must render — silent no-op is unacceptable.
    const result = card.getByTestId('mcp-tool-result')
    await expect(result).toBeVisible({ timeout: 5_000 })

    // The honesty contract: a source badge must exist and must NOT claim 'live'.
    const badge = card.getByTestId('mcp-source-badge')
    await expect(badge).toBeVisible({ timeout: 5_000 })

    // No green/cyan "live" element may exist on this card when the backend was 500.
    const liveBadge = card.locator('[data-testid="mcp-source-badge"][data-source="live"]')
    await expect(liveBadge).toHaveCount(0)

    // Badge must report preview or error.
    const sourceAttr = await badge.getAttribute('data-source')
    expect(['preview', 'error']).toContain(sourceAttr)

    // Badge text must contain "preview" or "error" (case-insensitive). No "live" / "ok" / "success".
    const badgeText = (await badge.textContent())?.toLowerCase() ?? ''
    expect(badgeText).toMatch(/preview|error|offline|unreachable/)
    expect(badgeText).not.toMatch(/\blive\b|\bsuccess\b|\bok\b/)

    // Visibility floor: current bug renders the word "preview" at text-[9.5px] (~10px box).
    // Require box height ≥ 14px so a sighted user can actually read it.
    const box = await badge.boundingBox()
    expect(box, 'badge must have a layout box').not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(14)
  })

  test('200 JSON from /api/mcp/invoke renders a live badge, no preview or error', async ({
    page,
  }) => {
    // Guard against an over-correction that always shows preview/error. The 'live' code path
    // must still light up when the backend really did return.
    await page.route('**/api/mcp/invoke', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          labels: ['Movie', 'Person'],
          edge_types: ['ACTED_IN'],
          property_keys: ['title'],
        }),
      })
    })

    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const card = page.getByTestId('mcp-tool-card').first()
    await card.getByRole('button', { name: /try/i }).click()

    await expect(card.getByTestId('mcp-tool-result')).toBeVisible({ timeout: 5_000 })

    const badge = card.getByTestId('mcp-source-badge')
    await expect(badge).toBeVisible({ timeout: 5_000 })
    await expect(badge).toHaveAttribute('data-source', 'live')

    // No preview / error badge on a successful invocation.
    await expect(
      card.locator('[data-testid="mcp-source-badge"][data-source="preview"]'),
    ).toHaveCount(0)
    await expect(
      card.locator('[data-testid="mcp-source-badge"][data-source="error"]'),
    ).toHaveCount(0)
  })
})
