// Wikidata drift (REPORT ONLY): where a curated event's stored start/end dates, coordinates or classes no
// longer match its Wikidata item. Run monthly by scripts/report-wikidata-drift.js (refresh-data.yml). Nothing
// here changes data/events.json: a difference is listed for the owner, who decides (docs/data-fixes.md for a fix).
//
// `entity` is a trimmed record from lib/wd-entities.js fetchEntities (p31, p580, p582, p585, p625, redirected).
import { EVENT_CLASSES } from "./event-classes.js";
import { keptDatePrecision } from "./fixes.js";
import { mdCode } from "./title-refresh.js";
import { wikipediaPinCheck } from "./rederive.js";

// Wikidata "1940-00-00" is stored as 1940-01-01 (as in lib/fixes.js).
const norm = (t) => String(t ?? "").replace(/-00(?=-|$)/g, "-01");
// Stored coordinates keep Wikidata's value; 6 decimal places (~10 cm) is the tolerance (docs: border precision).
const COORD_EPS = 5e-7;
const sameCoords = (a, b) => Math.abs(a.lat - b.lat) <= COORD_EPS && Math.abs(a.lon - b.lon) <= COORD_EPS;
const fmtTimes = (vals) => (vals.length ? vals.map((v) => `${v.time} (precision ${v.precision})`).join(", ") : "none");
const fmtPt = (c) => `${c.lat}, ${c.lon}`;

// The ledger fields the drift report can compare with the item, each as { pool, all, same, fmt }:
//   pool  the values Wikidata gives for the field now, as the pipeline reads them (date_start: P585, else P580 - the
//         discovery query's COALESCE; date_end: P582; date_precision: the precision of the P585/P580 statement whose
//         value is the stored date_start, lib/fixes.js keptDatePrecision; coordinates: P625)
//   all   every value of the item the fixed value may have been taken from (a date fix may use any of P585/P580/P582,
//         e.g. F6 sets date_end to the item's P585)
const LEDGER_FIELDS = {
  date_start: (e) => ({ pool: (e.p585?.length ? e.p585 : e.p580 ?? []).map((v) => norm(v.time)), all: allDates(e) }),
  date_end: (e) => ({ pool: (e.p582 ?? []).map((v) => norm(v.time)), all: allDates(e) }),
  date_precision: (e, event) => {
    const p = keptDatePrecision(e, event.date_start)?.name;
    return { pool: p ? [p] : [], all: p ? [p] : [] };
  },
  coordinates: (e) => ({ pool: e.p625 ? [e.p625] : [], all: e.p625 ? [e.p625] : [] }),
};
const allDates = (e) => [...(e.p585 ?? []), ...(e.p580 ?? []), ...(e.p582 ?? [])].map((v) => norm(v.time));
const sameValue = (field, a, b) => {
  if (a == null || b == null) return a == null && b == null;
  if (field === "coordinates") return sameCoords(a, b);
  if (field === "date_start" || field === "date_end") return norm(a) === norm(b);
  return a === b;
};
const fmtValue = (field, v) => (v == null ? "none" : field === "coordinates" ? fmtPt(v) : String(v));
const fmtPool = (field, pool) => (pool.length ? pool.map((v) => fmtValue(field, v)).join(", ") : "none");

/**
 * Ledger fixes that may be stale: for each field the fix sets that the report can compare (LEDGER_FIELDS), whether
 * Wikidata still gives what the fix was written against. A fix still applies regardless (lib/fixes.js applyDataFix);
 * this only lists it for a recheck.
 *  - With `fix.from[field]` (the Wikidata value the fix was written against): stale when Wikidata no longer gives it,
 *    either because Wikidata now gives the fixed value itself (the fix is no longer needed) or another value.
 *  - Without it (the fix did not override a Wikidata value, e.g. it took the item's own P580 or P625): stale when
 *    Wikidata gives a value for the field and the fixed value is none of the item's values any more.
 * Other fields a fix sets (title, countries, coordinate_source, ...) are not compared with Wikidata.
 * @returns {{ field, ref, fixed, wikidata, reason }[]}
 */
