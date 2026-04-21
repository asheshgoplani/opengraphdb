# PLAN — fix/mcp-silent-fake

Phase: 2 (PLAN) of 8-phase TDD workflow. Do not implement in this session.

Branch: `fix/mcp-silent-fake`
Task id: `fix-mcp-silent-fake`

---

## (0) Existing-work scan

Scanned on 2026-04-21.

- `git log --all --since='3 months ago' -S 'source:' -- frontend/src/api/mcpClient.ts --oneline` → 2 hits, both within slice S5 introduction (`1b6695e`, `5a831c5`). No follow-up that addresses the silent-fallback / `ok: true` lie.
- `git log --all --since='3 months ago' --oneline -- frontend/e2e/mcp-*` → only `mcp-gallery.spec.ts` exists. It asserts DOM existence and clicking Try, but never asserts what `source` is — passes whether backend is live or 500.
- `gh pr list --search 'mcp OR honest OR preview in:title' --state all --limit 10` → empty.
- `gh issue list --search 'mcp silent OR mcp preview OR mcp fake in:title' --state all --limit 10` → empty.
- `.planning/` siblings: `.planning/playground-premium/SELF-REVIEW-2026-04-20.md` §3 S5 + §5b documents this exact bug (silent-fake when backend down). No fix planning exists.
- `Grep "source: 'live'\|source: 'preview'" frontend/src` → 4 hits, all in `mcpClient.ts` (definition + 2 returns) and `MCPToolCard.tsx` (display). No `source: 'error'` anywhere. No discriminated union of three states.
- `Grep "data-testid.*source\|data-testid.*badge" frontend/src` → empty. There is no source-badge testid yet — RED test using one will be unambiguously red.

No in-flight PR, issue, or plan addresses this bug. Proceeding.

---

## (1) Problem summary

`frontend/src/api/mcpClient.ts:38-48` catches every `/api/mcp/invoke` failure (HTTP 500, network down, timeout) and returns:

```ts
{ tool, ok: true, source: 'preview', elapsedMs, result: preview, error: message }
```

Two structural lies:

1. **`ok: true` on a fetch failure.** A consumer reading `result.ok` cannot distinguish a real successful invocation from a hardcoded canned response served because the backend was unreachable. The discriminator is buried in `source`, which the type system does not enforce against `ok`.
2. **No `'error'` state at all.** The union is `'live' | 'preview'`, so genuine errors (timeouts, parse errors, malformed responses) are coerced into the same "preview-with-error-string" bucket as a clean 500. There is no way for the UI to render a red error badge — only "preview, oh by the way `error: 'HTTP 500'`".

Then `MCPToolCard.tsx:71-80` does render `result.source` and `result.error`, but at `text-[9.5px] uppercase tracking-wider text-white/45` (effectively invisible on a dark card at desktop viewing distance) and the "offline" amber badge only appears in the corner when both `source === 'preview'` AND `result.error` is truthy. The dominant visual is the formatted JSON pre-block — same shape whether live or canned. A user clicking "Try" on `execute_cypher` with no ogdb backend running sees `{columns, rows, stats: {parse_us: 42, plan_us: 187, execute_us: 612}}` and concludes "the MCP server is up and a Cypher round-trip just took 841 µs". Neither claim is true.

Per `.planning/playground-premium/SELF-REVIEW-2026-04-20.md` §5b: "the return shape `{ source: 'preview', ok: true, error: 'HTTP 500' }` is not surfaced in the card UI. A 'preview-mode' badge would make this honest." — promoted to a P1 honesty fix here. Violates the spirit of D2 in `.planning/playground-premium/PLAN.md` (the absent file the SELF-REVIEW references in §3-S5: "PLAN D2 required (b) real via thin HTTP adapter ... PLAN D2 is violated by omission").

---

## (2) Exact reproducer (deterministic, <1 min)

Pre-req: `cd frontend && npm install` once. No ogdb backend needed (the bug only manifests when /api/mcp/invoke fails).

**Manual:**

