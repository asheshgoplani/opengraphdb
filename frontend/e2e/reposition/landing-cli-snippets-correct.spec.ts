import { expect, test } from '@playwright/test'

test('Getting Started snippets match real CLI surface', async ({ page }) => {
  await page.goto('/')
  const text = await page.locator('section#get-started').innerText()
  // Install: must be the path-based form until crate is published
  expect(text).toContain('cargo install --path crates/ogdb-cli')
  // MCP is its own command, not a flag on serve
  expect(text).not.toContain('serve --http --mcp')
  expect(text).toContain('ogdb mcp')
})
