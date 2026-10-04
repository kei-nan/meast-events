// Ledger of verified data fixes (each mirrored, with evidence, in docs/data-fixes.md).
// A fix is applied ONLY to a listed Wikidata item, after the discrepancy was checked against
// live Wikipedia + Wikidata (2026-09-26). Everything not listed is at most FLAGGED, never changed.
// ids are never changed.
import { precisionName } from "./wiki.js";
export const DATA_FIXES = [
  {
    qid: "Q2479435",
    ref: "F1",
    set: { title: "South Lebanon conflict (1985–2000)", date_start: "1985-02-16", date_end: "2000-05-25" },
    note:
      'record was titled "Israeli withdrawal from Lebanon", a redirect to a SECTION of the article "South Lebanon conflict (1985–2000)"; ' +
      "its url, QID (Q2479435) and extract were already that article's. Title now = the article title; dates = Wikidata Q2479435 (P585 1985-02-16, P582 2000-05-25)",
  },
  {
    qid: "Q47465940",
    ref: "F2",
    set: { date_start: "2018-01-20", date_end: "2018-03-24" },
    note:
      "Wikidata P585 (2019-08-09) contradicts the article; Wikidata P580 = 2018-01-20 and the Wikipedia infobox reads " +
      '"20 January - 24 March 2018". date_start = P580, date_end = Wikipedia infobox (Wikidata has no P582)',
  },
  {
    qid: "Q538398",
    ref: "F4",
    set: { countries: ["Georgia"] },
    note:
      'was tagged Turkey only because the item\'s location (P276) is the Black Sea, whose own P17 includes Turkey. Wikidata P17 for the item itself = Georgia (Q230); ' +
      "the lead says Russian warships vs Georgian patrol boats off Abkhazia. Georgia is outside the 15 tracked countries",
  },
  {
    qid: "Q698771",
    ref: "F4",
    set: { countries: ["Somalia"] },
    note: "Operation Atalanta (EU naval force off Somalia): tagged Yemen only via P276 Gulf of Aden; Wikidata P17 = Somalia (Q1045)",
  },
  {
    qid: "Q17354007",
    ref: "F4",
    set: { countries: ["France"] },
    note: "Operation Barkhane (French operation in the Sahel): tagged Egypt only via P276 Sahel; Wikidata P17 = France (Q142)",
  },
  {
    qid: "Q86831539",
    ref: "F4",
    set: { countries: ["Mali", "Burkina Faso", "Niger", "Benin", "Togo", "Mauritania", "Algeria", "Ivory Coast"] },
    note: "War in the Sahel: tagged Egypt only via P276 Sahel; Wikidata P17 = Mali, Burkina Faso, Niger, Benin, Togo, Mauritania, Algeria, Ivory Coast",
  },
];

DATA_FIXES.push({
  qid: "Q255997",
  ref: "F5",
  set: { date_start: "2004-06-01" },
  note:
    "Houthi insurgency: stored date_start 2015-02-06 was Wikidata P585; Wikidata P580 = 2004-06 (month precision) " +
    'and the Wikipedia lead says "The conflict was sparked in 2004" (checked 2026-09-29). date_start = P580, day unknown',
});

// F6: Wikidata P585 ("point in time") is the battle's END, later than the item's own P582, so the
// pipeline's COALESCE(P585, P580) start came out after the end. In all three the Wikipedia infobox
// start equals Wikidata P580 and the infobox end equals Wikidata P585 (checked live 2026-10-01).
DATA_FIXES.push(
  {
    qid: "Q17286795",
    ref: "F6",
    set: { date_start: "2014-06-26", date_end: "2014-07-21" },
    note:
      "First Battle of Tikrit: stored start 2014-07-21 was Wikidata P585, after P582 2014-06-30. Wikipedia infobox " +
      '"26 June – 21 July 2014" = Wikidata P580 (2014-06-26) and P585 (2014-07-21). Dates = the infobox',
  },
  {
    qid: "Q19926256",
    ref: "F6",
    set: { date_start: "2015-05-13", date_end: "2015-05-26" },
    note:
      "Palmyra offensive (May 2015): stored start 2015-05-26 was Wikidata P585, after P582 2015-05-25. Wikipedia infobox " +
      '"13–26 May 2015" = Wikidata P580 (2015-05-13) and P585 (2015-05-26). Dates = the infobox',
  },
  {
    qid: "Q24205448",
    ref: "F6",
    set: { date_start: "2016-05-22", date_end: "2016-06-29" },
    note:
      "Third Battle of Fallujah: stored start 2016-06-29 was Wikidata P585, after P582 2016-06-26. Wikipedia infobox " +
      '"22 May – 29 June 2016" = Wikidata P580 (2016-05-22) and P585 (2016-06-29). Dates = the infobox',
  }
);

