// Ledger of verified data fixes (each mirrored, with evidence, in docs/data-fixes.md).
// A fix is applied ONLY to a listed Wikidata item, after the discrepancy was checked against
// live Wikipedia + Wikidata (2026-09-26). Everything not listed is at most FLAGGED, never changed.
// ids are never changed.
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

export const FIXES_BY_QID = new Map(DATA_FIXES.map((f) => [f.qid, f]));

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
  if (!p585 || !p580 || p585.time !== candidateStart) return null;
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