```bash
cd ~/opengraphdb/frontend
# Ensure no ogdb backend on :8080 — otherwise vite proxy reaches it and source becomes 'live':
pgrep -af 'opengraphdb.*serve' || echo "no ogdb running — good for reproducing"
npm run dev -- --host 127.0.0.1 --port 5173
# In another shell:
xdg-open http://localhost:5173/playground   # or open in browser manually
# Scroll sidebar to "MCP Tools" gallery. Click "Try" on the first card (browse_schema).
```

Observed (current `main` and `fix/mcp-silent-fake` HEAD before fix):
- Result block appears with the canned `{labels: ['Movie', 'Person', 'Genre'], edge_types: [...], property_keys: [...]}` JSON.
- Tiny `preview · 12ms` text in the result-block header (text-[9.5px], muted to 45% opacity).
- Tiny amber `offline` chip top-right of the result block (also text-[9.5px]).
- No card-level visual indicator. No banner. No prominent badge near the "Try" button. Nothing on the card border.

Expected (after fix):
- Card displays a visible `preview` badge (amber pill, ≥ text-[10px] sans-serif, contrast >= 3:1, with `data-testid="mcp-source-badge"` and `data-source="preview"`) AND/OR a non-success error state.
- Crucially: NO green/cyan success indicator (no check icon, no "live" pill rendered green) when the backend was unreachable.

**Automated (the new RED test below; commits in this same plan):**

```bash
cd ~/opengraphdb/frontend
npx playwright test e2e/mcp-honest-preview.spec.ts
```

Expected today: FAIL — locator `data-testid="mcp-source-badge"` does not exist in DOM.
Expected after fix: PASS — badge present, `data-source="preview"`, no `data-source="live"` element on the card.

---

## (3) DATA-FLOW TRACE — `Try` click → DOM

| # | Hop | file:line | Source-of-truth state | Visible to user? |
|---|-----|-----------|------------------------|-------------------|
| 1 | User clicks `<Button>` in `MCPToolCard` | `frontend/src/components/mcp/MCPToolCard.tsx:43-62` | `loading` flips to true; `result` still null | spinner |
| 2 | `handleTry` calls `invokeMcpTool(spec.name, spec.sampleArgs, spec.preview)` | `MCPToolCard.tsx:16-22` | `spec.preview` (the canned JSON from `mcpTools.ts`) is passed in as a *fallback parameter* — i.e., the canned data is pre-loaded into the call site, the client just decides whether to use it | n/a |
| 3 | `fetch('/api/mcp/invoke', POST, body, AbortSignal.timeout(2500))` | `mcpClient.ts:23-28` | network round-trip via vite proxy → `http://localhost:8080/mcp/invoke` | n/a |
| 4 | **If `res.ok` is false → `throw new Error('HTTP ${status}')`** | `mcpClient.ts:29` | exception thrown | n/a |
| 5 | **catch block builds `{ ok: true, source: 'preview', result: preview, error: message }`** | `mcpClient.ts:38-48` | **TRUTH IS LOST HERE.** Fetch failed (status≠2xx). The function returns `ok: true`. The discriminator that says "this is canned" is `source: 'preview'`, but the success boolean has been forced to `true`. The `error` field is the only remaining trace of the failure | n/a |
| 6 | `setResult(res)` then render | `MCPToolCard.tsx:20, 66-85` | `result.source === 'preview'`, `result.error === 'HTTP 500'`, `result.ok === true` | render below |
| 7 | Header strip renders `{result.source === 'live' ? 'live' : 'preview'} · {result.elapsedMs}ms` | `MCPToolCard.tsx:71-74` | text says "preview · 12ms" at `text-[9.5px] uppercase text-white/45` | **technically yes, practically no** — 9.5px white-at-45%-opacity on dark bg, no test for visibility, no visual hierarchy |
| 8 | Conditional offline chip `{result.source === 'preview' && result.error && (<span className="text-amber-300/70">offline</span>)}` | `MCPToolCard.tsx:75-79` | renders text "offline" in amber-300/70, also `text-[9.5px]` | same — too small to read at normal viewing distance |
| 9 | Result `<pre>` shows `JSON.stringify(result.result, null, 2)` | `MCPToolCard.tsx:81-83` | the canned JSON from `spec.preview` — looks identical to a real backend response of the same shape | dominant visual |

