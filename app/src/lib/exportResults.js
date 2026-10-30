// "Download these N results": the results panel's list as CSV or JSON, built in
// the browser from the lite records already in memory (split-data.mjs
// publicEvent). Nothing is fetched for it. Pure, except downloadText.
//
// What is in a row and what is not:
// - Only lite fields. The Wikipedia link, Wikidata QID, date precision,
//   extract_retrieved_at, the date flags and the data-fix refs live in the full
//   records, which load one bucket at a time when an event is opened; a download
//   would have to fetch every bucket, so they are left out. Each row's site_url
//   (/event/<id>) shows all of them and links the Wikipedia article.
// - No extract text. The full lead is lazy too, and the lite snippet is its first
//   160 characters, cut mid-sentence: handing that out as the event's summary
//   would misquote Wikipedia. The titles are Wikipedia text (CC BY-SA 4.0), so
//   every row and the JSON header carry the attribution, with site_url as the
//   per-event link to the source article (CC BY-SA 4.0 section 3(a)(2) allows
//   credit through a linked page that gives it).
// - Never border geometry (CShapes 2.0 CC BY-NC-SA 4.0 and UN OCHA's
//   non-commercial terms, data/LICENSE): only the countries' names.
// - lat/lon only for a precise location; an approximate one (a capital, or
//   coordinates the source rounded to the area) marks no site, so it is empty.
//
// CSV: RFC 4180 (CRLF line ends, a field with a comma, quote, CR or LF in
// double quotes, quotes doubled), UTF-8 with a byte order mark so Excel reads
// Arabic, Hebrew and accented letters as UTF-8 instead of the ANSI code page.
// Formula injection (OWASP "CSV Injection"): a text cell that starts, after any
// leading spaces, with = + - @ (or their full-width forms), a tab or a CR is
// prefixed with an apostrophe, so a spreadsheet shows it as text instead of
// running it. A plain number ("-5.3", a longitude) is not a formula and stays
// as it is. The JSON is not changed this way: it is data, not a spreadsheet.

import { categoryLabel } from "./categoryLabels.js";
import { countryLabel } from "./eventCountries.js";
import { rawEventYears, eventOverlapsRange, ongoingSignal, yearsReversed } from "./eventYears.js";
import { startedBefore } from "./browseOrder.js";
import { eventPath, shareLink } from "./urlState.js";
import { downloadBlob } from "./downloadFile.js";

export const SITE_ORIGIN = "https://middleeast.events";
export const TEXT_LICENSE = "CC BY-SA 4.0";
export const TEXT_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
export const ATTRIBUTION = `Text: Wikipedia contributors, ${TEXT_LICENSE} (${TEXT_LICENSE_URL}); identifiers: Wikidata, CC0; dates and places: mostly Wikidata (CC0), others from the event's Wikipedia article or set by hand by middleeast.events; source article linked from site_url`;
export const NOTICE_URL = "https://github.com/kei-nan/meast-events/blob/main/NOTICE";

/** The CSV header, in column order: [key, header text]. */
export const CSV_COLUMNS = [
  ["id", "id"],
  ["title", "title"],
  ["date_start", "date_start"],
  ["date_end", "date_end"],
  ["countries", "countries"],
  ["category", "category (our grouping)"],
  ["location_quality", "location_quality"],
  ["lat", "lat"],
  ["lon", "lon"],
  ["notes", "notes"],
  ["wikimedia_pages", "wikimedia_pages"],
  ["site_url", "site_url"],
  ["license", "license"],
];

// Which source an ongoing event's reading comes from (lib/eventYears.js ongoingSignal).
const ONGOING_SOURCE = {
  title: "Wikipedia title says present",
  wikidata_novalue: "Wikidata end time: no value",
  wikidata_somevalue: "Wikidata end time: unknown value",
};

const finite = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * The tags a row shows in the panel (ResultsList), as text: outside the selected
 * years, ongoing since (browse list), end date before start, no map location,
 * approximate location (with why, for a rounded pin).
 */
export function rowNotes(e, { range = null, browse = false } = {}) {
  const notes = [];
  if (range && !eventOverlapsRange(e, range[0], range[1])) notes.push("Outside selected years");
  if (browse && range && startedBefore(e, range[0])) notes.push(`Ongoing since ${rawEventYears(e)[0]}`);
  if (yearsReversed(e)) notes.push("End date before start");
  const ongoing = ongoingSignal(e);
  if (ongoing) notes.push(`No end date; ongoing per source (${ONGOING_SOURCE[ongoing]})`);
  if (e.location_quality === "none") notes.push("No map location");
  if (e.location_quality === "approximate") {
    notes.push(
      e.approximate_reason === "rounded"
        ? "Approximate location (the source rounds the coordinates to the area)"
        : "Approximate location"
    );
  }
  return notes;
}

