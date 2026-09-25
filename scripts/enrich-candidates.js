// Resolves a filtered batch of data/event-candidates.json (Wikidata-driven
// discovery output) against Wikipedia + Wikidata, the same way scripts/ingest.js
// resolves data/seed-events.json - producing data/enriched-candidates.json in the
// same schema as data/events.json, PLUS quality-control metadata (needs_review,
// review_reasons) so a human can triage before anything gets merged into the real
// curated files.
//
// This is deliberately a sibling of ingest.js, not a replacement: it reuses the
// same fetch/fallback logic (summary -> Wikidata P625 -> country centroid), but
// adapts the input shape. Candidates already carry a wikidata_qid, so unlike
// ingest.js (title-only), this script can cross-check the QID the title actually
// resolves to against the QID Wikidata search produced, and it also does a
// heuristic sanity check of date_start/date_end against the years mentioned in
// the resolved Wikipedia extract - the earlier discovery pass found at least one
// candidate ("Iraqi invasion of Kuwait") carrying a flatly wrong date straight
// from Wikidata (2009 instead of 1990), so this script does not blindly
// propagate candidate dates forward without a sanity check.
//
// Wikimedia asks automated clients to identify themselves in the User-Agent.
import { readFile, writeFile } from "node:fs/promises";

const USER_AGENT =
  "ConfrontationHistoryMap/0.1 (event-enrichment pass; contact: jonkeinan@gmail.com)";
const REQUEST_DELAY_MS = 300;

// --- Filtering bar for this enrichment pass -------------------------------
//
// The raw candidate set has 2,360 entries; 1,070 carry notable_enough: true
// (sitelinks >= 5, per the discovery agent's own threshold), and 48 of those
// are already_curated (already represented in seed-events.json) and are
// excluded here regardless.
//
// The discovery agent's own spot-check flagged that sitelinks >= 5 still let
// through borderline/too-granular items (minor skirmishes, single-context
// political footnotes). Rather than guess at a per-category cutoff, this pass
// raises the bar to sitelinks >= 10 - roughly the median of the notable_enough
// set - which cuts 1,022 eligible candidates down to 441. That's a "solid,
// well-verified batch" per the task brief rather than a rushed run over
// everything, and it biases toward events with broader multi-language
// encyclopedic coverage, which correlates (imperfectly, but usably) with
// genuine historical significance rather than granularity of coverage on a
// single Wikipedia.
const MIN_SITELINKS = 10;

// Same fallback marker table as ingest.js, extended with Oman (present in the
// candidate set's countries arrays - e.g. multi-country entries like "World
// War II" - but missing from ingest.js's original table, which was built only
// from the initial seed list's country coverage).
const COUNTRY_CAPITALS = {
  Turkey: { lat: 39.9334, lon: 32.8597 },
  Iran: { lat: 35.6892, lon: 51.389 },
  Iraq: { lat: 33.3152, lon: 44.3661 },
  Syria: { lat: 33.5138, lon: 36.2765 },
  Lebanon: { lat: 33.8938, lon: 35.5018 },
  Jordan: { lat: 31.9454, lon: 35.9284 },
  "Israel/Palestine": { lat: 31.7683, lon: 35.2137 },
  Egypt: { lat: 30.0444, lon: 31.2357 },
  "Saudi Arabia": { lat: 24.7136, lon: 46.6753 },
  Yemen: { lat: 15.3694, lon: 44.191 },
  Kuwait: { lat: 29.3759, lon: 47.9774 },
  Bahrain: { lat: 26.2285, lon: 50.586 },
  Qatar: { lat: 25.2854, lon: 51.531 },
  UAE: { lat: 24.4539, lon: 54.3773 },
  Oman: { lat: 23.5859, lon: 58.4059 },
};

function countryFallbackCoordinates(countries) {
  const country = countries?.find((c) => COUNTRY_CAPITALS[c]);
  return country ? { ...COUNTRY_CAPITALS[country], approximate_for: country } : null;
}

// No hand-placed overrides are known to be needed for this batch yet (unlike
// ingest.js's seed list, nothing here has been spot-checked closely enough to
// justify one) - left as an empty hook so a human reviewer can add entries
// here the same way ingest.js does, if QC turns any up.
const MANUAL_OVERRIDES = {};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchWikidataCoordinates(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const value = data.entities?.[qid]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  if (!value) return null;
  return { lat: value.latitude, lon: value.longitude };
}

