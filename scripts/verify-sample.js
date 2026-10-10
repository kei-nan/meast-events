// Import-fidelity check: draws a SEEDED random sample of data/events.proposed.json, re-fetches
// each event live from Wikipedia + Wikidata, and diffs field by field against what we hold, to
// confirm the pipeline copied source data faithfully. Writes data/import-verification-sample.md.
//
//   node scripts/verify-sample.js [--n=40] [--seed=20260926]
//
// Differences can be genuine copy errors OR upstream edits made since `retrieved_at`
// (Wikipedia/Wikidata are live). Both are reported; the report does not try to tell them apart
// beyond showing the values.
import { readFile, writeFile } from "node:fs/promises";
import { sleep } from "./lib/http.js";
import { runSparql } from "./lib/wdqs.js";
import { fetchSummary } from "./lib/wiki.js";
import { EVENT_CLASSES, QID_TO_COUNTRY, ALL_COUNTRY_QIDS } from "./lib/event-classes.js";

const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const N = Number(argVal("n") ?? 40);
const SEED = Number(argVal("seed") ?? 20260926);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(arr, n, seed) {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const cv = ALL_COUNTRY_QIDS.map((q) => `wd:${q}`).join(" ");
const day = (v) => v?.slice(0, 10) ?? null;
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-4;

async function liveWikidata(qid) {
  const rows = await runSparql(`
SELECT ?pit ?start ?end ?coord ?country ?class WHERE {
  BIND(wd:${qid} AS ?item)
  OPTIONAL { ?item wdt:P585 ?pit }
  OPTIONAL { ?item wdt:P580 ?start }
  OPTIONAL { ?item wdt:P582 ?end }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL {
    VALUES ?country { ${cv} }
    { ?item wdt:P17 ?country } UNION { ?item wdt:P276 ?l . ?l wdt:P17 ?country } UNION { ?item wdt:P131 ?l . ?l wdt:P17 ?country }
  }
  OPTIONAL { ?item wdt:P31/wdt:P279* ?class . VALUES ?class { ${EVENT_CLASSES.map((c) => `wd:${c.qid}`).join(" ")} } }
}`);
  const pick = (k) => [...new Set(rows.map((r) => r[k]?.value).filter(Boolean))];
  return {
    dates: pick("pit").concat(pick("start")).map(day),
    ends: pick("end").map(day),
    coords: pick("coord").map((w) => {
      const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(w);
      return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
    }).filter(Boolean),
    countries: [...new Set(pick("country").map((u) => QID_TO_COUNTRY[u.split("/").pop()]).filter(Boolean))],
    classes: pick("class").map((u) => u.split("/").pop()),
  };
}

const proposed = JSON.parse(await readFile(new URL("../data/events.proposed.json", import.meta.url), "utf-8"));
const picked = sample(proposed, Math.min(N, proposed.length), SEED);
const FIELDS = ["title", "extract", "wikipedia_url", "wikidata_qid", "date_start", "date_end", "countries", "category", "coordinates"];
const stats = Object.fromEntries(FIELDS.map((f) => [f, { checked: 0, mismatch: 0 }]));
const details = [];

for (let i = 0; i < picked.length; i++) {
  const e = picked[i];
  const diffs = [];
  const check = (field, ok, ours, live) => {
    stats[field].checked++;
    if (!ok) {
      stats[field].mismatch++;
      diffs.push({ field, ours, live });
    }
  };
  try {
    const s = await fetchSummary(e.title);
    await sleep(300);
    const w = await liveWikidata(e.wikidata_qid);
    await sleep(1500);

    check("title", s?.title === e.title, e.title, s?.title ?? null);
    check("extract", s?.extract === e.extract, e.extract, s?.extract ?? null);
    check("wikipedia_url", s?.content_urls?.desktop?.page === e.wikipedia_url, e.wikipedia_url, s?.content_urls?.desktop?.page ?? null);
    check("wikidata_qid", (s?.wikibase_item ?? null) === (e.resolved_qid ?? e.wikidata_qid), e.resolved_qid ?? e.wikidata_qid, s?.wikibase_item ?? null);
    check("date_start", w.dates.includes(e.date_start), e.date_start, w.dates.join(" | ") || null);
    if (e.date_end) check("date_end", w.ends.includes(e.date_end), e.date_end, w.ends.join(" | ") || null);
    else check("date_end", w.ends.length === 0, null, w.ends.join(" | ") || null);
    const ourC = [...e.countries].sort().join(",");
    const liveC = [...w.countries].sort().join(",");
    check("countries", ourC === liveC, e.countries, w.countries);
    const cls = EVENT_CLASSES.find((c) => c.label === e.category);
    check("category", Boolean(cls) && w.classes.includes(cls.qid), e.category, w.classes.join(","));
    const liveCoord = s?.coordinates ? { lat: s.coordinates.lat, lon: s.coordinates.lon } : w.coords[0];
    check(
      "coordinates",
      Boolean(liveCoord) && near(liveCoord.lat, e.coordinates.lat) && near(liveCoord.lon, e.coordinates.lon),
      e.coordinates,
      liveCoord ?? null
    );
  } catch (err) {
    details.push({ e, error: err.message });
    console.log(`[${i + 1}/${picked.length}] ${e.title} -> ERROR ${err.message}`);
    continue;
  }
  details.push({ e, diffs });
  console.log(`[${i + 1}/${picked.length}] ${e.title} -> ${diffs.length ? "MISMATCH " + diffs.map((d) => d.field).join(",") : "match"}`);
}

const clip = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s == null ? "null" : s.length > 160 ? s.slice(0, 157) + "..." : s;
};
const totalChecks = Object.values(stats).reduce((a, s) => a + s.checked, 0);
const totalMis = Object.values(stats).reduce((a, s) => a + s.mismatch, 0);
const evMis = details.filter((d) => d.diffs?.length).length;
const errored = details.filter((d) => d.error).length;
const ok = details.length - errored;

