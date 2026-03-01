---
phase: 04-landing-page-and-playground
plan: 04-01
status: complete
---

## Plan 04-01 Summary

- Added route bootstrapping with `src/AppRouter.tsx` and updated `src/main.tsx` to mount `BrowserRouter` -> `AppRouter` under the existing providers.
- Added lazy routes for `/` (`LandingPage`), `/playground` (`PlaygroundPage`), `/app` (`App`), and wildcard redirect to `/`.
- Added curated sample graph data in `src/data/sampleGraph.ts` with `MOVIES_SAMPLE`, `PlaygroundQueryKey`, `runPlaygroundQuery(...)`, and relationship-type filtering logic.
- Added dataset test coverage in `src/data/sampleGraph.test.ts` for volume bounds, label/type coverage, cloning behavior, and filtered-query orphan prevention.
