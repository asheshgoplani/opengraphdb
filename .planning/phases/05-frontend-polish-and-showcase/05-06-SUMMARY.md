---
phase: 05-frontend-polish-and-showcase
plan: 05-06
status: complete
---

## Plan 05-06 Summary

- Added Playwright visual E2E infrastructure in `frontend/playwright.config.ts`:
  - Chromium project (`Desktop Chrome`)
  - `baseURL` set to `http://localhost:5173`
  - `webServer` starts Vite using `npm run dev -- --host 127.0.0.1 --port 5173`
- Added `test:e2e` script to `frontend/package.json` (`playwright test`).
- Added E2E suites under `frontend/e2e/` with screenshot capture to `frontend/e2e/screenshots/`:
  - `landing.spec.ts`: validates hero, showcase, features, getting-started, navigation, and captures light/dark screenshots.
  - `playground.spec.ts`: validates split-pane layout, dataset URL loading (`movies/social/fraud`), dataset switch behavior, query cards/stats panel, and captures light/dark screenshots.
  - `app.spec.ts`: validates empty-state rendering, status visibility, settings dialog behavior, captures light/dark screenshots, and conditionally captures post-query screenshot when backend is connected.
- Added `frontend/e2e/screenshots/.gitkeep` and captured the initial screenshot set.
- Added stable E2E selectors to support deterministic assertions:
  - `frontend/src/components/landing/ShowcaseCard.tsx` → `data-testid="showcase-card"`
  - `frontend/src/components/landing/FeaturesSection.tsx` → `data-testid="feature-card"`
  - `frontend/src/components/playground/QueryCard.tsx` → `data-testid="query-card"`
  - `frontend/src/components/playground/DatasetSwitcher.tsx` → `data-testid="dataset-switcher"`

## Validation

- `cd frontend && npx tsc --noEmit` (pass)
- `cd frontend && npx vitest run` (pass)
- `cd frontend && npx vite build` (pass)
- `cd frontend && npx playwright test` (pass: `13 passed`, `1 skipped`)
  - skipped test: app post-query screenshot, because backend was not connected at runtime
- `cd frontend && ls -1 e2e/screenshots` (pass)

## Notes

- `./scripts/test.sh` and `./scripts/coverage.sh` were intentionally skipped as explicitly requested.
