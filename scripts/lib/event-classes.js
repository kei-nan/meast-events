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
  { qid: "Q217327", label: "suicide attack", category: "terrorism" },
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

// "Not events" (docs/DATA_POLICY.md): an entry whose Wikidata item is a person, an organisation, a state or the history
// of a country is not an event and is not included, whatever else it is typed as. Matched against the stored
// `wikidata_classes` labels (Wikidata's English P31 labels); each QID's label was checked with wbgetentities on
// 2026-10-15. The first eleven are the classes of the nine entries removed on 2026-10-09; "history of a country or
// state" was added on 2026-10-15 (Jordanian independence, whose item is "history of Jordan").
export const NOT_EVENT_CLASSES = [
  { qid: "Q5", label: "human", kind: "person" },
  { qid: "Q43229", label: "organization", kind: "organisation" },
  { qid: "Q7210356", label: "political organization", kind: "organisation" },
  { qid: "Q15627509", label: "military organization", kind: "organisation" },
  { qid: "Q17127659", label: "terrorist organization", kind: "organisation" },
  { qid: "Q17149090", label: "armed organization", kind: "organisation" },
  { qid: "Q3024240", label: "historical country", kind: "state" },
  { qid: "Q7275", label: "state", kind: "state" },
  { qid: "Q3624078", label: "sovereign state", kind: "state" },
  { qid: "Q21512251", label: "self-proclaimed state", kind: "state" },
  { qid: "Q23037160", label: "quasi-state", kind: "state" },
  { qid: "Q17544377", label: "history of a country or state", kind: "history of a country" },
];
const NOT_EVENT_BY_LABEL = new Map(NOT_EVENT_CLASSES.map((c) => [c.label, c]));

// The not-event classes among an entry's Wikidata classes ([] for an event).
export const notEventClasses = (wikidataClasses) =>
  (wikidataClasses ?? []).map((l) => NOT_EVENT_BY_LABEL.get(l)).filter(Boolean);

// Objective inclusion threshold: Wikidata sitelinks (number of Wikimedia-project pages).
export const INCLUSION_MIN_SITELINKS = 10;

// Added 2026-10-25. "Ethnic cleansing" (Q154278; English label checked in WDQS on 2026-10-25, a subclass of "forced
// displacement" and "atrocity" there) is in the overriding atrocity group like genocide and massacre. Before, the five
// events Wikidata types this way were shown as "migration" through their "population transfer" class. The class has 5
// dated in-region items with >=10 sitelinks, all already found by other classes, so it adds no new events today.
export const ATROCITY_GAP_CLASSES = [{ qid: "Q154278", label: "ethnic cleansing", category: "atrocity" }];

export const EVENT_CLASSES = [
  ...ORIGINAL_EVENT_CLASSES,
  ...NEW_EVENT_CLASSES,
  ...GAP_EVENT_CLASSES,
  ...CIVIC_EVENT_CLASSES,
  ...ATROCITY_GAP_CLASSES,
];

// The group of an event whose Wikidata classes include none of the classes above. It is shown as such rather than given
// a group by hand.
export const UNCLASSIFIED = "unclassified";

// Every group an event can have.
export const GROUPS = [...new Set(EVENT_CLASSES.map((c) => c.category)), UNCLASSIFIED];

// Groups that override whatever group an event would otherwise get, checked in this order.
// An item Wikidata types as both a "massacre" and a "terrorist attack" is shown as terrorism,
// and every genocide, massacre or war crime is "atrocity" rather than folded into "political".
export const OVERRIDING_GROUPS = ["terrorism", "atrocity"];

const GROUP_OF_LABEL = Object.fromEntries(EVENT_CLASSES.map((c) => [c.label, c.category]));
const TABLE_ORDER = EVENT_CLASSES.map((c) => c.label);

// The one grouping rule (docs/DATA_POLICY.md, "Category (our grouping)"), applied identically to every event, hand-picked
// or discovered. `wikidataClasses` are the event's stored Wikidata class labels (its P31 classes plus the listed classes
// it is an instance of through P279*). Returns the group and the classes that decided it:
//   1. any class in the terrorism group -> terrorism; else any in the atrocity group -> atrocity (every such class listed);
//   2. otherwise the group of the listed class that comes first in EVENT_CLASSES;
//   3. otherwise "unclassified" (no deciding class).
export function groupBasis(wikidataClasses) {
  const classes = (wikidataClasses ?? []).filter((l) => GROUP_OF_LABEL[l]);
  for (const g of OVERRIDING_GROUPS) {
    const deciding = classes.filter((l) => GROUP_OF_LABEL[l] === g);
    if (deciding.length) return { group: g, classes: deciding };
  }
  const first = TABLE_ORDER.find((l) => classes.includes(l));
  return first ? { group: GROUP_OF_LABEL[first], classes: [first] } : { group: UNCLASSIFIED, classes: [] };
}

export const groupForEvent = (wikidataClasses) => groupBasis(wikidataClasses).group;
