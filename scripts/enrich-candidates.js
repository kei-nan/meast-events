// Resolves the discovery candidates (data/event-candidates.json) against Wikipedia +
// Wikidata and produces:
//   data/enriched-candidates.json      every candidate in the batch, with review flags and an
//                                      `exclusion_reason` for those NOT proposed
//   data/events.proposed.json          the events that meet the objective inclusion rule - see
//                                      docs/DATA_POLICY.md. Events without real coordinates (Wikipedia
//                                      or Wikidata P625) are INCLUDED with location_quality "none" and
//                                      coordinates null (never invented). NEVER merged automatically.
//   data/missing-coordinates-report.md curated + candidate events that lack a precise location
//
// PRINCIPLE: minimal interference with Wikipedia/Wikidata data. Titles, extracts, dates,
// countries and labels are copied AS-IS. Automated checks only FLAG (review_reasons) - they never
// overwrite, drop or "fix" anything. The only events left out of the proposed file are those that
// have no Wikipedia summary/extract - each is listed with its reason in enriched-candidates.json.
// Events whose Wikidata dates are contradictory (date_end before date_start) are kept, dates as
// Wikidata gives them, with a date_flags reason.
//
// CLI:
//   --limit=N            only process the first N selected candidates (bounded run)
//   --classes=a,b        only candidates whose Wikidata classes include one of these labels
//   --reuse              reuse already-enriched entries (same QID, enrich_version current)
//                        from the existing data/enriched-candidates.json instead of refetching
//   --no-report          skip data/missing-coordinates-report.md (it costs ~1 request per
//                        curated event lacking precise coordinates)
//   --out-suffix=.test   write *.test.json variants instead of the real output files
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sleep } from "./lib/http.js";
import { compareQids } from "./lib/wdqs.js";
import { buildContext } from "./lib/context.js";
import { finalizeEvent, hasTrackedCountry } from "./lib/v21.js";
import { INCLUSION_MIN_SITELINKS, EVENT_CLASSES } from "./lib/event-classes.js";
import {
  fetchSummary,
  fetchEntity,
  fetchCategories,
  fetchLabels,
  datePrecisionFor,
  precisionName,
  yearsIn,
} from "./lib/wiki.js";
import {
  MAX_COUNTRIES_BEFORE_FLAG,
  categoryYears,
  dateFlags,
  coordinateFlag,
  duplicateHints,
  pruneDuplicateHints,
  monthPrecisionDayFlag,
  MONTH_DAY_FLAG,
} from "./lib/flags.js";
import { keptDatePrecision } from "./lib/fixes.js";
import { validateEvents, borrowedSource, BORROWED_SOURCE } from "./lib/validate.js";

const PRECISION_CODE = Object.fromEntries(Array.from({ length: 15 }, (_, c) => [precisionName(c), c]));
// Replaces the review reason starting with `prefix` in place (keeps the list order stable across re-runs),
// removes it when `text` is null, appends it when absent.
function setReason(list, prefix, text) {
  const i = list.findIndex((r) => r.startsWith(prefix));
  if (i >= 0 && text) list[i] = text;
  else if (i >= 0) list.splice(i, 1);
  else if (text) list.push(text);
}

const ENRICH_VERSION = 3;
const REUSABLE_VERSIONS = [2, 3]; // v2 entries are upgraded by the post-processing step (leads, classes, locations, flags)
const REQUEST_DELAY_MS = 300;
const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const flag = (n) => process.argv.includes(`--${n}`);
const LIMIT = argVal("limit") ? Number(argVal("limit")) : null;
const ONLY_CLASSES = argVal("classes")?.split(",").filter(Boolean) ?? null;
const SUFFIX = argVal("out-suffix") ?? "";

const path = (name) => new URL(`../data/${name}`, import.meta.url);
const outName = (base, ext) => `${base}${SUFFIX}.${ext}`;

const CLASS_GROUP = Object.fromEntries(EVENT_CLASSES.map((c) => [c.label, c.category]));

