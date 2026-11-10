# Decisions

Questions the owner has settled, so they are not reopened by accident. One line each, with the date of the decision.
Where another doc already records it in full, the line links there. Changing one of these needs the owner's agreement.

- **Map library: MapLibre GL JS** (2026-10-21). An OpenLayers prototype was tried and rejected on a real phone (redraw
  artifacts and blank areas while zooming), although it loaded faster in emulation. Do not propose swapping the map library.
- **No weapon-like visuals** (2026-10-22). No crosshair, scope or target look in diagrams, markers or icons; the site maps
  wars and killings. The compass face for "Nearby" (one filled disc, N/E/S/W outside its edge, no cross lines) is approved.
- **Borders are never simplified** (2026-10-04; all border files 2026-10-20). Rounding to 6 decimal places (about 10 cm, the
  precision CShapes uses) is acceptable; anything coarser needs the owner's OK. Recorded and enforced as described in
  [DATA_POLICY.md, "Pipeline and workflow"](DATA_POLICY.md#pipeline-and-workflow) and [SCALING.md, "Borders"](SCALING.md#borders).
- **Wikidata aliases: search only** (2026-10-24). They find events, and a result found through one shows "matched: ..."; the
  event panel has no "Also called" list, because some aliases are one side's name for an event
  ([DATA_POLICY.md, `wikidata_aliases`](DATA_POLICY.md#what-each-field-is)).
- **City labels** (2026-10-31). No capital is marked; names change by year, only as the cited English Wikipedia sentences in
  `scripts/build-cities.js` date them; the cities are Natural Earth's with POP_MAX of at least 300,000 (that file's header).
  State labels are placed before city labels, so Gaza City is hidden at zoom 7 by the Gaza Strip label: a decided
  trade-off, not an open issue (re-checked 2026-11-09).
- **Water names** (2026-10-31). Each is the English Wikipedia title only (for example Persian Gulf); the other names appear only
  on the About page (see `scripts/build-water.js`). No rivers or reservoirs. A contested name must be as visible
  on the map as the names around it, never hidden where others show.
- **Framing review** ([framing-review.md](framing-review.md)): it covers the summaries, not the titles (2026-10-04); two
  separate reviews and no score or side statistics ([What it is and is not](framing-review.md#what-it-is-and-is-not),
  [Two review types](framing-review.md#two-review-types)); when a later review finds nothing but the first review flagged
  something, the first review's finding is kept (2026-09-30); on a re-review, findings on sentences whose wording did not
  change are carried over as they were (2026-10-04, [Who reviewed it](framing-review.md#who-reviewed-it)).
