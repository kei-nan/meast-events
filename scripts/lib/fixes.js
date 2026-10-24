// Ledger of verified data fixes (each mirrored, with evidence, in docs/data-fixes.md).
// A fix is applied ONLY to a listed Wikidata item, after the discrepancy was checked against
// live Wikipedia + Wikidata (2026-09-26). Everything not listed is at most FLAGGED, never changed.
// ids are never changed.
import { precisionName } from "./wiki.js";
import { coordinateFlag } from "./flags.js";
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

// F10: the F7/F8 pattern in three events found by the classes added on 2026-10-06 (checked live 2026-10-07).
for (const [qid, date, label, infobox] of [
  ["Q125464497", "2024-04-13", "April 2024 Iranian strikes on Israel", "13–14 April 2024"],
  ["Q131392292", "2024-12-05", "2024 Homs offensive", "5 December 2024 – 8 December 2024"],
  ["Q33038478", "2020-11-21", "2020 G20 Riyadh summit", "21–23 November 2020"],
]) {
  DATA_FIXES.push({
    qid,
    ref: "F10",
    set: { date_start: date },
    note:
      `${label}: stored date_start was Wikidata P585 (month precision) pinned to the 1st. Wikidata P580 = ${date} (day precision); ` +
      `the Wikipedia infobox reads "${infobox}" (checked 2026-10-07). date_start = P580`,
  });
}

// F11: pins that were another item's location. The owner's rule (2026-10-10): an event is pinned only at its
// OWN location - the event item's Wikidata P625 (or its own article's coordinates) - else it has no location.
// Each title below resolves to a different item's article (resolved_qid), whose point enrich-candidates.js used.
// Wikidata P625 of both items checked live 2026-10-10. enrich-candidates.js applies the same rule to new candidates.
for (const [qid, coordinates, label, evidence] of [
  ["Q124309366", { lat: 27.370833333333334, lon: 62.3325 }, "Operation Marg Bar Sarmachar",
    "pin 27.1667, 64.2667 (Pakistan) was the article \"2024 Iranian missile strikes in Pakistan\" (Q124306685); the operation's own P625 = 27.370833, 62.3325"],
  ["Q19831524", { lat: 36.258333, lon: 35.903611 }, "Musa Dagh Resistance",
    "pin was the article \"Musa Dagh\" (the mountain, Q1953975); the event's own P625 = 36.258333, 35.903611, the same place"],
  ["Q80438042", { lat: 33.299, lon: 44.396 }, "Attack on the United States embassy in Baghdad",
    "pin was the article \"December 2019 United States airstrikes in Iraq and Syria\" (Q26847124); the event's own P625 = 33.299, 44.396, the same point"],
]) {
  DATA_FIXES.push({
    qid,
    ref: "F11",
    set: { coordinates, coordinate_source: "wikidata", location_quality: "precise", needs_manual_coordinates: false },
    note: `${label}: ${evidence}. coordinates = the event's own Wikidata P625`,
  });
}
DATA_FIXES.push({
  qid: "Q106786309",
  ref: "F11",
  set: { coordinates: null, coordinate_source: null, location_quality: "none", needs_manual_coordinates: true },
  note:
    "Operation Guardian of the Walls: pin 31, 35 was Wikidata P625 of Q106775117 (2021 Israel–Palestine crisis, the article its title " +
    "resolves to); the operation's own item has no P625. No location of its own, so none is shown",
});

// A link to one revision of an English Wikipedia page (the evidence for F13/F14).
export const revisionUrl = (title, revid) =>
  `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, "_"))}&oldid=${revid}`;

