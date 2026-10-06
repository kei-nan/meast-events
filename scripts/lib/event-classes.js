// Single source of truth for the Wikidata event classes and tracked countries used by
// the discovery pipeline. Every QID was verified against Wikidata (label check +
// instance counts in the tracked region) - see docs/DATA_POLICY.md.
//
// `category` is the coarse legacy grouping (kept on proposed events as
// `category_group`, only for map colours). The user-facing `category` of a proposed
// event is the Wikidata class label (`label`) - a pass-through of Wikidata's own
// classification, not an editorial label.

export const COUNTRIES = {
  Turkey: ["Q43"],
  Iran: ["Q794"],
  Iraq: ["Q796"],
  Syria: ["Q858"],
  Lebanon: ["Q822"],
  Jordan: ["Q810"],
  "Israel/Palestine": ["Q801", "Q219060", "Q193714", "Q36678", "Q39760"],
  Egypt: ["Q79"],
  "Saudi Arabia": ["Q851"],
  Yemen: ["Q805"],
  Kuwait: ["Q817"],
  Bahrain: ["Q398"],
  Qatar: ["Q846"],
  UAE: ["Q878"],
  Oman: ["Q842"],
};

export const QID_TO_COUNTRY = Object.fromEntries(
  Object.entries(COUNTRIES).flatMap(([name, qids]) => qids.map((q) => [q, name]))
);
export const ALL_COUNTRY_QIDS = Object.values(COUNTRIES).flat();

export const ORIGINAL_EVENT_CLASSES = [
  { qid: "Q178561", label: "battle", category: "war" },
  { qid: "Q198", label: "war", category: "war" },
  { qid: "Q645883", label: "military operation", category: "war" },
  { qid: "Q131569", label: "treaty", category: "treaty" },
  { qid: "Q45382", label: "coup d'état", category: "political" },
  { qid: "Q3882219", label: "assassination", category: "political" },
  { qid: "Q41397", label: "genocide", category: "atrocity" },
  { qid: "Q3199915", label: "massacre", category: "atrocity" },
  { qid: "Q2223653", label: "terrorist attack", category: "terrorism" },
  { qid: "Q10931", label: "revolution", category: "uprising" },
  { qid: "Q124734", label: "rebellion", category: "uprising" },
  { qid: "Q15589476", label: "population transfer", category: "migration" },
];

// Added to close the diplomatic/economic gap. Each QID was checked in WDQS (English label
// matches, and the class has dated in-region instances) on 2026-09-26; see DATA_POLICY.md
// for the instance counts. "embargo" and "nationalization" are kept because they were
// asked for even though WDQS shows 0 and 0 in-region instances with >=10 sitelinks.
export const NEW_EVENT_CLASSES = [
  { qid: "Q188055", label: "siege", category: "war" },
  { qid: "Q135010", label: "war crime", category: "atrocity" },
  { qid: "Q1371150", label: "hostage taking", category: "terrorism" },
  { qid: "Q898712", label: "aircraft hijacking", category: "terrorism" },
  { qid: "Q208383", label: "ceasefire", category: "diplomatic" },
  { qid: "Q107706", label: "armistice", category: "treaty" },
  { qid: "Q7157512", label: "peace conference", category: "diplomatic" },
  { qid: "Q989265", label: "embargo", category: "economic" },
  { qid: "Q178564", label: "nationalization", category: "economic" },
  { qid: "Q1464916", label: "declaration of independence", category: "political" },
  { qid: "Q43109", label: "referendum", category: "political" },
];

// Added 2026-10-06 to close a modelling gap: well-known events that Wikidata types only with
// these classes (e.g. Deir Yassin and the Farhud as "mass murder"/"pogrom", Operation Opera as
// "airstrike", the Sbarro bombing as "suicide attack") were never found. Each QID's English label
// was checked with wbsearchentities and each class probed in WDQS on 2026-10-06 (counts in
// DATA_POLICY.md). Appended last, so a class above still decides the group of an item that
// matches both.
export const GAP_EVENT_CLASSES = [
  { qid: "Q350604", label: "armed conflict", category: "war" },
  { qid: "Q831663", label: "military campaign", category: "war" },
  { qid: "Q188686", label: "military occupation", category: "war" },
  { qid: "Q2380335", label: "airstrike", category: "war" },
  { qid: "Q678146", label: "bombardment", category: "war" },
  { qid: "Q6539177", label: "aircraft shootdown", category: "war" },
  { qid: "Q217327", label: "suicide attack", category: "war" },
  { qid: "Q177716", label: "pogrom", category: "atrocity" },
  { qid: "Q750215", label: "mass murder", category: "atrocity" },
  { qid: "Q124757", label: "riot", category: "protest" },
  { qid: "Q3002772", label: "political crisis", category: "political" },
  { qid: "Q5791104", label: "international crisis", category: "political" },
];

// Added 2026-10-06 for civic events the policy named as under-found (elections, protests, summits).
export const CIVIC_EVENT_CLASSES = [
  { qid: "Q40231", label: "public election", category: "political" },
  { qid: "Q273120", label: "protest", category: "protest" },
  { qid: "Q175331", label: "demonstration", category: "protest" },
  { qid: "Q1072326", label: "summit", category: "diplomatic" },
];

// Objective inclusion threshold: Wikidata sitelinks (number of Wikimedia-project pages).
export const INCLUSION_MIN_SITELINKS = 10;

export const EVENT_CLASSES = [...ORIGINAL_EVENT_CLASSES, ...NEW_EVENT_CLASSES, ...GAP_EVENT_CLASSES, ...CIVIC_EVENT_CLASSES];

// Groups that override whatever group an event would otherwise get, checked in this order.
// An item Wikidata types as both a "massacre" and a "terrorist attack" is shown as terrorism,
// whichever class discovery happened to match first, and every genocide, massacre or war crime
// is "atrocity" rather than folded into "political". Applied the same way to every event,
// curated or discovered; an event matching none keeps its existing group.
export const OVERRIDING_GROUPS = ["terrorism", "atrocity"];

const GROUP_OF_LABEL = Object.fromEntries(EVENT_CLASSES.map((c) => [c.label, c.category]));

export function groupForEvent(wikidataClasses, currentGroup) {
  const groups = new Set((wikidataClasses ?? []).map((l) => GROUP_OF_LABEL[l]).filter(Boolean));
  return OVERRIDING_GROUPS.find((g) => groups.has(g)) ?? currentGroup;
}