export function staleFixes(event, entity, fix) {
  if (!entity || !fix?.set) return [];
  const out = [];
  for (const [field, fixed] of Object.entries(fix.set)) {
    const read = LEDGER_FIELDS[field];
    if (!read) continue;
    const { pool, all } = read(entity, event);
    const has = (vals, v) => (v == null ? vals.length === 0 : vals.some((x) => sameValue(field, x, v)));
    const row = (reason) => out.push({ field, ref: fix.ref, fixed: fmtValue(field, fixed), wikidata: fmtPool(field, pool), reason });
    if (fix.from && field in fix.from) {
      const from = fix.from[field];
      if (has(pool, from)) continue;
      if (fixed != null && has(pool, fixed)) row("Wikidata now gives the fixed value itself: the fix may no longer be needed");
      else row(`Wikidata changed since the fix: it gave ${fmtValue(field, from)} when the fix was written`);
    } else if (pool.length && !has(all, fixed)) {
      row("the fixed value is none of the item's Wikidata values now, though Wikidata gives one for the field");
    }
  }
  return out;
}

// The discovery classes: a stored label that is one of them may have been matched through a subclass (P279*) and
// appended after the direct P31 labels (lib/v21.js buildWikidataClasses), so its absence from P31 is not drift.
const DISCOVERY_LABELS = new Set(EVENT_CLASSES.map((c) => c.label));

/**
 * Differences between one curated event and its current Wikidata item.
 * @param event   a data/events.json record
 * @param entity  fetchEntities record for event.wikidata_qid, or null when the item was not returned
 * @param labels  { classQid: English label } for the item's P31 values (a class without one shows its QID)
 * @param fix     the fix-ledger entry for the item (lib/fixes.js FIXES_BY_QID), if any: a field it sets was
 *                checked by hand against the sources, so a difference there is "explained", not listed as drift -
 *                unless the fix is stale for that field (staleFixes): then the difference is listed, and the fix too
 * @param opts    { article }: the current primary coordinates of the event's English article (lib/wiki.js
 *                fetchArticleCoordinates; null: none), compared with a "wikipedia" pin; undefined: not compared
 * @returns {{ rows: {field, stored, wikidata}[], explained: string[], stale: ReturnType<typeof staleFixes> }}
 */
export function driftFor(event, entity, labels = {}, fix = null, { article } = {}) {
  const rows = [];
  const explained = [];
  const set = fix?.set ?? {};
  const stale = staleFixes(event, entity, fix);
  const staleFields = new Set(stale.map((s) => s.field));
  const add = (field, stored, wikidata, ledgerFields) => {
    const byFix = ledgerFields.filter((f) => f in set);
    if (byFix.length && !byFix.some((f) => staleFields.has(f))) explained.push(`${field} (${fix.ref})`);
    else rows.push({ field, stored, wikidata });
  };
  if (!entity) {
    rows.push({ field: "item", stored: event.wikidata_qid, wikidata: "not returned by Wikidata (deleted or missing)" });
    return { rows, explained, stale };
  }
  if (entity.redirected) {
    rows.push({ field: "item", stored: event.wikidata_qid, wikidata: `now redirects to ${entity.qid}` });
  }

  // Start: the stored date_start must be one of the item's P585 / P580 values (the discovery query's COALESCE).
  const starts = [...(entity.p585 ?? []), ...(entity.p580 ?? [])];
  if (event.date_start && !starts.some((v) => norm(v.time) === event.date_start)) {
    add("date_start", event.date_start, `P585: ${fmtTimes(entity.p585 ?? [])}; P580: ${fmtTimes(entity.p580 ?? [])}`, [
      "date_start",
      "date_precision",
    ]);
  }
  // End: a stored date_end must be one of the item's P582 values; no stored end while Wikidata now has one is listed too.
  const ends = entity.p582 ?? [];
  if (event.date_end != null && !ends.some((v) => norm(v.time) === event.date_end)) {
    add("date_end", event.date_end, `P582: ${fmtTimes(ends)}`, ["date_end"]);
  } else if (event.date_end == null && ends.length) {
    add("date_end", "none", `P582: ${fmtTimes(ends)}`, ["date_end"]);
  }

  // Coordinates: a pin taken from Wikidata must still be its P625; an event without a precise pin whose item now has
  // a P625 is listed (the pin is never added here).
  const p625 = entity.p625;
  const c = event.coordinates;
  if (event.coordinate_source === "wikidata" && c) {
    if (!p625) add("coordinates", fmtPt(c), "P625: none", ["coordinates"]);
    else if (!sameCoords(c, p625)) add("coordinates", fmtPt(c), `P625: ${fmtPt(p625)}`, ["coordinates"]);
  } else if (event.location_quality !== "precise" && p625) {
    add("coordinates", c ? `${fmtPt(c)} (${event.location_quality})` : "none", `P625: ${fmtPt(p625)}`, ["coordinates"]);
  }
  // A pin taken from the article ("wikipedia") against the article's current primary coordinates, when they were
  // fetched (`article`: a point, null for none; undefined: not fetched). Only the event's own article counts
  // (lib/rederive.js wikipediaPinCheck); both kinds of difference are listed, with P625 next to it.
  if (wikipediaPinCheck(event, article, p625)) {
    add("coordinates", `${fmtPt(c)} (wikipedia)`, `article: ${article ? fmtPt(article) : "none"}; P625: ${p625 ? fmtPt(p625) : "none"}`, ["coordinates"]);
  }

  // Classes: the direct P31 labels against the stored wikidata_classes. A stored label that is no longer a P31 label
  // is listed unless it is a discovery class (it may come from a subclass match, which is not re-queried here).
  if (Array.isArray(event.wikidata_classes)) {
    const current = [...new Set((entity.p31 ?? []).map((q) => labels[q] ?? q))];
    const stored = event.wikidata_classes;
    const added = current.filter((l) => !stored.includes(l));
    const removed = stored.filter((l) => !current.includes(l) && !DISCOVERY_LABELS.has(l));
    if (added.length || removed.length) {
      const parts = [];
      if (added.length) parts.push(`new P31: ${added.join(", ")}`);
      if (removed.length) parts.push(`no longer P31: ${removed.join(", ")}`);
      rows.push({ field: "classes", stored: stored.join(", "), wikidata: parts.join("; ") });
    }
  }
  return { rows, explained, stale };
}