// F13 and F14: hand-picked seed events whose stored date_start is none of the item's Wikidata P585/P580 values
// (scripts/enrich-seed.js), checked by hand against the lead and infobox of the English article at the revision
// named (live 2026-10-24). Applied to data/events.json by `node scripts/enrich-seed.js --apply` only.
// F13: the article gives one of the item's own Wikidata day values as the start, so date_start = that value
// (Wikipedia and Wikidata agree against the seed date). date_end is not changed.
for (const [qid, date, label, wikidata, title, revid, says] of [
  ["Q2992403", "1920-03-08", "Franco-Syrian War", "P580 1920-03-08", "Franco-Syrian War", 1379975922,
    'infobox "8 March – 25 July 1920"'],
  ["Q154288", "1970-09-06", "Black September", "P580 1970-09-06", "Black September", 1377443084,
    'infobox "6 September 1970 – 23 July 1971" (the lead dates the main phase of the fighting 16–27 September 1970)'],
  ["Q45266620", "2017-12-06", "United States recognition of Jerusalem as capital of Israel", "P585 2017-12-06",
    "United States recognition of Jerusalem as capital of Israel", 1379528222,
    'lead "On December 6, 2017, the United States officially recognized Jerusalem"; infobox date_signed 2017-12-06'],
  ["Q131404510", "2024-12-08", "Fall of the Assad regime", "P585 2024-12-08", "Fall of the Assad regime", 1380552397,
    'lead "On 8 December 2024, the Assad regime in Syria collapsed"; infobox date 8 December 2024'],
  ["Q122974556", "2023-10-08", "Hezbollah–Israel conflict (2023–present)", "P580 2023-10-08",
    "Hezbollah–Israel conflict (2023–present)", 1368616555,
    'lead "began on 8 October 2023"; infobox (Template:Hezbollah–Israel conflict (2023–present) infobox, revision 1381585493) "8 October 2023 – present"'],
]) {
  DATA_FIXES.push({
    qid,
    ref: "F13",
    set: { date_start: date },
    note:
      `${label}: the seed date_start was none of the item's Wikidata P585/P580 values. Wikidata ${wikidata} (day precision); ` +
      `English Wikipedia ${revisionUrl(title, revid)}: ${says} (checked 2026-10-24). date_start = Wikidata ${wikidata.split(" ")[0]}; date_end unchanged`,
  });
}

// F14: the article states the stored date_start itself to the day, but Wikidata has no value equal to it (no date at
// all, a coarser one, or another day). The date is unchanged; date_precision = "day", with the article as its source.
for (const [qid, label, wikidata, title, revid, says] of [
  ["Q239060", "Arab Revolt", "P580 1916-06 (month)", "Arab Revolt", 1380894633,
    'infobox "10 June 1916 – 25 October 1918"; lead "officially initiated at Mecca on 10 June 1916"'],
  ["Q2821698", "Abolition of the Caliphate", "P585 1924 (year)", "Abolition of the Caliphate", 1380313801,
    'lead "abolished on 3 March 1924"; infobox date 3 March 1924'],
  ["Q99495661", "Abraham Accords", "P585 2020 (year)", "Abraham Accords", 1380714856,
    'lead "signed in Washington, D.C. on September 15, 2020"; infobox date_signed "September 15, 2020"'],
  ["Q4298662", "Young Turk Revolution", "P585 1908-07-24, the end of the infobox range", "Young Turk Revolution", 1380448478,
    'infobox "3–24 July 1908"'],
  ["Q164983", "Gallipoli campaign", "P580 1915-04-25, the landings", "Gallipoli campaign", 1379733603,
    'lead "from 19 February 1915 to 9 January 1916"; infobox "19 February 1915 – 9 January 1916"'],
  ["Q2281806", "1929 Palestine riots", "P585 1929-08-29, the end of the infobox range", "1929 Palestine riots", 1378961464,
    'infobox "23–29 August 1929"'],
  ["Q593774", "1953 Iranian coup d'état", "P580 1953-08-18", "1953 Iranian coup d'état", 1380975077,
    'infobox "15–19 August 1953"'],
  ["Q19682450", "Saudi-led intervention in the Yemeni civil war", "P580 2015-03-25", "Saudi-led intervention in the Yemeni civil war", 1380996194,
    'lead "On 26 March 2015, Saudi Arabia ... staged a military intervention"; infobox (Template:Saudi-led intervention in the Yemeni civil war infobox, revision 1379014728) "26 March 2015 – ongoing"'],
  ["Q52836581", "United States withdrawal from the Iran nuclear deal", "P585 2018-05-18", "United States withdrawal from the Iran nuclear deal", 1359899431,
    'lead "On 8 May 2018, the United States ... announced its withdrawal"'],
  ["Q1121819", "Emirate of Transjordan", "no P585/P580", "Emirate of Transjordan", 1377341920,
    'lead "established on 11 April 1921"; infobox date_start "11 April", year_start 1921'],
  ["Q846795", "United Nations Partition Plan for Palestine", "no P585/P580", "United Nations Partition Plan for Palestine", 1381412191,
    'lead "adopted by the UN General Assembly on 29 November 1947"; infobox date "29 November", year 1947'],
]) {
  DATA_FIXES.push({
    qid,
    ref: "F14",
    set: { date_precision: "day" },
    note:
      `${label}: the seed date_start is no Wikidata value (Wikidata: ${wikidata}). English Wikipedia ${revisionUrl(title, revid)}: ` +
      `${says} (checked 2026-10-24), the stored date_start. date_start unchanged; date_precision = day, from the article`,
  });
}