function slugify(title) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function resolveCandidate(candidate, index, total) {
  const label = `[${index + 1}/${total}] ${candidate.wikipedia_title}`;
  const classes = candidate.wikidata_classes ?? [];
  const base = {
    id: slugify(candidate.wikipedia_title) || candidate.wikidata_qid.toLowerCase(),
    title: candidate.wikipedia_title,
    date_start: candidate.date_start,
    date_end: candidate.date_end,
    countries: candidate.countries,
    // Category is Wikidata's own class label (first class the item was found under).
    category: classes[0] ?? candidate.category,
    category_group: CLASS_GROUP[classes[0]] ?? candidate.category,
    wikidata_classes: classes,
    retrieved_at: new Date().toISOString(),
    source_qid: candidate.wikidata_qid,
    sitelinks: candidate.sitelinks,
    wikidata_description: candidate.wikidata_description ?? null,
    enrich_version: ENRICH_VERSION,
  };
  const reasons = [];

  const summary = await fetchSummary(candidate.wikipedia_title);
  await sleep(REQUEST_DELAY_MS);
  if (!summary) {
    console.log(`${label} -> FAILED (no Wikipedia summary)`);
    return {
      ...base, wikidata_qid: candidate.wikidata_qid, wikipedia_url: null, extract: null,
      coordinates: null, coordinate_source: null, needs_manual_coordinates: true,
      needs_review: true, review_reasons: ["summary_not_found"], error: "summary_not_found",
      exclusion_reason: "no_wikipedia_summary",
    };
  }

  const resolvedQid = summary.wikibase_item ?? null;
  if (resolvedQid && resolvedQid !== candidate.wikidata_qid) {
    reasons.push(
      `qid_mismatch: title resolved to ${resolvedQid}, candidate was discovered under ${candidate.wikidata_qid} (possible redirect/disambiguation)`
    );
  }

  const entity = await fetchEntity(candidate.wikidata_qid);
  await sleep(REQUEST_DELAY_MS);
  const cats = await fetchCategories(candidate.wikipedia_title);
  await sleep(REQUEST_DELAY_MS);

  // When the title resolves to a different item (a redirect to a broader article), the summary is
  // THAT article's, so its coordinates - like the other item's P625 below - are not the event's
  // own: they are recorded as coordinate_source "redirect_target" (borrowedSource), which the
  // validator always warns about. Whether to keep such pins is the owner's open decision.
  const otherItem = Boolean(resolvedQid && resolvedQid !== candidate.wikidata_qid);
  let coordinates = summary.coordinates ? { lat: summary.coordinates.lat, lon: summary.coordinates.lon } : null;
  let coordinateSource = coordinates ? borrowedSource("wikipedia", otherItem) : null;
  if (!coordinates && entity?.coordinates) {
    coordinates = entity.coordinates;
    coordinateSource = "wikidata"; // the event's own item
  }
  if (!coordinates && otherItem) {
    const other = await fetchEntity(resolvedQid);
    await sleep(REQUEST_DELAY_MS);
    if (other?.coordinates) {
      coordinates = other.coordinates;
      coordinateSource = BORROWED_SOURCE;
    }
  }
  // v2.1: no capital-fallback pin for discovered events. No real coordinates => coordinates null and
  // location_quality "none" (never invented); the event is still proposed.
  const hasRealCoordinates = Boolean(coordinates);

  const precision = datePrecisionFor(entity, candidate.date_start);
  if (precision && precision.code < 9) {
    reasons.push(`date_precision_coarse: Wikidata records the date only to ${precision.name} precision`);
  }

  reasons.push(
    ...dateFlags({
      dateStart: candidate.date_start,
      dateEnd: candidate.date_end,
      extractYears: yearsIn(summary.extract),
      catYears: categoryYears(cats),
    })
  );

  if (hasRealCoordinates) {
    const cf = coordinateFlag(coordinates, candidate.countries);
    if (cf) reasons.push(cf);
  }
  if ((candidate.countries?.length ?? 0) > MAX_COUNTRIES_BEFORE_FLAG) {
    reasons.push(
      `many_countries: ${candidate.countries.length} countries tagged (kept exactly as Wikidata lists them; verify the event really concerns all of them)`
    );
  }

  const partOfQids = entity?.partOf ?? [];
  console.log(
    `${label} -> ok (${coordinateSource ?? "no coordinates"}${precision ? `, date ${precision.name}` : ""})${
      reasons.length ? ` [${reasons.map((r) => r.split(":")[0]).join(", ")}]` : ""
    }`
  );

  return {
    ...base,
    wikidata_qid: candidate.wikidata_qid,
    resolved_qid: resolvedQid,
    wikipedia_url: summary.content_urls?.desktop?.page ?? null,
    extract: summary.extract ?? null,
    coordinates,
    coordinate_source: coordinateSource,
    location_quality: hasRealCoordinates ? "precise" : "none",
    needs_manual_coordinates: !hasRealCoordinates,
    date_precision: precision?.name ?? null,
    _part_of_qids: partOfQids,
    _review: reasons,
  };
}

