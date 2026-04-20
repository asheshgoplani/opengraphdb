import { expect, test } from '@playwright/test'

// RED test for PLAN slice S5: Live perf strip + MCP tool gallery with try-me.
// Expected to FAIL today — frontend/src/components/ai/MCPActivityPanel.tsx is
// a 10-line placeholder with no tool cards and /playground has no PerfStrip.
// Goes GREEN when slice 5 lands (MCPToolGallery + MCPToolCard + PerfStrip).

test.describe('Playground premium — S5 MCP gallery + perf strip', () => {
  test('renders a gallery of MCP tools with invoke-ready cards', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /MCP Tools/i })).toBeVisible()

    // At minimum, the five tools in mcp/README.md:75-82:
    // browse_schema, execute_cypher, get_node_neighborhood, search_nodes, list_datasets
    const cards = page.getByTestId('mcp-tool-card')
    await expect(cards).toHaveCount(5, { timeout: 5_000 })

    const firstCard = cards.first()
    await expect(firstCard.getByRole('button', { name: /try/i })).toBeVisible()

    await firstCard.getByRole('button', { name: /try/i }).click()
    await expect(firstCard.getByTestId('mcp-tool-result')).toBeVisible({ timeout: 5_000 })
  })

  test('perf strip shows parse / plan / execute timing cells', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const strip = page.getByTestId('perf-strip')
    await expect(strip).toBeVisible()
    await expect(strip.getByTestId('perf-parse')).toBeVisible()
    await expect(strip.getByTestId('perf-plan')).toBeVisible()
    await expect(strip.getByTestId('perf-execute')).toBeVisible()
  })
})
