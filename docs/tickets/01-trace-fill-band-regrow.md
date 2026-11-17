# 01 · Tracer fills the whole barrier (fill-band lines)

**Goal.** Make `traceOutlines` produce a correct, gap-free outline when cutting lines are drawn as filled bands instead of strokes.

**Why it matters.** A user imports the Raglan hoodie, does every wizard step, and at the last step gets "obrys musí být jednoduchý polygon…" with no way forward. This bug is the cause.

## Context (verified at commit 8045a1a)

- `src/pdf/trace.ts:55-61`: `maxWidth` starts at 1 and is only raised inside `if (path.stroke && i)` (line 60). Fill-only paths never raise it.
- `src/pdf/trace.ts:120`: `barrier` = raster dilated by `radius` (gap / resolution / 2, 1 px at defaults).
- `src/pdf/trace.ts:129-139`: `interior` = enclosed non-barrier pixels; `solid` = `interior` dilated by `radius + ceil(maxWidth / 2)` and intersected with `restored` (eroded envelope).
- Raglan lines are filled bands, median width 0.98 mm, about 3 px at 0.5 mm, so the barrier is about 5 px but the regrow is 2 px per side. A 1-px slit stays in the middle of every inner line (hem lines). At the T-junction with the outer line the slit opens outward; the boundary walk (`trace.ts:143-168`) enters it.
- Measured on Raglan, defaults: sleeve ring has 6 duplicated vertices in sizes M–XXL (4 in S), forming loops of 76, 119 and 201 cm² in XXL; body 2251.9 cm² vs library 2374.4; pocket 533.3 vs 543.2; hood 1160.5 vs 1175.8.
- With the width forced to 3 px in a scratch copy: sleeve simple at 2712.7 (library 2724.2), body 2362.4, hood 1167.6, pocket 537.9.

## Scope

`src/pdf/trace.ts`, `tests/pdf-trace.test.ts`, `tests/local/pdf-trace.test.ts`, README paragraph on tracing.

**Out of scope.** Ring sanitising (ticket 02), cells (04), notch handling (05), any UI.

## Approach

Recommended: replace the fixed-distance regrow with "every pixel of `restored` that is reachable from `interior` through barrier pixels within the envelope joins the solid", i.e. a multi-source breadth-first fill from `interior` over `restored`, limited to a distance of `radius + W` where `W` is the widest barrier actually present. Simplest correct form: compute `W` from the raster itself (largest run of barrier pixels between two interior pixels is hard; instead estimate each filled subpath's band width as `2 × area / perimeter` in px and take the maximum over subpaths longer than 20 px, and keep the existing stroke measure).

1. In the bounds loop, also raise `maxWidth` for fill paths using the band-width estimate above.
2. Keep `solid = dilate(interior, radius + ceil(maxWidth / 2)) & restored`.
3. Add the synthetic tests below.
4. Tighten the local Raglan assertions.

Rejected: morphological opening of `solid` (tried 1 mm and 2 mm; slits remain, it removes protrusions, not slits). Rejected: Clipper union of the finished ring (measured: returns the same self-touching ring).

## Acceptance criteria

CI-safe, in `tests/pdf-trace.test.ts`:
- A 20 × 30 cm rectangle drawn as four 1 mm wide filled bands plus one inner horizontal band: exactly one outline, `isSimple(ring without closing point)` is true, area within 0.5 % of 600 cm² measured to band centres.
- The same shape drawn with 1 pt strokes still passes (regression).
- A filled solid shape larger than 5 × 5 cm (not a band) does not blow up `maxWidth`: tracing a pattern containing one stays under 2 s and outline areas of other pieces change by less than 0.1 %.

Local (`tests/local/pdf-trace.test.ts`, needs `patterns/`, `library/`):
- Raglan, sizes S–XXL: every traced ring is simple.
- Raglan, each size: sleeve, hood, large pocket and body each within 1 % of the library area (body compared with `rueckenteil-190`).
- Gyda, Fiona, Celia: existing assertions unchanged and green.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Large filled shapes (logos, solid pieces) must not count as line bands: cap the estimate, e.g. ignore subpaths whose estimated width exceeds 3 mm.
- Dandelion size 40 is a double band; do not let the two bands merge sizes. Check that `tests/local` Dandelion scale test still passes.
- Raising `maxWidth` also raises `padding` (`trace.ts:63`); raster size limit is 40 M px (`trace.ts:66`).

## Dependencies

None.

## Size, executor

S. Delegated worker. No plan approval (3 files plus README).

## Definition of done

See README "Definition of done". README tracing paragraph mentions that band-drawn lines are measured.

## Decisions assumed

- D3 ASSUMED: keep the raster tracer; no vector rewrite.