### Where truth is lost

**Hop 5 is the lie.** A 500 produces a value that claims `ok: true`. Hops 7 and 8 *do* surface `source: 'preview'` and `error`, but at a font size and opacity that render them visually irrelevant against the dominant JSON block in hop 9. The fix has two layers:

- **Type-level:** make the discriminated union explicit so consumers must pattern-match on `source` (or `kind`) — `ok: boolean` becomes derivable from `source === 'live'`, not an independent field.
- **Render-level:** badges that pass a sighted-user heuristic ("amber pill, ≥10px, with the word 'preview' or 'offline'") AND a programmatic test (`data-testid="mcp-source-badge"` with `data-source="preview"|"live"|"error"`).

---

## (4) Failing test — committed to `fix/mcp-silent-fake` in this commit

`frontend/e2e/mcp-honest-preview.spec.ts` (committed alongside this PLAN). Must compile under `npx playwright test` and **fail at run-time** on current HEAD, against a dev server with no ogdb backend running. Goes GREEN when (5) lands.

The test stubs `/api/mcp/invoke` to always return HTTP 500 via `page.route()`, clicks Try on the first `mcp-tool-card`, and asserts:

1. `mcp-tool-result` becomes visible (some result block must render — silent failure is unacceptable).
2. A `mcp-source-badge` element exists with `data-source="preview"` OR `data-source="error"`.
3. Crucially: **no element with `data-source="live"` exists on the card** — no green success indicator may render.
4. The badge text contains a literal "preview" or "error" (case-insensitive). No "live", no "ok", no green check.
5. The badge is *visible* (Playwright's `toBeVisible` uses a viewport / opacity / display heuristic that catches the current 9.5px-white-45 problem only partially — to be safe, also assert `box.height >= 14` to fail on the current sub-10px text).

The test must fail on current HEAD because there is no `data-testid="mcp-source-badge"` anywhere in the codebase (verified by grep in §0).

A second test asserts the live-success path: stub the route to return `{ result: { ok: true } }` with HTTP 200, and assert the badge renders with `data-source="live"`. This guards against an over-correction that nukes the "live" pill entirely or always shows preview.

---

## (5) Implementation sketch — shape only, do not build

### 5.a [REQUIRED] Discriminated union with explicit error variant

Change `MCPInvokeResult` in `frontend/src/api/mcpClient.ts:3-10` to a true tagged union. No more shared `ok: boolean` that contradicts `source`:

```ts
export type MCPInvokeResult =
  | { source: 'live';    tool: string; elapsedMs: number; result: unknown }
  | { source: 'preview'; tool: string; elapsedMs: number; result: unknown; reason: string }
  | { source: 'error';   tool: string; elapsedMs: number; reason: string }
```

Decision in `invokeMcpTool`:
- HTTP 2xx + JSON parse OK → `{ source: 'live', ... }`.
- Fetch failed (network, timeout, non-2xx) AND a non-null `preview` was passed → `{ source: 'preview', ..., reason: <message> }`. The fallback to canned data is acknowledged in the *name* of the source.
- Fetch failed AND `preview` is null/undefined → `{ source: 'error', reason: <message> }`. No fallback hides the failure.

Drop `ok: boolean` entirely — call sites use `source === 'live'`. `result` is only present in `live` and `preview` shapes. `reason` is only present where it makes sense.

`error?: string` becomes `reason: string` (always present when source ≠ 'live'); rename clarifies it is not necessarily an Error object.

### 5.b [REQUIRED] Visible source badge in `MCPToolCard`

`frontend/src/components/mcp/MCPToolCard.tsx:66-85` gets a real badge:

```tsx
{result && (
  <div className="mt-3 ..." data-testid="mcp-tool-result">
    <header className="mb-2 flex items-center justify-between">
      <SourceBadge source={result.source} elapsedMs={result.elapsedMs} />
      {result.source !== 'live' && <ReasonHint reason={result.reason} />}
    </header>
    {result.source !== 'error' && (
      <pre className="...">{JSON.stringify(result.result, null, 2)}</pre>
    )}
  </div>
)}
```

`SourceBadge`:
- `source === 'live'`  → `<span data-testid="mcp-source-badge" data-source="live"  className="... bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 ... text-[11px]">live · {elapsedMs}ms</span>` + small Check icon from lucide.
- `source === 'preview'` → `data-source="preview"`, amber palette (`bg-amber-500/15 text-amber-200 border-amber-400/40`), label `preview · canned response`. `text-[11px]` minimum so Playwright's box-height >= 14 holds.
- `source === 'error'`   → `data-source="error"`, red palette (`bg-rose-500/15 text-rose-200 border-rose-400/40`), label `error · backend unreachable`.

`ReasonHint` shows the `reason` text in muted small text below the badge — separate from the badge itself, no longer hidden in a `title` attribute.

The badge sits above the `<pre>` and is the dominant visual element of the result block, not a 9.5px corner whisper.

### 5.c [REQUIRED] `mcpTools.ts` preview metadata sanity

`frontend/src/components/mcp/mcpTools.ts` — no per-tool change required for this fix because the canned `preview` field is already there. But verify (and assert in a unit-style test if cheap) that every `MCPToolSpec.preview` is non-null for `status: 'real'` tools, so the `'preview'` fallback path always has data and we never silently drop into `'error'` for a tool that used to render canned data. Coming-soon tools may keep their previews as illustrative.

### 5.d [OPTIONAL — note in PLAN, do not require] Top-of-gallery banner

If any MCP card click in the current session resolved to `source !== 'live'`, render a one-line cyan banner above `MCPToolGallery` saying: "MCP responses are coming from canned previews. Run `ogdb serve --http --port 8080` to see live results." Improves discoverability of the underlying state.

Marked OPTIONAL because the per-card badge in 5.b satisfies the success criterion in (8). Implementation session may add this if time permits; not gated.

---

## (6) Scope boundaries

**IN SCOPE:**
- `frontend/src/api/mcpClient.ts` — discriminated union + branching in `invokeMcpTool`.
- `frontend/src/components/mcp/MCPToolCard.tsx` — badge rendering + result-block restructure.
- New helper components if extracted (`SourceBadge`, `ReasonHint`) — co-located in `frontend/src/components/mcp/` or inlined; left to implementor.
- `frontend/e2e/mcp-honest-preview.spec.ts` — added in this commit (RED).
- `.claude/release-tests.yaml` — append a new entry mirroring `playground-mcp-gallery-e2e` for the new spec, in the implementation commit (NOT in this PLAN commit).

**OUT OF SCOPE:**
- `frontend/src/components/mcp/mcpTools.ts` data — no edits to canned `preview` payloads.
- Adding a real `mcp/http-adapter` Node wrapper (separate task, would close PLAN D2 from playground-premium properly).
- Spawning an actual `ogdb serve --http` from vite middleware in dev.
- Touching `MCPToolGallery` layout, sidebar position, or any other slice S5 surface beyond what 5.b requires.
- Backend / `crates/` — no Rust edits whatsoever. This is a frontend-only honesty fix.
- Mobile responsive fixes for the perf strip (different bug, separate task).
- Schema browser, RDF dropzone, semantic search, temporal slider — separate slices, separate fixes.

---

## (7) Decision log

| # | Choice | Why | Alternative rejected | Reversibility |
|---|--------|-----|----------------------|---------------|
| D1 | Discriminated union with three variants (`live` / `preview` / `error`), drop `ok: boolean` | Type system enforces "if source !== 'live' you cannot pretend it succeeded". Eliminates the contradictory `ok: true, source: 'preview'` shape | Keep `ok` but make it derived (`ok = source === 'live'`) — strictly weaker, doesn't prevent future drift | Easy — re-add `ok` as a derived getter |
| D2 | `error` is a separate source from `preview` (not just `preview` with no result) | A consumer who passes `null` as the preview parameter (e.g., a tool with no canned response) genuinely should see a red error badge, not a blank "preview". Different UX → different state | Collapse `error` into `preview` with `result: null` | Easy — flatten in v2 if no caller uses null preview |
| D3 | `data-testid="mcp-source-badge"` + `data-source` attribute pair (not class-based or text-based selector) | testid + data-attr is the most stable Playwright surface across visual restyles. Class-based asserts (`bg-amber`) couple tests to Tailwind palette decisions | `data-testid="mcp-preview-badge"` / `mcp-error-badge` (one per source) | Easy — test-only rename |
| D4 | `text-[11px]` floor on the badge (asserted as `box.height >= 14`) | The current `text-[9.5px] text-white/45` *technically* renders the word "preview" but is invisible at desktop viewing distance. Box-height is the cheapest test-side proxy for legibility without screenshot diffing | Use `toHaveScreenshot()` baseline for the badge | Medium — can switch to screenshot diff later |
| D5 | RED test stubs `/api/mcp/invoke` via `page.route()` rather than relying on no-backend-running | Deterministic across dev / CI / local-with-ogdb-up. Test passes/fails based on FE behavior, not env state | Document "run with no backend" precondition | Easy — drop the `page.route` stub if backend lifecycle is later managed |
| D6 | Add the GREEN-direction `live` test alongside the RED `preview` test in the same commit | Prevents over-correction (e.g., implementor removes the `live` branch entirely and the preview test passes by accident). Both branches must work | Only ship the RED test; add live test post-fix | Easy — both live in the same file already |
| D7 | Frontend-only fix; do NOT also wire a real HTTP adapter in this task | Separation of concerns: this task is "stop lying about MCP responses". A real adapter is a different task that closes playground-premium PLAN D2 properly. Combining them risks scope creep and doubles the review surface | Do both in one PR | Easy — file a follow-up `wire-mcp-http-adapter` task |
| D8 | Append the new spec to `.claude/release-tests.yaml` in the *implementation* commit, not this PLAN commit | The release-tests manifest is gating; adding a known-failing test to it would break CI on this branch immediately. Manifest entry lands when the test goes GREEN | Add to manifest now, mark allow-failure | Easy — append later |
| D9 | Rename `error?: string` → `reason: string` in the new `preview` and `error` variants | `error` collides with the JS `Error` object semantically and conflated "this is an error" with "here's the explanation". `reason` is a string explanation regardless of variant | Keep `error` field name | Easy — pure rename |

---

## (8) Success criteria (binary)

The fix is accepted iff **all** pass:

- [ ] `cd frontend && npx playwright test e2e/mcp-honest-preview.spec.ts` — green (currently: red, locator `mcp-source-badge` does not exist).
- [ ] `cd frontend && npx playwright test e2e/mcp-gallery.spec.ts` — still green (no regression to the existing slice S5 gate).
- [ ] On every "Try" click in `/playground` against a stubbed-500 backend, the `MCPToolCard` rendered visually surfaces a non-green badge (`data-source="preview"` or `"error"`) with text height ≥ 14 px.
- [ ] On every "Try" click against a 200-with-JSON backend, the card renders `data-source="live"` and no `preview` / `error` badge.
- [ ] `frontend/src/api/mcpClient.ts` exports a tagged union with no `ok: boolean` field; calling `result.ok` raises a TypeScript error in any consumer that has not migrated. (Compile-time enforcement of the fix.)
- [ ] `cd frontend && npm run typecheck` (or `tsc --noEmit`) — green.
- [ ] No edits to `crates/` or any Rust file — verified by `git diff --stat main..fix/mcp-silent-fake -- crates/` returning empty.
- [ ] `.claude/release-tests.yaml` includes a new entry for `e2e/mcp-honest-preview` (added in the implementation commit, not the PLAN commit).

---

## Phase status

- [x] Phase 1 — bug surfaced (in `.planning/playground-premium/SELF-REVIEW-2026-04-20.md` §5b).
- [x] Phase 2 — PLAN.md + RED test committed on `fix/mcp-silent-fake`. **(this commit)**
- [ ] Phase 3 — implementation: rewrite mcpClient union, add SourceBadge.
- [ ] Phase 4 — RED → GREEN: `mcp-honest-preview.spec.ts` passes.
- [ ] Phase 5 — typecheck clean.
- [ ] Phase 6 — manual /playground click-through with stubbed-500 backend matches expected.
- [ ] Phase 7 — append release-tests.yaml entry.
- [ ] Phase 8 — merge to `main`.
