---
phase: 13-ai-demo-experience
plan: 02
subsystem: frontend/demo-ui
tags: [react, landing-page, demo, graph-canvas, ai-chat]
dependency_graph:
  requires: [13-01]
  provides: [demo-section-ui, demo-component-tree]
  affects: [LandingPage, LandingNav]
tech_stack:
  added: []
  patterns: [lazy-loading, intersection-observer, zustand-selectors, streamdown-markdown]
key_files:
  created:
    - frontend/src/components/demo/DemoDatasetSelector.tsx
    - frontend/src/components/demo/DemoSuggestedQuestions.tsx
    - frontend/src/components/demo/DemoChatInput.tsx
    - frontend/src/components/demo/DemoResponseCard.tsx
    - frontend/src/components/demo/DemoGraphCanvas.tsx
    - frontend/src/components/demo/DemoSection.tsx
  modified:
    - frontend/src/pages/LandingPage.tsx
    - frontend/src/components/landing/LandingNav.tsx
decisions:
  - DemoSection lazy-loaded via React.lazy + Suspense so GraphCanvas and AI provider only initialize when user scrolls to the section
  - LandingNav updated to replace Use Cases with Demo anchor (#demo) for direct navigation
  - DemoResponseCard extracts NL text before the first cypher fence for clean display separation
  - DemoGraphCanvas wraps GraphCanvas with placeholder state; isGeographic auto-derived from DATASETS[dataset].meta.isGeographic
metrics:
  duration_seconds: 210
  completed_date: "2026-03-13"
  tasks_completed: 3
  files_created: 6
  files_modified: 2
---

# Phase 13 Plan 02: Interactive Demo Section Summary

**One-liner:** Split-screen "Talk to Your Knowledge Graph" landing demo with dataset selector, streaming chat, Cypher display, and animated graph canvas.

## What Was Built

A complete interactive demo section for the landing page. Visitors select one of 4 famous datasets, click a suggested question or type their own, watch an AI-style streaming response with generated Cypher syntax, and see the graph canvas animate with a query trace.

## Component Tree

```
DemoSection (orchestrator, id="demo", lazy-loaded)
  DemoDatasetSelector    — 4 dataset buttons with icons, active highlight, mobile scroll
  DemoSuggestedQuestions — per-dataset question pills with staggered fade-in
  DemoResponseCard       — NL answer via Streamdown + styled Cypher block + status
  DemoChatInput          — single-line input, Enter-to-submit, send button
  DemoGraphCanvas        — wraps GraphCanvas with placeholder state + animation glow ring
```

## Key Wiring

- `DemoSection` reads from `useDemoChat` (sendQuestion, activeDataset, setActiveDataset) and `useDemoStore` (messages, graphData, isLoading, isTraceAnimating)
- Dataset switch clears conversation and graph state via `useDemoStore.setActiveDataset`
- Suggested question click calls `sendQuestion(q.text)`, which hits the pre-computed fast path in `useDemoChat`
- `DemoGraphCanvas` derives `isGeographic` from `DATASETS[dataset].meta.isGeographic` for Air Routes geographic rendering
- GraphCanvas trace animation driven by `useGraphStore.trace` state set by `useDemoChat`'s simulated trace

## Layout

- Desktop (`lg:`): chat left column + graph right column, side by side
- Mobile: stacked, chat above graph (question then answer visualization)
- Section entrance: fade-in on scroll via `useSectionInView` with 5% threshold
- Message area: scrollable `max-h-[340px]`, auto-scrolls to latest message

## LandingPage Integration

DemoSection inserted between ShowcaseSection and FeaturesSection. Narrative flow:
1. Hero: promise
2. Showcase: credibility (famous datasets)
3. Demo: interactive proof
4. Features: technical details
5. Getting Started: CTA

## Deviations from Plan

None. Plan executed exactly as written.

## Self-Check: PASSED

Files verified present:
- FOUND: frontend/src/components/demo/DemoSection.tsx
- FOUND: frontend/src/components/demo/DemoDatasetSelector.tsx
- FOUND: frontend/src/components/demo/DemoSuggestedQuestions.tsx
- FOUND: frontend/src/components/demo/DemoChatInput.tsx
- FOUND: frontend/src/components/demo/DemoResponseCard.tsx
- FOUND: frontend/src/components/demo/DemoGraphCanvas.tsx

Commits verified:
- 43d338e: Task 1 (four subcomponents)
- ebd9b97: Task 2 (DemoGraphCanvas + DemoSection)
- 98e9b33: Task 3 (LandingPage integration)

Build: `npm run build` succeeded, DemoSection code-split to its own chunk (37.75 kB).
