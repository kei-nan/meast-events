// REPORT ONLY: lists curated events whose stored start/end dates, coordinates or Wikidata classes no longer
// match their Wikidata item (lib/drift.js). Run monthly by .github/workflows/refresh-data.yml; the list is
// appended to the refresh report and the pull request description. It never writes data/events.json.
//
//   node scripts/report-wikidata-drift.js                 prints the report (markdown)
//   node scripts/report-wikidata-drift.js --report=path   also writes it to a file
//
// Requests: one wbgetentities call per 40 items (about 21 for the curated file), one label call per 50
// class items and one English Wikipedia coordinates call per 50 articles whose pin is "wikipedia" (about 6),
// with a pause between calls, through lib/http.js politeFetch (the pipeline's User-Agent).
import { readFile, writeFile } from "node:fs/promises";
import { fetchEntities, fetchLabelsCached } from "./lib/wd-entities.js";
import { FIXES_BY_QID } from "./lib/fixes.js";
import { driftFor, renderDriftReport } from "./lib/drift.js";
import { fetchArticleCoordinates } from "./lib/wiki.js";
import { titleFromWikipediaUrl } from "./lib/lead.js";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const REPORT = arg("report");

const events = JSON.parse(await readFile(new URL("../data/events.json", import.meta.url), "utf-8"));
const withQid = events.filter((e) => e.wikidata_qid);
const log = (m) => console.error(m); // progress on stderr, the report on stdout

const entities = await fetchEntities(
  withQid.map((e) => e.wikidata_qid),
  { props: "claims", log }
);
const classQids = [...new Set([...entities.values()].flatMap((r) => r?.p31 ?? []))];
const labels = await fetchLabelsCached(classQids);
// The articles' current primary coordinates, for the pins taken from them ("wikipedia"; one request per 50 titles).
const articleTitle = (e) => titleFromWikipediaUrl(e.wikipedia_url);
const articles = await fetchArticleCoordinates(
  withQid.filter((e) => e.coordinate_source === "wikipedia" && e.coordinates).map(articleTitle)
);

// A framing review's data note that names Wikidata ("The start date (1916) comes from Wikidata") puts the event's date
// differences first in the report (lib/drift.js dateShownReason).
const reviews = JSON.parse(await readFile(new URL("../data/framing-review.json", import.meta.url), "utf-8")).events ?? {};
const results = withQid.map((e) => ({
  event: e,
  dataNote: reviews[e.id]?.data_note ?? null,
  ...driftFor(e, entities.get(e.wikidata_qid) ?? null, labels, FIXES_BY_QID.get(e.wikidata_qid) ?? null, {
    article: e.coordinate_source === "wikipedia" ? articles.get(articleTitle(e)) : undefined,
  }),
}));
const text = renderDriftReport(results, {
  checked: withQid.length,
  noQid: events.filter((e) => !e.wikidata_qid).map((e) => e.id),
});
process.stdout.write(text);
if (REPORT) await writeFile(REPORT, text);
