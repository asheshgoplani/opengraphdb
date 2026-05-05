// Read the workspace version from Cargo.toml at test-load time so the
// e2e regression specs assert against the version that the Vite build
// (vite.config.app.ts / vite.config.marketing.ts / vite.config.ts) inject
// into the hero badge via `define`.
//
// EVAL-DOCS-COMPLETENESS-CYCLE15 F03: previously three e2e specs pinned the
// version literal `/v0\.3\.0/`, so a Cargo.toml bump (which already happened
// twice across 0.3 → 0.4 → 0.5) silently kept passing while the hero badge
// drifted. Sourcing the assertion from the same file as the implementation
// removes the drift surface.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Playwright's cwd during the run is the `frontend/` directory
// (playwright.config.ts lives there); the workspace Cargo.toml sits one
// directory above.
const REPO_ROOT = join(process.cwd(), '..')

export function readVersionFromCargoToml(): string {
  const cargoPath = join(REPO_ROOT, 'Cargo.toml')
  const cargo = readFileSync(cargoPath, 'utf8')
  const m = cargo.match(/\[workspace\.package\][^[]*?\nversion\s*=\s*"([^"]+)"/m)
  if (!m) {
    throw new Error(
      `cargo-version helper: could not parse [workspace.package].version from ${cargoPath}`,
    )
  }
  return m[1]
}

// Helper for callers that want a regex matching `v<version>` (escaped dots).
export function workspaceVersionRegex(): RegExp {
  const version = readVersionFromCargoToml()
  return new RegExp(`v${version.replace(/\./g, '\\.')}`)
}