/** One exported event (typed: countries and notes are arrays, lat/lon numbers or null). */
export function exportRow(e, opts = {}) {
  const precise = e.location_quality === "precise" && finite(e.coordinates?.lat) && finite(e.coordinates?.lon);
  return {
    id: e.id,
    title: e.title ?? "",
    date_start: e.date_start ?? null,
    date_end: e.date_end ?? null,
    countries: (e.countries ?? []).map(countryLabel),
    category: e.category ? categoryLabel(e.category) : "",
    location_quality: e.location_quality ?? "none",
    lat: precise ? e.coordinates.lat : null,
    lon: precise ? e.coordinates.lon : null,
    notes: rowNotes(e, opts),
    wikimedia_pages: finite(e.sitelinks) ? e.sitelinks : null,
    site_url: `${SITE_ORIGIN}${eventPath(e.id)}`,
    license: ATTRIBUTION,
  };
}

/** The rows, in the order given (the panel's order). */
export function exportRows(events, opts = {}) {
  return events.map((e) => exportRow(e, opts));
}

// Starts like a formula once leading spaces are skipped.
const FORMULA_START = /^[  ]*[=+\-@\t\r＝＋－＠]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** One CSV field: neutralised against formula injection, then quoted if needed. */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join("; ") : String(value);
  if (typeof value !== "number" && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The CSV text: BOM, header line, one line per row, CRLF after each. */
export function toCSV(rows) {
  const lines = [CSV_COLUMNS.map(([, h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([k]) => csvCell(r[k])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * The query and filters behind the list, named like the URL's parameters
 * (lib/urlState.js), and the link that reopens it.
 */
export function exportQuery({ query = "", filters = {}, area = null, range, sort, view }) {
  const state = {
    q: query.trim(),
    categories: filters.categories ?? [],
    countries: filters.countries ?? [],
    startYear: range?.[0],
    endYear: range?.[1],
    scope: filters.scope === "range" ? "range" : "all",
    area,
    sort,
    view,
  };
  return {
    q: state.q,
    categories: state.categories,
    countries: state.countries,
    years: range ? [range[0], range[1]] : null,
    scope: state.scope,
    area: area ? { type: area.type, bbox: area.bbox, center: area.center ?? null, radius_km: area.radiusKm ?? null } : null,
    // Not in the URL: the visible map area at the time of the download.
    in_map_view: Boolean(filters.inView),
    sort: sort ?? "coverage",
    view: view ?? "list",
    url: shareLink(SITE_ORIGIN, state),
  };
}

/** The JSON text: a licence/attribution header, when, what was asked, the events. */
export function toJSON(rows, { query, generatedAt = new Date() } = {}) {
  const doc = {
    source: "middleeast.events",
    license: {
      text: `Event titles are Wikipedia text by Wikipedia contributors, ${TEXT_LICENSE}; each event's site_url links its Wikipedia article.`,
      text_license: TEXT_LICENSE,
      text_license_url: TEXT_LICENSE_URL,
      facts:
        "Identifiers come from Wikidata (CC0). Dates and places mostly come from Wikidata (CC0); the others come from the event's Wikipedia article or were set by hand by middleeast.events.",
      not_included: "No Wikipedia extract text and no border geometry (the borders are CC BY-NC-SA 4.0, CShapes 2.0, and UN OCHA's non-commercial terms).",
      credits: NOTICE_URL,
    },
    attribution: ATTRIBUTION,
    generated_at: generatedAt.toISOString(),
    query: query ?? null,
    count: rows.length,
    events: rows,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** "middleeast-events-1917-2026-23.csv" (one year: "middleeast-events-1967-5.csv"). */
export function exportFilename(range, count, ext) {
  const years = !range ? "all" : range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`;
  return `middleeast-events-${years}-${count}.${ext}`;
}

/** The years a download's filename names: none ("all") for a whole-timeline search, else the selected years. */
export function exportFileRange(range, { searching, scope }) {
  return searching && scope !== "range" ? null : range;
}

/** Saves `text` as a file: a Blob behind an object URL, clicked from a temporary link. */
export function downloadText(text, filename, type) {
  downloadBlob(new Blob([text], { type }), filename);
}
