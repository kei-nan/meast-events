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
//   --classes=a,b        only candidates whose Wikidata classes include one of these labels (bounded run)
//                        A bounded run must be given --keep-existing or --out-suffix: written over the real
//                        output files, its subset would drop every other record (the run refuses to start).
//   --reuse              reuse already-enriched entries (same QID and title, enrich_version current, no error)
//                        from the existing data/enriched-candidates.json instead of refetching; countries,
//                        sitelinks, classes and description are re-applied from the current candidate
//   --no-report          skip data/missing-coordinates-report.md (no network; the same report
//                        node scripts/build-missing-coordinates-report.js writes)
//   --out-suffix=.test   write *.test.json variants instead of the real output files
//   --keep-existing      keep every record already in the output files as it is and only add new candidates
//                        (see keepExisting below)
//
// FAILURES: a candidate whose fetch fails (network or API error) is not an exclusion. If any fetch failed, or the
// proposed set fails validation, the run exits non-zero and writes none of the real output files (with --out-suffix
// the suffixed files are still written, for inspection). Re-run; nothing is cached from a failed fetch.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sleep } from "./lib/http.js";
import { compareQids } from "./lib/wdqs.js";
import { buildContext } from "./lib/context.js";
import { finalizeEvent, hasTrackedCountry } from "./lib/v21.js";
import { INCLUSION_MIN_SITELINKS, notEventClasses } from "./lib/event-classes.js";
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
  categoryYears,
  dateFlags,
  coordinateFlag,
  duplicateHints,
  pruneDuplicateHints,
  monthPrecisionDayFlag,
  MONTH_DAY_FLAG,
  titleYearsFlag,
  TITLE_YEARS_FLAG,
  lowPrecisionCoordinateFlag,
  LOW_PRECISION_FLAG,
} from "./lib/flags.js";
import { keptDatePrecision } from "./lib/fixes.js";
import { renderMissingReport } from "./lib/missing-report.js";
import { refreshOrderFlags } from "./lib/order-flags.js";
import { slugify } from "./lib/slug.js";
import { validateEvents, borrowedSource, BORROWED_SOURCE } from "./lib/validate.js";
// setReason: replaces the review reason starting with `prefix` in place (keeps the list order stable across re-runs),
// removes it when `text` is null, appends it when absent.
import {
  boundedRunError,
  candidateFields,
  fetchErrors,
  manyCountriesFlag,
  reuseRecord,
  setReason,
  FETCH_ERROR,
} from "./lib/enrich-run.js";

const PRECISION_CODE = Object.fromEntries(Array.from({ length: 15 }, (_, c) => [precisionName(c), c]));

const ENRICH_VERSION = 3;
const REUSABLE_VERSIONS = [2, 3]; // v2 entries are upgraded by the post-processing step (leads, classes, locations, flags)
const REQUEST_DELAY_MS = 300;
const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const flag = (n) => process.argv.includes(`--${n}`);
const LIMIT = argVal("limit") ? Number(argVal("limit")) : null;
const ONLY_CLASSES = argVal("classes")?.split(",").filter(Boolean) ?? null;
const SUFFIX = argVal("out-suffix") ?? "";
const KEEP_EXISTING = flag("keep-existing");

const path = (name) => new URL(`../data/${name}`, import.meta.url);
const outName = (base, ext) => `${base}${SUFFIX}.${ext}`;