// Markdown table cell: no pipes or line breaks.
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");
// A value that comes from Wikidata, which anyone can edit: the report becomes the monthly PR description, so it is an
// inline code span (lib/title-refresh.js mdCode), and a label cannot mention anyone or add a link or an image. GFM
// reads a table cell's \| as a pipe inside a code span too.
const codeCell = (s) => cell(mdCode(s));

// Flags the pipeline writes when Wikidata's date looks wrong (lib/v21.js, lib/flags.js): the site then shows the date
// as Wikidata gives it, with the flag as a note. date_end_precision_coarse (not wrong), date_source_adjusted and
// unverified_date (nothing to compare) are not among them.
const DOUBT_FLAGS = [
  "date_order_invalid",
  "wikipedia_dates_note",
  "date_start_year_not_in_lead",
  "category_year_mismatch",
  "date_year_mismatch",
  "date_end_year_mismatch",
  "month_precision_day_in_lead",
];
/**
 * Why a date difference on this event goes first in the report, or null: its dates are Wikidata's (a discovered
 * event), or a flag or its framing review's data note says Wikidata's date is wrong. Then the site may show a date,
 * and a note blaming Wikidata, that Wikidata itself has since corrected (the Kuwait invasion's 2009 start, F16, sat
 * unnoticed among the seed events' differences).
 */
export function dateShownReason(event, dataNote = null) {
  const why = [];
  if (event.sitelinks !== undefined) why.push("discovered: its dates are Wikidata's");
  const kinds = [...(event.date_flags ?? []), ...(event.review_reasons ?? [])]
    .map((f) => String(f).split(":")[0])
    .filter((k) => DOUBT_FLAGS.includes(k));
  if (kinds.length) why.push(`flagged ${[...new Set(kinds)].join(", ")}`);
  if (typeof dataNote === "string" && /wikidata/i.test(dataNote)) why.push("its data note names Wikidata");
  return why.length ? why.join("; ") : null;
}

/**
 * The report: one table row per difference, grouped by field. Date differences on events dateShownReason picks come
 * first, in a table of their own.
 * @param results  [{ event, rows, explained, stale?, dataNote? }] (dataNote: the framing review's data_note, if any)
 * @param meta     { checked, noQid: ids of events without a wikidata_qid (not checked) }
 */
