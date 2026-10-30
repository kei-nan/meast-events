// Wikidata drift (REPORT ONLY): where a curated event's stored start/end dates, coordinates or classes no
// longer match its Wikidata item. Run monthly by scripts/report-wikidata-drift.js (refresh-data.yml). Nothing
// here changes data/events.json: a difference is listed for the owner, who decides (docs/data-fixes.md for a fix).
//
// `entity` is a trimmed record from lib/wd-entities.js fetchEntities (p31, p580, p582, p585, p625, redirected).
import { EVENT_CLASSES } from "./event-classes.js";

// Wikidata "1940-00-00" is stored as 1940-01-01 (as in lib/fixes.js).
const norm = (t) => String(t ?? "").replace(/-00(?=-|$)/g, "-01");
// Stored coordinates keep Wikidata's value; 6 decimal places (~10 cm) is the tolerance (docs: border precision).
const COORD_EPS = 5e-7;
const sameCoords = (a, b) => Math.abs(a.lat - b.lat) <= COORD_EPS && Math.abs(a.lon - b.lon) <= COORD_EPS;
const fmtTimes = (vals) => (vals.length ? vals.map((v) => `${v.time} (precision ${v.precision})`).join(", ") : "none");
const fmtPt = (c) => `${c.lat}, ${c.lon}`;

// The discovery classes: a stored label that is one of them may have been matched through a subclass (P279*) and
// appended after the direct P31 labels (lib/v21.js buildWikidataClasses), so its absence from P31 is not drift.
const DISCOVERY_LABELS = new Set(EVENT_CLASSES.map((c) => c.label));

/**
 * Differences between one curated event and its current Wikidata item.
 * @param event   a data/events.json record
 * @param entity  fetchEntities record for event.wikidata_qid, or null when the item was not returned
 * @param labels  { classQid: English label } for the item's P31 values (a class without one shows its QID)
 * @param fix     the fix-ledger entry for the item (lib/fixes.js FIXES_BY_QID), if any: a field it sets was
 *                checked by hand against the sources, so a difference there is "explained", not listed as drift
 * @returns {{ rows: {field, stored, wikidata}[], explained: string[] }}
 */
export function driftFor(event, entity, labels = {}, fix = null) {
  const rows = [];
  const explained = [];
  const set = fix?.set ?? {};
  const add = (field, stored, wikidata, ledgerFields) => {
    if (ledgerFields.some((f) => f in set)) explained.push(`${field} (${fix.ref})`);
    else rows.push({ field, stored, wikidata });
  };
  if (!entity) {
    rows.push({ field: "item", stored: event.wikidata_qid, wikidata: "not returned by Wikidata (deleted or missing)" });
    return { rows, explained };
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
  return { rows, explained };
}

// Markdown table cell: no pipes or line breaks.
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");

/**
 * The report: one table row per difference, grouped by field.
 * @param results  [{ event, rows, explained }]
 * @param meta     { checked, noQid: ids of events without a wikidata_qid (not checked) }
 */
export function renderDriftReport(results, { checked, noQid = [] } = {}) {
  const lines = ["## Wikidata drift (report only)", ""];
  lines.push(
    "Curated events whose stored dates, coordinates or classes do not match their Wikidata item as it is now " +
      "(the item changed since the event was stored, or the stored value never came from it). Nothing here was changed in " +
      "data/events.json: each difference is for review (a fix goes through docs/data-fixes.md). Kind: \"seed\" = a " +
      "hand-picked event (data/seed-events.json), whose dates were not necessarily taken from Wikidata; \"discovered\" = " +
      "found by the inclusion rule, with Wikidata's values at the time."
  );
  lines.push("");
  const all = results.flatMap((r) =>
    r.rows.map((row) => ({ ...row, id: r.event.id, qid: r.event.wikidata_qid, kind: r.event.sitelinks === undefined ? "seed" : "discovered" }))
  );
  const explained = results.flatMap((r) => r.explained.map((x) => `${r.event.id}: ${x}`));
  lines.push(`Checked ${checked} events with a Wikidata item: ${all.length} difference(s) in ${new Set(all.map((x) => x.id)).size} event(s).`);
  if (explained.length) lines.push(`Not listed: ${explained.length} difference(s) the fix ledger explains (${explained.join("; ")}).`);
  if (noQid.length) lines.push(`Not checked (no wikidata_qid): ${noQid.join(", ")}.`);
  for (const field of ["item", "date_start", "date_end", "coordinates", "classes"]) {
    const rows = all.filter((x) => x.field === field);
    if (!rows.length) continue;
    lines.push("", `### ${field} (${rows.length})`, "", "| Event | Kind | Item | Stored | Wikidata now |", "|---|---|---|---|---|");
    for (const r of rows) {
      lines.push(`| ${cell(r.id)} | ${r.kind} | [${r.qid}](https://www.wikidata.org/wiki/${r.qid}) | ${cell(r.stored)} | ${cell(r.wikidata)} |`);
    }
  }
  return lines.join("\n") + "\n";
}