function exclusionReason(r) {
  if (r.error) return "no_wikipedia_summary";
  if (!r.extract || !r.extract.trim()) return "empty_extract";
  if (!hasTrackedCountry(r)) return "no_tracked_country"; // inclusion rule 2, after the location rule and fixes
  return null; // v2.1: no-coordinate and date-order-invalid events are kept (flagged), not excluded
}

async function loadJson(name, fallback = []) {
  const p = path(name);
  return existsSync(p) ? JSON.parse(await readFile(p, "utf-8")) : fallback;
}

const mdEscape = (s) => String(s ?? "").replace(/\|/g, "\\|");

async function writeMissingReport({ curated, enriched, dataAsOf }) {
  const wdLink = (q) => (q ? `[${q}](https://www.wikidata.org/wiki/${q})` : "-");
  const fallbackLabel = (e) =>
    e.coordinates ? `pin at ${String(e.coordinate_source).replace("country-fallback:", "")} capital (approximate)` : "no location";

  // Curated events without a precise location.
  const curatedMissing = curated.filter(
    (e) => !e.coordinates || String(e.coordinate_source ?? "").startsWith("country-fallback")
  );
  console.log(`Missing-coordinates report: fetching sitelinks for ${curatedMissing.length} curated events...`);
  const rowsCurated = [];
  for (const e of curatedMissing) {
    let sitelinks = null;
    if (e.wikidata_qid) {
      const ent = await fetchEntity(e.wikidata_qid).catch(() => null);
      sitelinks = ent?.sitelinks ?? null;
      await sleep(REQUEST_DELAY_MS);
    }
    rowsCurated.push({ e, sitelinks });
  }
  rowsCurated.sort((a, b) => (b.sitelinks ?? -1) - (a.sitelinks ?? -1) || compareQids(a.e.wikidata_qid, b.e.wikidata_qid));

  const candMissing = enriched
    .filter((r) => r.location_quality === "none")
    .sort((a, b) => (b.sitelinks ?? 0) - (a.sitelinks ?? 0) || compareQids(a.wikidata_qid, b.wikidata_qid));

  const table = (rows) =>
    [
      "| # | Event | Date | Sitelinks | Current fallback | Wikipedia | Wikidata |",
      "|---|---|---|---|---|---|---|",
      ...rows.map(
        (r, i) =>
          `| ${i + 1} | ${mdEscape(r.title)} | ${r.date_start ?? ""} | ${r.sitelinks ?? "?"} | ${fallbackLabel(r)} | ${
            r.wikipedia_url ? `[article](${r.wikipedia_url})` : "-"
          } | ${wdLink(r.wikidata_qid)} |`
      ),
    ].join("\n");

  const md = `# Events without a precise location

Generated by \`node scripts/enrich-candidates.js\` from candidate data retrieved up to ${dataAsOf ?? "(unknown)"}.

These events have **no coordinates on Wikipedia or Wikidata**, so middleeast.events can only pin them at a
country-capital fallback (curated events only, labelled "approximate location") or not at all. Candidate events in
the second table ARE included in \`data/events.proposed.json\` with \`location_quality: "none"\` and
\`coordinates: null\` (listed and searchable, but no map marker; a location is never invented).

The fix belongs upstream: if you know the real location of an event, you can add a coordinate location
(property **P625**) to its Wikidata item (linked below) with a reference. This pipeline never invents
coordinates and never edits Wikipedia or Wikidata. Rows are sorted by significance = number of Wikimedia
sitelinks (the same objective signal used for inclusion; it is a proxy, see docs/DATA_POLICY.md).

## 1. Curated events (data/events.json) lacking a precise location - ${rowsCurated.length}

${table(rowsCurated.map(({ e, sitelinks }) => ({ ...e, sitelinks })))}

## 2. Discovered candidates (sitelinks >= ${INCLUSION_MIN_SITELINKS}) proposed with location_quality "none" (no real location) - ${candMissing.length}

${table(candMissing)}
`;
  await writeFile(path(outName("missing-coordinates-report", "md")), md);
  return { curated: rowsCurated.length, candidates: candMissing.length };
}