async function resolveCandidate(candidate, index, total) {
  const label = `[${index + 1}/${total}] ${candidate.wikipedia_title}`;
  const { title, countries, category, category_group, wikidata_classes, sitelinks, wikidata_description } =
    candidateFields(candidate);
  const base = {
    id: slugify(candidate.wikipedia_title) || candidate.wikidata_qid.toLowerCase(),
    title,
    date_start: candidate.date_start,
    date_end: candidate.date_end,
    countries,
    category,
    category_group,
    wikidata_classes,
    retrieved_at: new Date().toISOString(),
    source_qid: candidate.wikidata_qid,
    sitelinks,
    wikidata_description,
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
      // _review / _part_of_qids like every other record (the post-processing steps read both).
      needs_review: true, _review: ["summary_not_found"], _part_of_qids: [], error: "summary_not_found",
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

  // Only the event's OWN location is used (owner's rule, 2026-10-10; docs/data-fixes.md F11). When the
  // title resolves to a different item (a redirect to a broader article), the summary is THAT article's,
  // so its coordinates are not the event's: only the event item's own P625 counts, else no location.
  const otherItem = Boolean(resolvedQid && resolvedQid !== candidate.wikidata_qid);
  let coordinates = summary.coordinates && !otherItem ? { lat: summary.coordinates.lat, lon: summary.coordinates.lon } : null;
  let coordinateSource = coordinates ? "wikipedia" : null;
  if (!coordinates && entity?.coordinates) {
    coordinates = entity.coordinates;
    coordinateSource = "wikidata"; // the event's own item
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
  const many = manyCountriesFlag(candidate.countries);
  if (many) reasons.push(many);

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
  if (notEventClasses(r.wikidata_classes).length) return "not_an_event"; // a person, organisation, state or country history
  return null; // v2.1: no-coordinate and date-order-invalid events are kept (flagged), not excluded
}

async function loadJson(name, fallback = []) {
  const p = path(name);
  return existsSync(p) ? JSON.parse(await readFile(p, "utf-8")) : fallback;
}

// data/missing-coordinates-report.md: the same pure function scripts/build-missing-coordinates-report.js uses (no
// network; stored sitelink counts), applied to the curated file and the proposed set just written.
async function writeMissingReport({ curated, proposed }) {
  const { md, curated: nc, proposed: np } = renderMissingReport({ curated, proposed });
  await writeFile(path(outName("missing-coordinates-report", "md")), md);
  return { curated: nc, candidates: np };
}

// --keep-existing: records already in data/events.proposed.json / data/enriched-candidates.json stay as they are,
// except their date-order flags (date_order_invalid, date_end_precision_coarse, wikipedia_dates_note,
// wikipedia_lead_dates), which take this run's values when the dates and text are the same (lib/order-flags.js);
// only candidates new to the files are added (proposed: at their place in the date order; enriched: at the end). A full run re-derives every record, which also re-derives what was applied at merge time (data fixes,
// redirect notes), so a bounded addition uses this.
async function keepExisting({ proposed, persist }) {
  const oldProposed = await loadJson(outName("events.proposed", "json"));
  const oldEnriched = await loadJson(outName("enriched-candidates", "json"));
  const inProposed = new Set(oldProposed.map((e) => e.wikidata_qid));
  const inEnriched = new Set(oldEnriched.map((e) => e.wikidata_qid));
  const byDate = (a, b) => a.date_start.localeCompare(b.date_start) || compareQids(a.wikidata_qid, b.wikidata_qid);
  const freshProposed = new Map(proposed.map((e) => [e.wikidata_qid, e]));
  const freshEnriched = new Map(persist.map((r) => [r.wikidata_qid, r]));
  const refreshed = oldProposed.filter((e) => refreshOrderFlags(e, freshProposed.get(e.wikidata_qid))).map((e) => e.id);
  for (const r of oldEnriched) refreshOrderFlags(r, freshEnriched.get(r.wikidata_qid));
  if (refreshed.length) console.log(`--keep-existing: date-order flags re-derived for ${refreshed.join(", ")}`);
  const outProposed = [...oldProposed];
  const added = proposed.filter((e) => !inProposed.has(e.wikidata_qid));
  for (const e of added) {
    const at = outProposed.findIndex((o) => byDate(e, o) < 0);
    outProposed.splice(at < 0 ? outProposed.length : at, 0, e);
  }
  const outEnriched = [...oldEnriched, ...persist.filter((r) => !inEnriched.has(r.wikidata_qid))];
  console.log(`--keep-existing: kept ${oldProposed.length} proposed records; added ${added.map((e) => e.id).join(", ") || "none"}`);
  return { proposed: outProposed, persist: outEnriched };
}

// A run that must not write the real output files: the reason is printed and the process exits 1 before any write.
function refuse(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

async function main() {
  // Before any network request: a bounded run would overwrite the real files with its subset.
  const bounded = boundedRunError({ limit: LIMIT, classes: ONLY_CLASSES, keepExisting: KEEP_EXISTING, outSuffix: SUFFIX });
  if (bounded) refuse(bounded);
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

  // --reuse: records with an error (failed fetch, missing summary) are never reused; see lib/enrich-run.js reuseRecord.
  const cache = new Map();
  if (flag("reuse")) {
    for (const r of await loadJson("enriched-candidates.json")) {
      if (REUSABLE_VERSIONS.includes(r.enrich_version) && r._review && !r.error) cache.set(r.wikidata_qid, r);
    }
    console.log(`Reuse: ${cache.size} cached enriched entries available.`);
  }

  const results = [];
  for (let i = 0; i < batch.length; i++) {
    const cached = reuseRecord(cache.get(batch[i].wikidata_qid), batch[i], REUSABLE_VERSIONS);
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
        _review: ["exception: " + err.message], _part_of_qids: [], exclusion_reason: FETCH_ERROR,
      });
    }
  }

  // A failed fetch is not an exclusion: written out, the event would silently drop out of the proposed file.
  const failed = fetchErrors(results);
  const reportFailed = () => {
    console.error(`\n${failed.length} candidate fetch${failed.length === 1 ? "" : "es"} failed:`);
    for (const r of failed) console.error(`  ${r.wikidata_qid} ${r.title}: ${r.error}`);
  };
  if (failed.length && !SUFFIX) {
    reportFailed();
    refuse("data/events.proposed.json and data/enriched-candidates.json were NOT written. Re-run (nothing was cached from the failed fetches).");
  }

  // ---- unique ids (never rename silently: suffix with the QID on a clash) ----
  const curated = await loadJson("events.json");
  // An id already held by the SAME Wikidata item (already merged into the curated file) is kept as is (ids are
  // stable); only a clash with a different item is disambiguated with the QID.
  const takenIds = new Map(curated.map((e) => [e.id, e.wikidata_qid]));
  const curatedByQid = new Map(curated.map((e) => [e.wikidata_qid, e]));
  for (const r of results) {
    // An item already in the curated file keeps the id it has there, whatever its title slugifies to now
    // (lib/slug.js may spell a title differently than when that id was made, e.g. "dawson-s-field-hijackings").
    const existing = curatedByQid.get(r.wikidata_qid);
    if (existing) r.id = existing.id;
    else if (takenIds.has(r.id) && takenIds.get(r.id) !== r.wikidata_qid) r.id = `${r.id}-${r.wikidata_qid.toLowerCase()}`;
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
    // entries cached (--reuse) by an older version may carry Wikipedia coordinates of an article that
    // belongs to another item (or a "redirect_target" point): not the event's own location, so dropped.
    // A cached "wikidata" point with another resolved item cannot be told apart (own P625 or the other
    // item's) and is kept; re-run without --reuse to re-derive it.
    if (r.coordinates && borrowedSource(r.coordinate_source, Boolean(r.resolved_qid && r.resolved_qid !== r.wikidata_qid)) === BORROWED_SOURCE) {
      r.coordinates = null;
      r.coordinate_source = null;
    }
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
    // Countries from the predecessor-state rule (discover-events.js, lib/predecessor.js): the evidence travels with the
    // record so finalizeEvent counts those tags as Wikidata-supported and names the rule in review_reasons.
    if (src?.predecessor_rule) r.predecessor_rule = src.predecessor_rule;
    else delete r.predecessor_rule;
    delete r.date_flags;
    // Events already merged into the curated file keep the dates as merged (no source reconciliation here): their
    // stored dates, and the date_source_adjusted note that explains a reconciled start, come from the curated record.
    const merged = curatedByQid.get(r.wikidata_qid);
    if (merged) {
      r.date_start = merged.date_start;
      r.date_end = merged.date_end;
      const adjusted = (merged.date_flags ?? []).filter((f) => f.startsWith("date_source_adjusted"));
      if (adjusted.length) r.date_flags = adjusted;
    }
    r.review_reasons = r._review;
    finalizeEvent(r, { ...ctx, reconcileDates: !merged });
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
    // On the kept dates and location (after the fix ledger); flags only, nothing is changed.
    setReason(r.review_reasons, TITLE_YEARS_FLAG, titleYearsFlag(r));
    setReason(r.review_reasons, LOW_PRECISION_FLAG, lowPrecisionCoordinateFlag(r));
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
  let persist = results.map((r) => ({ ...strip(r), _review: r._review, _part_of_qids: r._part_of_qids }));

  let proposed = results
    .filter((r) => !r.exclusion_reason)
    .map((r) => {
      const {
        exclusion_reason: _exclusionReason,
        error: _error,
        _review,
        _part_of_qids,
        source_qid: _sourceQid,
        enrich_version: _enrichVersion,
        predecessor_rule: _predecessorRule, // kept in enriched-candidates.json; the proposed record carries the flag
        wikidata_description,
        ...ev
      } = r;
      return { ...ev, wikidata_description };
    })
    .sort((a, b) => a.date_start.localeCompare(b.date_start) || compareQids(a.wikidata_qid, b.wikidata_qid));

  if (KEEP_EXISTING) ({ proposed, persist } = await keepExisting({ proposed, persist }));

  const { errors } = validateEvents(proposed, { name: "events.proposed" });
  if (errors.length) {
    refuse(
      `the proposed set failed validation (${errors.length} error${errors.length === 1 ? "" : "s"}); nothing was written:\n  ` +
        errors.slice(0, 20).join("\n  ")
    );
  }

  await writeFile(path(outName("enriched-candidates", "json")), JSON.stringify(persist, null, 2));
  await writeFile(path(outName("events.proposed", "json")), JSON.stringify(proposed, null, 2) + "\n");

  let report = null;
  if (!flag("no-report")) {
    // Dated by the newest retrieval in the data, not the wall clock, so unchanged input gives an unchanged report.
    report = await writeMissingReport({ curated, proposed });
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
  // --out-suffix run with failed fetches: the suffixed files are written for inspection, but the run still fails.
  if (failed.length) {
    reportFailed();
    process.exit(1);
  }
}

main();