// The only ledger entries scripts/enrich-seed.js --apply applies (to hand-picked seed events).
export const SEED_FIX_REFS = ["F13", "F14"];

export const FIXES_BY_QID =new Map(DATA_FIXES.map((f) => [f.qid, f]));

// Coordinates that look swapped to the validator (outside the region, inside it with
// lat/lon exchanged) but were checked against BOTH sources and are what they give. Nothing
// is changed; validate.js reports them as the ordinary "outside the region" warning.
// Each entry is exact (item and point), so a later real swap on the same item still fails.
export const CHECKED_COORDINATES = [
  {
    qid: "Q696817",
    lat: 35,
    lon: 18,
    ref: "F9",
    note: "Mediterranean and Middle East theatre of World War II: Wikipedia {{Coord|35|N|18|E|type:waterbody}} (revision 1378869230) and Wikidata P625 both give 35N 18E, a point in the Ionian Sea standing for the whole theatre",
  },
];

export function coordinatesChecked(event) {
  const c = event?.coordinates;
  return CHECKED_COORDINATES.find((x) => x.qid === event?.wikidata_qid && c && x.lat === c.lat && x.lon === c.lon) ?? null;
}

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
  if (changed.includes("coordinates")) {
    // the distance flag was computed from the old point
    const far = coordinateFlag(event.coordinates, event.countries);
    event.review_reasons = [...(event.review_reasons ?? []).filter((r) => !r.startsWith("coordinate_far_from_countries")), ...(far ? [far] : [])];
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

// Precision of the stored date_end: the item's P582 (end time) statement whose value it is (exact match first,
// then after the "-00" -> "-01" normalisation). Same shape as keptDatePrecision; null when no P582 has that value.
export function keptEndPrecision(entity, dateEnd) {
  if (!entity || !dateEnd) return null;
  const vals = entity.p582 ?? [];
  const hit = vals.find((v) => v.time === dateEnd) ?? vals.find((v) => normWdTime(v.time) === dateEnd);
  return hit ? { code: hit.precision, name: precisionName(hit.precision), property: "P582" } : null;
}

// The last day (YYYY-MM-DD) of the period a stored Wikidata date stands for at precision `code`
// (11 day, 10 month, 9 year, 8 decade, 7 century, 6 millennium). The pipeline stores a coarse value
// such as "+2002-00-00" (year) as 2002-01-01; as an END bound it means "some time in 2002", so it is
// before a start only when the whole period is. Wikibase counts centuries 1901-2000 (it formats
// +2000 and +1901 at precision 7 both as "20. century", checked 2026-10-14 with wbformatvalue), and
// millennia likewise. null for an unparseable date or a precision coarser than a millennium.
export function lastDayOfPeriod(date, code) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const pad = (n) => String(n).padStart(4, "0");
  if (code == null || code >= 11) return date;
  if (code === 10) {
    const dim = new Date(Date.UTC(y, Number(m[2]), 0)).getUTCDate();
    return `${m[1]}-${m[2]}-${String(dim).padStart(2, "0")}`;
  }
  if (code === 9) return `${m[1]}-12-31`;
  if (code === 8) return `${pad(Math.floor(y / 10) * 10 + 9)}-12-31`;
  if (code === 7) return `${pad(Math.ceil(y / 100) * 100)}-12-31`;
  if (code === 6) return `${pad(Math.ceil(y / 1000) * 1000)}-12-31`;
  return null;
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