// F7: a month-precision Wikidata P585 ("2023-10", stored as the 1st) won the pipeline's COALESCE(P585, P580) over the
// item's day-precision P580. Wikipedia and Wikidata P580 agree on the day (checked live 2026-10-04).
DATA_FIXES.push({
  qid: "Q122976243",
  ref: "F7",
  set: { date_start: "2023-10-07" },
  note:
    "October 7 attacks: stored date_start 2023-10-01 was Wikidata P585 2023-10 (month precision) pinned to the 1st. " +
    'Wikidata P580 = 2023-10-07 (day precision); the Wikipedia infobox reads "October 7–8, 2023" and the lead "On October 7, 2023" ' +
    "(checked 2026-10-04). date_start = P580. date_end (P582 2023-10-09; infobox 8 October) is not changed: the sources differ",
});

// F8: the same pattern as F7 in four more events, found by the month_precision_day_in_lead flag. In each, Wikidata
// P580 (day precision) and the Wikipedia infobox give the same start day (checked live 2026-10-04); date_end unchanged.
for (const [qid, date, label, infobox] of [
  ["Q2009640", "1999-12-24", "Indian Airlines Flight 814", "24 December 1999 – 31 December 1999"],
  ["Q120201630", "2023-07-03", "July 2023 Jenin incursion", "3–5 July 2023"],
  ["Q123014721", "2023-10-07", "Zikim attack", "7 October 2023"],
  ["Q131401087", "2024-12-07", "Fall of Damascus (2024)", "7–8 December 2024"],
]) {
  DATA_FIXES.push({
    qid,
    ref: "F8",
    set: { date_start: date },
    note:
      `${label}: stored date_start was Wikidata P585 (month precision) pinned to the 1st. Wikidata P580 = ${date} (day precision); ` +
      `the Wikipedia infobox reads "${infobox}" (checked 2026-10-04). date_start = P580`,
  });
}

export const FIXES_BY_QID =new Map(DATA_FIXES.map((f) => [f.qid, f]));

// Applies the ledger entry for event.wikidata_qid (if any). Returns the changed field names.
export function applyDataFix(event) {
  const fix = FIXES_BY_QID.get(event.wikidata_qid);
  if (!fix) return [];
  const changed = [];
  for (const [k, v] of Object.entries(fix.set)) {
    if (JSON.stringify(event[k]) !== JSON.stringify(v)) {
      event[k] = v;
      changed.push(k);
    }
  }
  if (changed.length) {
    const msg = `data_fix ${fix.ref}: ${fix.note} (fields: ${changed.join(", ")}; see docs/data-fixes.md)`;
    event.review_reasons = [...(event.review_reasons ?? []).filter((r) => !r.startsWith(`data_fix ${fix.ref}:`)), msg];
    event.needs_review = true;
  }
  return changed;
}

const normWdTime = (t) => String(t ?? "").replace(/-00(?=-|$)/g, "-01"); // Wikidata "1940-00-00" is stored as 1940-01-01

// Precision of the date the event actually KEEPS as date_start: the Wikidata P585/P580 statement whose value is that
// date. An exact match wins over a match only after the "-00" -> "-01" normalisation (so a day-precision 2023-10-01
// beats a month-precision 2023-10); within each, P585 before P580 (the discovery query's COALESCE order).
// Returns { code, name, property } or null when no statement of the item has that value (the date then did not
// come from Wikidata, e.g. a ledger date taken from the Wikipedia infobox, and no precision can be derived).
export function keptDatePrecision(entity, dateStart) {
  if (!entity || !dateStart) return null;
  const vals = [
    ...(entity.p585 ?? []).map((v) => ({ ...v, property: "P585" })),
    ...(entity.p580 ?? []).map((v) => ({ ...v, property: "P580" })),
  ];
  const hit = vals.find((v) => v.time === dateStart) ?? vals.find((v) => normWdTime(v.time) === dateStart);
  if (!hit) return null;
  return { code: hit.precision, name: precisionName(hit.precision), property: hit.property };
}

// Rule for Wikidata "point in time" (P585) mis-used as a range bound. The pipeline's date is
// COALESCE(P585, P580). Use the item's own P580 (start time) instead when EITHER
//   (a) P585 is only decade-or-coarser precise while P580 is year-or-finer, or
//   (b) P585 is identical to the item's end time (P582), i.e. the "point in time" is the END of the event.
// Nothing else is changed; both original values stay visible in the flag.
export function reconcileStartDate(candidateStart, entity) {
  if (!entity) return null;
  const p585 = entity.p585?.[0];
  const p580 = entity.p580?.[0];
  const p582 = entity.p582?.[0];
  const norm = (t) => String(t ?? "").replace(/-00(?=-|$)/g, "-01"); // the pipeline stores Wikidata "1940-00-00" as 1940-01-01
  if (!p585 || !p580 || norm(p585.time) !== norm(candidateStart)) return null;
  const coarse = p585.precision < 9 && p580.precision >= 9;
  const isEnd = p582 && p585.time === p582.time && p580.time !== p585.time;
  if (!coarse && !isEnd) return null;
  return {
    date_start: p580.time.replace(/-00(?=-|$)/g, "-01"),
    reason: coarse
      ? `Wikidata P585 ${p585.time} is only ${p585.precision <= 8 ? "decade-or-coarser" : "coarse"} precision; used P580 start time ${p580.time}`
      : `Wikidata P585 ${p585.time} equals the item's end time (P582); used P580 start time ${p580.time}`,
  };
}
