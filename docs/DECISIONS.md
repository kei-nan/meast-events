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
  change are carried over as they were (2026-10-04, [Who reviewed it](framing-review.md#who-reviewed-it)); when a finding
  flags one contested claim stated as fact, the rest of that paragraph is checked too (2026-11-14,
  [Overall fairness](framing-review.md#overall-fairness)).
- **No AI-written text on the site** (2026-11-14). The site shows Wikipedia's text and the stored framing review, never an
  answer or summary written by a model at request time. An on-site AI search lab tried it (Workers AI with Llama 3.3 70B
  and 3.1 8B, over Redis vector search; an experiment on its own branch, not merged). The free-form answers made up support
  for a claim (Suez), reversed a cause (looting in Gaza given as a result of scarcity, where the source gives it as a
  barrier to aid) and put the famine dates in the wrong tense. Answers made only of quotes were word for word correct but
  still one-sided: on Gaza starvation the 70B model quoted only the "Gaza genocide" article and skipped the famine article.
  So AI tools get the data instead (MCP at `/mcp`, `/ai/context/<id>.json`; `app/worker/index.js`), and the events around
  an event are chosen from the event, never from the question (`app/src/lib/conflictContext.js`). The guidance sent with
  them asks the AI to attribute the summaries to Wikipedia and not state them as fact.
- **AI search results in date order, not by relevance** (2026-11-14). `search_events` (`app/worker/search.js`) returns every
  event whose title, id or Wikidata group has all the query's words, sorted by start date. Ranking by how well an event
  matches the question puts first the events that share the question's framing, which is what the lab's quote-only
  answers showed. A known limit follows: it matches words, not meaning, and every word must match, so a question or a
  paraphrase can find nothing. "When did the Shah lose power?" and even "shah" do not find the Iranian Revolution
  ("Iranian revolution" does); "Gaza starvation" finds nothing, "Gaza famine" finds the famine. The tool's description
  and its no-result note tell the AI to use short title words. Search by meaning (embeddings) is a
  possible later option only with the same trade-off in mind: it would have to be used to find candidates, never to
  order them, and its misses and hits lean toward the question's own words. Not planned.
- **No Redis or Redis Iris for AI access** (2026-11-14). Iris is a context and memory engine for agents; the site's need is
  a fixed, read-only dataset that changes only when the site is rebuilt. Static files built with the pages, served through
  the existing Worker, give an AI exactly what the pages show, with no database to keep in step, no extra account and no
  second free tier to run out. Vector search (as in the lab) also orders results by closeness to the question, which the
  decision above rules out. The site's search already moved off Redis Cloud to Pagefind in the browser in October 2026 (#26, [DEPLOYMENT.md](../DEPLOYMENT.md)).