// Dated by the input (newest retrieved_at in the proposed file), not the wall clock.
const dataAsOf = proposed.map((e) => e.retrieved_at).filter(Boolean).sort().at(-1) ?? null;

const md = `# Import verification sample

Generated by \`node scripts/verify-sample.js\` for the proposed data retrieved up to ${dataAsOf ?? "(unknown)"}; the live values are those of the run.

**Method.** A random sample of ${picked.length} of the ${proposed.length} events in \`data/events.proposed.json\`, drawn with a seeded
Mulberry32 shuffle (seed \`${SEED}\`; re-running with the same seed and the same proposed file selects the same events).
Each was re-fetched live (Wikipedia REST summary; Wikidata SPARQL for dates P585/P580/P582, coordinates P625, countries via
P17 / P276->P17 / P131->P17, and event class via P31/P279*) and compared field by field with what we hold.
Comparison is exact (coordinates to 1e-4 degrees; dates by day; countries as sets).

**Caveat.** Wikipedia and Wikidata are live, and our copy has a \`retrieved_at\` timestamp. A mismatch is either a copy error or
an upstream edit since retrieval; this report shows both values so you can judge. The \`category\` check verifies our label is
one of the item's Wikidata classes, and the \`countries\` check re-runs discovery's own 3-path location rule.

## Result

- Events checked: ${ok} (${errored} could not be checked because of errors)
- Events with at least one field mismatch: **${evMis} of ${ok} (${ok ? ((evMis / ok) * 100).toFixed(1) : 0}%)**
- Field comparisons: ${totalChecks}; mismatching: **${totalMis} (${totalChecks ? ((totalMis / totalChecks) * 100).toFixed(1) : 0}%)**

| Field | Checked | Mismatched | Rate |
|---|---|---|---|
${FIELDS.map((f) => `| ${f} | ${stats[f].checked} | ${stats[f].mismatch} | ${stats[f].checked ? ((stats[f].mismatch / stats[f].checked) * 100).toFixed(1) : 0}% |`).join("\n")}

## Mismatch details

${
  details.filter((d) => d.diffs?.length || d.error).length === 0
    ? "_None._"
    : details
        .filter((d) => d.diffs?.length || d.error)
        .map((d) =>
          d.error
            ? `### ${d.e.title} (${d.e.wikidata_qid})\n- ERROR: ${d.error}`
            : `### ${d.e.title} (${d.e.wikidata_qid}, retrieved ${d.e.retrieved_at})\n${d.diffs
                .map((x) => `- **${x.field}**\n  - ours: \`${clip(x.ours).replace(/`/g, "'")}\`\n  - live: \`${clip(x.live).replace(/`/g, "'")}\``)
                .join("\n")}`
        )
        .join("\n\n")
}

## Events in the sample

${details.map((d) => `- ${d.e.title} (${d.e.wikidata_qid}) - ${d.error ? "error" : d.diffs.length ? "mismatch: " + d.diffs.map((x) => x.field).join(", ") : "all fields match"}`).join("\n")}
`;
await writeFile(new URL("../data/import-verification-sample.md", import.meta.url), md);
console.log(`\nEvents with a mismatch: ${evMis}/${ok}; field mismatches ${totalMis}/${totalChecks}. Wrote data/import-verification-sample.md`);