export function renderDriftReport(results, { checked, noQid = [] } = {}) {
  const lines = ["## Wikidata drift (report only)", ""];
  lines.push(
    "Curated events whose stored dates, coordinates or classes do not match their Wikidata item as it is now " +
      "(the item changed since the event was stored, or the stored value never came from it); a pin taken from the article " +
      "(\"wikipedia\") is compared with the article's current coordinates. Nothing here was changed in " +
      "data/events.json: each difference is for review (a fix goes through docs/data-fixes.md). Kind: \"seed\" = a " +
      "hand-picked event (data/seed-events.json), whose dates were not necessarily taken from Wikidata; \"discovered\" = " +
      "found by the inclusion rule, with Wikidata's values at the time."
  );
  lines.push("");
  const all = results.flatMap((r) => {
    const shown = dateShownReason(r.event, r.dataNote);
    return r.rows.map((row) => ({
      ...row,
      id: r.event.id,
      qid: r.event.wikidata_qid,
      kind: r.event.sitelinks === undefined ? "seed" : "discovered",
      first: shown && (row.field === "date_start" || row.field === "date_end") ? shown : null,
    }));
  });
  const explained = results.flatMap((r) => r.explained.map((x) => `${r.event.id}: ${x}`));
  lines.push(`Checked ${checked} events with a Wikidata item: ${all.length} difference(s) in ${new Set(all.map((x) => x.id)).size} event(s).`);
  if (explained.length) lines.push(`Not listed: ${explained.length} difference(s) the fix ledger explains (${explained.join("; ")}).`);
  if (noQid.length) lines.push(`Not checked (no wikidata_qid): ${noQid.join(", ")}.`);
  const first = all.filter((x) => x.first);
  if (first.length) {
    lines.push(
      "",
      `### Wikidata changed a date the site shows (${first.length})`,
      "",
      "The site shows these dates as Wikidata gave them (a discovered event), or with a flag or note saying Wikidata's " +
        "date is wrong; Wikidata now gives another. Check these first: the page may show a date, or blame Wikidata for " +
        "one, that Wikidata has since corrected. Not listed again below.",
      "",
      "| Event | Kind | Item | Field | Stored | Wikidata now | Why first |",
      "|---|---|---|---|---|---|---|"
    );
    for (const r of first) {
      lines.push(
        `| ${cell(r.id)} | ${r.kind} | [${r.qid}](https://www.wikidata.org/wiki/${r.qid}) | ${r.field} | ${codeCell(r.stored)} | ${codeCell(r.wikidata)} | ${cell(r.first)} |`
      );
    }
  }
  for (const field of ["item", "date_start", "date_end", "coordinates", "classes"]) {
    const rows = all.filter((x) => x.field === field && !x.first);
    if (!rows.length) continue;
    lines.push("", `### ${field} (${rows.length})`, "", "| Event | Kind | Item | Stored | Wikidata now |", "|---|---|---|---|---|");
    for (const r of rows) {
      lines.push(`| ${cell(r.id)} | ${r.kind} | [${r.qid}](https://www.wikidata.org/wiki/${r.qid}) | ${codeCell(r.stored)} | ${codeCell(r.wikidata)} |`);
    }
  }
  // Ledger fixes whose Wikidata basis changed. They still apply; each is for a recheck against docs/data-fixes.md.
  const stale = results.flatMap((r) => (r.stale ?? []).map((s) => ({ ...s, id: r.event.id, qid: r.event.wikidata_qid })));
  if (stale.length) {
    lines.push(
      "",
      `### Fix ledger entries to recheck (${stale.length})`,
      "",
      "The fix still applies (lib/fixes.js); Wikidata no longer gives what it was written against.",
      "",
      "| Event | Item | Fix | Field | Fixed value | Wikidata now | Why |",
      "|---|---|---|---|---|---|---|"
    );
    for (const s of stale) {
      lines.push(
        `| ${cell(s.id)} | [${s.qid}](https://www.wikidata.org/wiki/${s.qid}) | ${cell(s.ref)} | ${s.field} | ${cell(s.fixed)} | ${codeCell(s.wikidata)} | ${cell(s.reason)} |`
      );
    }
  }
  return lines.join("\n") + "\n";
}