// Heuristic date sanity check: pull every plausible 4-digit year out of the
// Wikipedia extract text and compare against the year(s) Wikidata gave us for
// this candidate. Not proof of correctness (a short extract may simply omit
// the year, or a "founded in X, this battle in Y" extract mentions several
// unrelated years) - just a signal that something might be off, worth a
// human's second look rather than blind propagation.
function extractYears(text) {
  if (!text) return [];
  const matches = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g);
  return matches ? [...new Set(matches.map(Number))] : [];
}

function yearOf(dateStr) {
  if (!dateStr) return null;
  const m = /^(-?\d{1,4})/.exec(dateStr);
  return m ? Number(m[1]) : null;
}

async function resolveCandidate(candidate, index, total) {
  const label = `[${index + 1}/${total}] ${candidate.wikipedia_title}`;
  const reviewReasons = [];

  const base = {
    id: slugify(candidate.wikipedia_title),
    title: candidate.wikipedia_title,
    date_start: candidate.date_start,
    date_end: candidate.date_end,
    countries: candidate.countries,
    category: candidate.category,
    retrieved_at: new Date().toISOString(),
    source_qid: candidate.wikidata_qid,
    sitelinks: candidate.sitelinks,
    wikidata_description: candidate.wikidata_description ?? null,
  };

  // Data-quality check independent of any network call: a candidate whose
  // date_end predates its date_start is internally inconsistent straight out
  // of the raw Wikidata pull (this is exactly the shape of error the
  // discovery agent's spot-check found - e.g. a "2009" start date paired with
  // a plausible "1990" end date for the Iraqi invasion of Kuwait). Flag it,
  // don't silently swap or drop - we can't tell which side is wrong without a
  // human (or a deeper source check).
  if (candidate.date_end && candidate.date_start && candidate.date_end < candidate.date_start) {
    reviewReasons.push(
      `date_order_invalid: date_end (${candidate.date_end}) precedes date_start (${candidate.date_start}) in source Wikidata`
    );
  }

  // Wikidata encodes "year-only precision" dates as January 1st of that year.
  // A batch-wide scan found ~11% of candidates carry a "-01-01" date_start;
  // most of those are legitimately low-precision (fine for a map at this
  // scale), but a few are flatly wrong years wearing the same mask (e.g. a
  // candidate for the "2025-2026 Iranian protests" carrying "2020-01-01").
  // The year-mismatch check below catches the flatly-wrong-year cases; this
  // flag exists for the remainder - correct year, fake day-precision - so a
  // human can decide whether the exact date matters enough to look up.
  if (/-01-01$/.test(candidate.date_start ?? "")) {
    reviewReasons.push(
      `low_precision_date: date_start (${candidate.date_start}) has the shape of a Wikidata year-only placeholder, not a verified exact date`
    );
  }

  const summary = await fetchSummary(candidate.wikipedia_title);
  if (!summary) {
    console.log(`${label} -> FAILED (no Wikipedia summary found)`);
    return {
      ...base,
      wikidata_qid: candidate.wikidata_qid,
      wikipedia_url: null,
      extract: null,
      coordinates: null,
      coordinate_source: null,
      needs_manual_coordinates: true,
      needs_review: true,
      review_reasons: [...reviewReasons, "summary_not_found"],
      error: "summary_not_found",
    };
  }

  const resolvedQid = summary.wikibase_item ?? null;
  if (resolvedQid && candidate.wikidata_qid && resolvedQid !== candidate.wikidata_qid) {
    reviewReasons.push(
      `qid_mismatch: title resolved to ${resolvedQid}, candidate was discovered under ${candidate.wikidata_qid} (possible redirect/disambiguation - verify title still matches the intended event)`
    );
  }

  let coordinates = summary.coordinates
    ? { lat: summary.coordinates.lat, lon: summary.coordinates.lon }
    : null;
  let coordinateSource = coordinates ? "wikipedia" : null;

  const qidForLookup = resolvedQid ?? candidate.wikidata_qid;
  if (!coordinates && qidForLookup) {
    await sleep(REQUEST_DELAY_MS);
    coordinates = await fetchWikidataCoordinates(qidForLookup);
    if (coordinates) coordinateSource = "wikidata";
  }

  if (!coordinates && MANUAL_OVERRIDES[candidate.wikipedia_title]) {
    const override = MANUAL_OVERRIDES[candidate.wikipedia_title];
    coordinates = { lat: override.lat, lon: override.lon };
    coordinateSource = "manual-override";
  }

  if (!coordinates) {
    const fallback = countryFallbackCoordinates(candidate.countries);
    if (fallback) {
      coordinates = { lat: fallback.lat, lon: fallback.lon };
      coordinateSource = `country-fallback:${fallback.approximate_for}`;
    }
  }

  // Date sanity check against the resolved extract text. Checked independently
  // for start and end year - NOT "either one shows up" - because most
  // candidates have no date_end (single-day events) and treating a missing
  // end date as automatically "satisfied" would silently exempt exactly the
  // majority-case candidates from ever having their (always-present)
  // date_start checked. +/-1 year tolerance absorbs "began in late 1990s
  // Wikidata year vs. extract says 1991" style boundary slop without masking
  // a genuinely wrong year like the "2020" vs "2025" case this check found
  // during dry-run QC (a protest movement candidate whose Wikidata date_start
  // was four years off from its own Wikipedia extract).
  const extractYearsFound = extractYears(summary.extract);
  const startYear = yearOf(candidate.date_start);
  const endYear = yearOf(candidate.date_end);
  const withinTolerance = (y) => extractYearsFound.some((ey) => Math.abs(ey - y) <= 1);
  if (extractYearsFound.length > 0 && startYear !== null && !withinTolerance(startYear)) {
    reviewReasons.push(
      `date_year_mismatch: candidate date_start year (${startYear}) not found (within 1 year) in Wikipedia extract, which mentions [${extractYearsFound.join(", ")}]`
    );
  } else if (extractYearsFound.length > 0 && endYear !== null && !withinTolerance(endYear)) {
    reviewReasons.push(
      `date_end_year_mismatch: candidate date_end year (${endYear}) not found (within 1 year) in Wikipedia extract, which mentions [${extractYearsFound.join(", ")}]`
    );
  }

  const needsReview = reviewReasons.length > 0;
  console.log(
    `${label} -> ok${coordinates ? ` (${coordinateSource})` : " (NO COORDINATES)"}${
      needsReview ? ` [NEEDS REVIEW: ${reviewReasons.map((r) => r.split(":")[0]).join(", ")}]` : ""
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
    needs_manual_coordinates: !coordinates,
    needs_review: needsReview,
    review_reasons: reviewReasons,
  };
}

async function main() {
  const candidatesPath = new URL("../data/event-candidates.json", import.meta.url);
  const outPath = new URL("../data/enriched-candidates.json", import.meta.url);

  const allCandidates = JSON.parse(await readFile(candidatesPath, "utf-8"));
  const batch = allCandidates.filter(
    (c) => c.notable_enough && !c.already_curated && c.sitelinks >= MIN_SITELINKS
  );

  console.log(
    `Loaded ${allCandidates.length} raw candidates; ${batch.length} selected for this batch ` +
      `(notable_enough && !already_curated && sitelinks >= ${MIN_SITELINKS}).\n`
  );

  const results = [];
  for (let i = 0; i < batch.length; i++) {
    try {
      results.push(await resolveCandidate(batch[i], i, batch.length));
    } catch (err) {
      console.log(`[${i + 1}/${batch.length}] ${batch[i].wikipedia_title} -> FAILED (${err.message})`);
      results.push({
        id: slugify(batch[i].wikipedia_title),
        title: batch[i].wikipedia_title,
        date_start: batch[i].date_start,
        date_end: batch[i].date_end,
        countries: batch[i].countries,
        category: batch[i].category,
        source_qid: batch[i].wikidata_qid,
        sitelinks: batch[i].sitelinks,
        wikidata_qid: batch[i].wikidata_qid,
        wikipedia_url: null,
        extract: null,
        coordinates: null,
        coordinate_source: null,
        needs_manual_coordinates: true,
        needs_review: true,
        review_reasons: ["exception: " + err.message],
        error: err.message,
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  await writeFile(outPath, JSON.stringify(results, null, 2));

  const failed = results.filter((r) => r.error).length;
  const okNoReview = results.filter((r) => !r.error && !r.needs_review).length;
  const needsReview = results.filter((r) => !r.error && r.needs_review).length;
  const missingCoords = results.filter((r) => !r.error && r.needs_manual_coordinates).length;

  console.log(`\nDone. Total in batch: ${batch.length}`);
  console.log(`  Resolved cleanly (no flags): ${okNoReview}`);
  console.log(`  Resolved but flagged for review: ${needsReview}`);
  console.log(`  Failed (no Wikipedia summary / exception): ${failed}`);
  console.log(`  Missing coordinates (any status): ${missingCoords}`);
  console.log(`Output written to data/enriched-candidates.json`);
}

main();
