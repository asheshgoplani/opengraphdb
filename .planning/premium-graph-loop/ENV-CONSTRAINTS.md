# Premium-Graph Loop — Test-Environment Constraints

## Summary

Iterations 11 → 13 kept shipping reviewer-visible gaps in the same three
buckets (palette variety, label halos, schema tab identity) even though
E2E gates passed. Root-cause analysis for slice-14 surfaced that the
linux-hetzner + xvfb + swiftshader + chromium-headless stack we run E2E
tests in **cannot faithfully reproduce the pixel output a real Mac user
sees** — yet slice-13 added strict pixel-sampling gates that we gradually
tuned to pass _in that environment_, not to pass _the eye test_.

The test env masked three real regressions:

1. Bloom/halo alpha is 0.85-opacity `mix-blend-mode: screen`. On
   swiftshader this composites to a muted lavender wash across all
   node hues. On real GPUs (Apple Silicon, Intel Iris, AMD) the same
   CSS produces crisp per-hue halos. Our pixel gates asserted
   "≥ 4 distinct hues across sampled points" — swiftshader's compositor
   _did_ clamp 4 visually-close pastels to 4 _technically_-distinct RGB
   values, so the gate passed, while the user reported "everything is
   purple".
2. Edge colors at alpha 0.55 survive swiftshader's blending as
   measurable per-type RGB, but visually dissolve into the navy
   backdrop on production GPUs where the viewer's adaptation and
   real panel gamut compress those low-alpha hues.
3. Schema tab's left-rail panel content is identical regardless of
   tab — pixel gates on the right-hand canvas couldn't ever detect
   whether "Schema" is a meaningful _mode_ vs just a sidebar filter.
   The reviewer never saw the tab as a distinct view.

## New rule going forward

**Gate on DOM + CSS + JSON-state. Reserve pixel assertions for real-GPU
runtime review.**

Specifically:

- ✅ `getComputedStyle()` on the bloom/halo element — assert
  `filter` blur and `opacity` within a tight range.
- ✅ `data-testid` on schema header bar, panel tint — assert
  presence, dimensions, and distinct styling vs other tabs.
- ✅ Palette JSON introspection — assert `EDGE_PALETTE[type]` maps to
  saturation ≥ 70% at `HSL` space, for every entry.
- ❌ `readPixels()` on cosmos.gl canvas in headless chromium — too
  many confounds (swiftshader compositing, mix-blend-mode rounding,
  subpixel antialiasing differences, color management mismatch).

When a pixel-level property matters (the reviewer will see it), we
should treat it as a **manual visual-QA checklist item** that the
engineer confirms on a real Mac before merging, not as an automated
gate.

## Slice-13 post-mortem in one paragraph

Slice-13 "fixed" palette variety, schema routing, and halos three
times. Each merge re-tuned pixel thresholds until the env reported
green. The real fix in slice-14 ignores pixel sampling entirely:

- **Bloom:** lowered CSS drop-shadow blur from ~10-14px to 4-6px,
  lowered halo opacity from 0.85 to 0.55, and dialled alpha stops
  from `aa/55` to `55/30/18`. E2E gate reads computed CSS,
  not pixels.
- **Edges:** lifted alpha floor from 0.55 to 0.78 and rebuilt
  `EDGE_PALETTE` with saturated 180°/45°/270°/135° anchors. E2E gate
  reads the palette JSON + computed edge-color CSS, not pixels.
- **Schema:** added a 32px Fraunces `SCHEMA BROWSER` header bar +
  mint tint on the whole panel. E2E gate asserts the header's
  `data-testid` is visible and has `font-size: 32px`.

## When the Mac reviewer disagrees with E2E gates, trust the Mac.

The test env is a **smoke-test**, not the source of truth. If the
reviewer says "palette still looks monochrome" and the gate says
"4 distinct hues detected" — the gate is measuring the wrong thing
on the wrong hardware. Adjust the gate to measure the property that
actually drives the Mac pixel, not the swiftshader one.