async function main() {
  const allCandidates = await loadJson("event-candidates.json");
  let batch = allCandidates.filter(
    (c) => c.has_en_wikipedia && c.sitelinks >= INCLUSION_MIN_SITELINKS && !c.already_curated
  );
  if (ONLY_CLASSES) batch = batch.filter((c) => (c.wikidata_classes ?? []).some((l) => ONLY_CLASSES.includes(l)));
  if (LIMIT) batch = batch.slice(0, LIMIT);
  console.log(
    `Loaded ${allCandidates.length} candidates; ${batch.length} selected (English article, sitelinks >= ${INCLUSION_MIN_SITELINKS}, not already curated${
      ONLY_CLASSES ? `, classes: ${ONLY_CLASSES.join("/")}` : ""
    }${LIMIT ? `, limit ${LIMIT}` : ""}).\n`
  );

  const cache = new Map();
  if (flag("reuse")) {
    for (const r of await loadJson("enriched-candidates.json")) {
      if (REUSABLE_VERSIONS.includes(r.enrich_version) && r._review) cache.set(r.wikidata_qid, r);
    }
    console.log(`Reuse: ${cache.size} cached enriched entries available.`);
  }

  const results = [];
  for (let i = 0; i < batch.length; i++) {
    const cached = cache.get(batch[i].wikidata_qid);
    if (cached) {
      results.push(cached);
      continue;
    }
    try {
      results.push(await resolveCandidate(batch[i], i, batch.length));
    } catch (err) {
      console.log(`[${i + 1}/${batch.length}] ${batch[i].wikipedia_title} -> FAILED (${err.message})`);
      results.push({
        id: slugify(batch[i].wikipedia_title) || batch[i].wikidata_qid.toLowerCase(),
        title: batch[i].wikipedia_title, date_start: batch[i].date_start, date_end: batch[i].date_end,
        countries: batch[i].countries, category: (batch[i].wikidata_classes ?? [])[0] ?? batch[i].category,
        source_qid: batch[i].wikidata_qid, wikidata_qid: batch[i].wikidata_qid, sitelinks: batch[i].sitelinks,
        wikipedia_url: null, extract: null, coordinates: null, coordinate_source: null,
        needs_manual_coordinates: true, error: err.message, enrich_version: ENRICH_VERSION,
        _review: ["exception: " + err.message], _part_of_qids: [], exclusion_reason: "fetch_error",
      });
    }
  }

  // ---- unique ids (never rename silently: suffix with the QID on a clash) ----
  const curated = await loadJson("events.json");
  // An id already held by the SAME Wikidata item (already merged into the curated file) is kept as is (ids are
  // stable); only a clash with a different item is disambiguated with the QID.
  const takenIds = new Map(curated.map((e) => [e.id, e.wikidata_qid]));
  const curatedQids = new Set(curated.map((e) => e.wikidata_qid));
  for (const r of results) {
    if (takenIds.has(r.id) && takenIds.get(r.id) !== r.wikidata_qid) r.id = `${r.id}-${r.wikidata_qid.toLowerCase()}`;
    takenIds.set(r.id, r.wikidata_qid);
  }

  // ---- part-of labels ----
  const labels = await fetchLabels([...new Set(results.flatMap((r) => r._part_of_qids ?? []))]);
  for (const r of results) {
    r.part_of = (r._part_of_qids ?? []).map((q) => ({ qid: q, label: labels[q] ?? null }));
    r._review = r._review.filter((x) => !x.startsWith("part_of:"));
    for (const p of r.part_of) {
      r._review.push(
        `part_of: Wikidata (P361) lists this event as part of "${p.label ?? p.qid}" (${p.qid}); it may overlap with that larger event`
      );
    }
  }

  // ---- duplicate hints (hints only; nothing is dropped) ----
  const pool = [
    ...curated.filter((e) => !results.some((r) => r.wikidata_qid === e.wikidata_qid)).map((e) => ({
      ...e, precise: e.coordinates && !String(e.coordinate_source ?? "").startsWith("country-fallback"),
    })),
    ...results.map((r) => ({ ...r, precise: r.location_quality === "precise" })),
  ];
  const hints = duplicateHints(pool, new Set(results.map((r) => r.id)));
  for (const r of results) {
    r.possible_duplicates = hints.get(r.id) ?? [];
    r._review = r._review.filter((x) => !x.startsWith("possible_duplicate"));
    for (const h of r.possible_duplicates) {
      r._review.push(`possible_duplicate: possible duplicate of "${h.title}" (${h.id}) - ${h.reason}`);
    }
  }

  // ---- v2.1: real-coordinates-only locations, full lead, all Wikidata classes, flags ----
  for (const r of results) {
    // entries cached by an older version carry a capital-fallback pin: it is not a real location
    if (String(r.coordinate_source ?? "").startsWith("country-fallback")) {
      r.coordinates = null;
      r.coordinate_source = null;
    }
    // entries cached (--reuse) before "redirect_target" existed: Wikipedia coordinates of an article
    // that belongs to another item are relabelled (the point itself is unchanged). A cached
    // "wikidata" point with another resolved item cannot be told apart (own P625 or the other
    // item's) and keeps its label.
    if (r.coordinates) r.coordinate_source = borrowedSource(r.coordinate_source, Boolean(r.resolved_qid && r.resolved_qid !== r.wikidata_qid));
    if (!r.error) r.location_quality = r.coordinates ? "precise" : "none";
    if (!r.error) r.needs_manual_coordinates = !r.coordinates;
  }
  const batchByQid = new Map(batch.map((c) => [c.wikidata_qid, c]));
  const okResults = results.filter((r) => !r.error && r.wikipedia_url);
  const ctx = await buildContext(okResults, {
    candidates: allCandidates,
    reconcileDates: true,
    log: (m) => process.stdout.write(`
${m}      `),
  });
  console.log();
  for (const r of okResults) {
    // Always start from Wikidata/discovery's own date and recompute date flags, so re-runs (--reuse) are idempotent.
    const src = batchByQid.get(r.wikidata_qid);
    if (src) {
      r.date_start = src.date_start;
      r.date_end = src.date_end;
    }
    delete r.date_flags;
    r.review_reasons = r._review;
    // events already merged into the curated file keep the dates as merged (no source reconciliation here)
    finalizeEvent(r, { ...ctx, reconcileDates: !curatedQids.has(r.wikidata_qid) });
    // date_precision must describe the date actually KEPT (after source reconciliation and the fix ledger), not the
    // discovery date it may have replaced (e.g. 1948 Arab-Israeli War: decade-precision P585 "1940" replaced by the
    // day-precision P580 1948-05-15). If the kept date is no Wikidata P585/P580 value, the discovery precision still
    // applies when the date is the discovery date; otherwise no precision can be derived (null).
    const kept = keptDatePrecision(ctx.entities.get(r.wikidata_qid), r.date_start);
    if (kept) r.date_precision = kept.name;
    else if (!src || r.date_start !== src.date_start) r.date_precision = null;
    const code = PRECISION_CODE[r.date_precision];
    setReason(r.review_reasons, "date_precision_coarse",
      code != null && code < 9 ? `date_precision_coarse: Wikidata records the date only to ${r.date_precision} precision` : null);
    setReason(r.review_reasons, MONTH_DAY_FLAG, monthPrecisionDayFlag(r));
    r._review = r.review_reasons;
  }

  // ---- finalise ----
  for (const r of results) if (!r.error) r.exclusion_reason = exclusionReason(r);
  // Duplicate hints may only point at records that are published next to the event: curated events and proposed
  // events that are neither excluded here nor left out by review (data/proposed-exclusions.json). A hint to a record
  // that is never published is a dangling id (e.g. october-7-attacks -> ein-hashlosha-massacre, a redirect duplicate
  // excluded by review).
  const reviewExcluded = new Set((await loadJson("proposed-exclusions.json")).map((x) => x.id));
  const published = new Set([
    ...curated.map((e) => e.id),
    ...results.filter((r) => !r.exclusion_reason && !reviewExcluded.has(r.id)).map((r) => r.id),
  ]);
  for (const r of results) {
    pruneDuplicateHints(r, published, "_review");
    r.review_reasons = r._review;
    r.needs_review = r.review_reasons.length > 0 || (r.date_flags?.length ?? 0) > 0;
  }
  const strip = ({ _review, _part_of_qids, ...rest }) => rest;
  const persist = results.map((r) => ({ ...strip(r), _review: r._review, _part_of_qids: r._part_of_qids }));

  const proposed = results
    .filter((r) => !r.exclusion_reason)
    .map((r) => {
      const {
        exclusion_reason: _exclusionReason,
        error: _error,
        _review,
        _part_of_qids,
        source_qid: _sourceQid,
        enrich_version: _enrichVersion,
        wikidata_description,
        ...ev
      } = r;
      return { ...ev, wikidata_description };
    })
    .sort((a, b) => a.date_start.localeCompare(b.date_start) || compareQids(a.wikidata_qid, b.wikidata_qid));

  const { errors } = validateEvents(proposed, { name: "events.proposed" });
  if (errors.length) console.warn(`WARNING: proposed set failed validation:\n  ${errors.slice(0, 20).join("\n  ")}`);

  await writeFile(path(outName("enriched-candidates", "json")), JSON.stringify(persist, null, 2));
  await writeFile(path(outName("events.proposed", "json")), JSON.stringify(proposed, null, 2));

  let report = null;
  if (!flag("no-report")) {
    // Dated by the newest retrieval in the data, not the wall clock, so unchanged input gives an
    // unchanged report.
    const dataAsOf = results.map((r) => r.retrieved_at).filter(Boolean).sort().at(-1) ?? null;
    report = await writeMissingReport({ curated, enriched: results, dataAsOf });
  }

  const byReason = {};
  for (const r of results) if (r.exclusion_reason) byReason[r.exclusion_reason] = (byReason[r.exclusion_reason] ?? 0) + 1;
  const flagCounts = {};
  for (const p of proposed) for (const x of p.review_reasons) flagCounts[x.split(":")[0]] = (flagCounts[x.split(":")[0]] ?? 0) + 1;
  console.log(`\nDone. Enriched ${results.length} candidates.`);
  console.log(`  Proposed (real coordinates, valid): ${proposed.length}   (${proposed.filter((p) => p.needs_review).length} carry review flags)`);
  console.log(`  Excluded: ${results.length - proposed.length}`, byReason);
  console.log(`  Flags on proposed events:`, flagCounts);
  if (report) console.log(`  Missing-coordinates report: ${report.curated} curated, ${report.candidates} candidates`);
  console.log(`Wrote data/${outName("events.proposed", "json")} and data/${outName("enriched-candidates", "json")}`);
}

main();
