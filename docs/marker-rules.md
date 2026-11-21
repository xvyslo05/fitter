# Marker rules (polohování) from the TUL lecture

Source: Zelová, Výroba oděvů (ODE), 4. přednáška „Polohování oděvních součástí“, FT TUL, slide n (cited as TUL-ZEL/n). Paraphrased only; the slides may not be shared without the author's consent. Full comparison with the app: [plan-tul-polohovani.md](plan-tul-polohovani.md).

Certainty: **high** = stated on a slide; **derived** = our reading of a slide or figure; **own** = conservative choice of the app, not on a slide.

| Id | Rule (one sentence) | Value, unit | When it applies | Source | Certainty | Fitter today | Proposed behavior | Testable claim |
|---|---|---|---|---|---|---|---|---|
| R-REF | Every piece lies with its reference line parallel to the warp (woven) or the wale (knit). | 0° | always | TUL-ZEL/6 | high | Import turns the piece so the grain runs along the fabric length. | Keep. | Every `NestPiece` grain direction is along +y before tilt. |
| R-ROT180 | Pieces may be turned by 180° on fabric without a pattern (UNI). | 180° | fabric without pile or directional print | TUL-ZEL/7, /11 | high | Default `rotation: '180'`. | Keep. | With `directional: false`, `rotation: '180'` yields placements with rotation 0 or 180 only. |
| R-DIR | On fabric with pile or a pronounced surface structure (for example shiny) all pieces are laid in one direction. | one direction | `directional: true` | TUL-ZEL/7 | high | Checkbox forces `rotation: 'none'`. | Keep; text names shiny fabrics. | With `directional: true`, every `NestPiece` has `rotation === 'none'` and `tilt === 0`. |
| R-ROT90 | Rotation by 90° changes the grain direction and is for nonwovens. | 90° | nonwovens only | TUL-ZEL/8 | derived | Optional setting, warns about the grain direction. | Keep; text says nonwovens. | With `rotation: '90'`, the rotation warning key is shown. |
| R-TILT | A piece may deviate from the reference line by ±3° if quality does not suffer. | ±3° | not on directional fabric, not on a fold | TUL-ZEL/11 | high (value), own (restrictions) | `DEFAULT_GRAIN_TOLERANCE_DEG = 3`, off by default. | Keep. | `|placement.tilt| <= 3` for every placement. |
| R-GAP | Safety distance between pieces depends on cutting technology and material. | 0–1 mm cutter, 5 mm hand cutting, 15 mm technical textiles | always | TUL-ZEL/12 | high | `DEFAULT_GAP_CM = 0.5`. | Keep; help text lists the values. | For every pair of placements `polygonDistance >= gap`. |
| R-SELV | A marker must not contain the fixed selvage of the fabric. | width not given | always | TUL-ZEL/13 | high | Fabric width is taken as usable; text only. | Enter width without selvages. | Documented; no geometry test. |
| R-BIG | Large pieces first, small pieces fill the gaps. | – | always | TUL-ZEL/4 | high | Order by area descending. | Keep. | The first pass places pieces in descending area order. |
| R-ENDS | The marker ends straight at both ends; its length is the fabric consumption. | – | always | TUL-ZEL/4 | high | Length from y = 0 to the lowest point. | Keep. | `usedLength` equals the max y of all placed pieces. |
| R-MIRROR | The mirrored marker holds right and left pieces mirrored, in full width; the one-sided marker is for fold, tube and face-to-face laying. | – | unfolded vs. folded fabric | TUL-ZEL/21 | high | Alternate pieces mirrored; fold gives the mirrored piece. | Keep. | Pairs on unfolded fabric alternate `mirrored`. |
| R-YIELD | Yield e = sum of piece areas / marker area · 100 %; waste = 100 % − e. | % | always | TUL-ZEL/10 | high | `placedArea / (width × length)`. | Use marker length also for a fixed piece. | `utilization === placedArea / (width * usedLength)`. |
| R-BENCH | Industrial multi-size markers reach about 85 %; a single-garment marker is mostly unfavorable. | about 85 % | benchmark context | TUL-ZEL/18, /20 | high | Benchmark notes 82–88 %, "not directly comparable". | Keep. | – |

## Questions of ticket 28 and what the lecture answered

| Question of ticket 28 | Answer | Source |
|---|---|---|
| 1. Prescribed gap, depends on technology? | Yes: 0–1 mm cutter, 5 mm hand cutting, 15 mm technical textiles; also on the material. | TUL-ZEL/12 |
| 2. Gap measured between cutting lines? | Not stated; templates already include seam allowances, so between templates (cut outlines). Fitter does this. | TUL-ZEL/2, /12 (derived) |
| 3. May pieces share a cutting line (gap 0)? | Not answered; a cutter at 0 mm allows it. | TUL-ZEL/12 |
| 4. Allowed grain deviation? | ±3° from the reference line. | TUL-ZEL/11 |
| 5. Deviation per piece or per garment? | Not answered. | – |
| 6. Pieces free of deviation or not? | Not answered. | TUL-ZEL/8 |
| 7. When 180°, when 90°? | 180° on UNI fabric; nothing explicit on 90°. | TUL-ZEL/7, /11 |
| 8. Which fabrics are directional? | Pile, pronounced surface structure (for example shiny); checks and stripes need pattern matching. | TUL-ZEL/7 |
| 9. One direction per garment? | Not answered. | – |
| 10. Fold and pile, special limits? | The one-sided marker is for face-to-face laying, fold and tube, that is for pattern and pile. | TUL-ZEL/21 |
| 11. Distance from the fixed selvage? | The marker must not contain it; value not given. | TUL-ZEL/13 |
| 12. Allowance at the start and end of the length? | Not stated; only "straight ends". Marks L_a on slide 5 are not explained. | TUL-ZEL/4, /5 |
| 13. When unfolded, fold, tube? | Industry mostly full width; half width on a fold or in a tube (knits). | TUL-ZEL/13 |
| 14. Right and left piece mirrored on one layer? | Yes. | TUL-ZEL/21 |
| 15. Which seams to match, how much extra fabric? | Seams: right/left, front/back, pockets, collars; extra consumption not given. | TUL-ZEL/7 |
| 16. Large motifs? | Not answered. | – |
| 17. Good yield at home vs. industry? | Industrial multi-size about 85 %; single marker worse, no number. | TUL-ZEL/18, /20 |
| 18. Allowance for shrinkage and mistakes? | Not answered. | – |
| 19. Laying order? | Large pieces first, small ones into gaps. | TUL-ZEL/4 |
