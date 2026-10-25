// Which of an event's Wikidata classes the event panel and the event pages list. Pure.
//
// Only the classes on the inclusion rule's event-class list (scripts/lib/event-classes.js
// EVENT_CLASSES; eventClasses.test.js keeps the two lists equal): the classes that decided
// that the event is included and, for terrorism and atrocity, its category. An item's other
// P31 classes decide nothing here and no review reads them (some are one side's description,
// such as "liberation" or "sea piracy"), so they are not listed; the line links to the
// Wikidata item, which has them all. One rule for every event (docs/DATA_POLICY.md,
// "Wikidata classes"); the labels are Wikidata's, unchanged.

export const RULE_CLASS_LABELS = [
  "battle", "war", "military operation", "treaty", "coup d'état", "assassination", "genocide", "massacre",
  "terrorist attack", "revolution", "rebellion", "population transfer",
  "siege", "war crime", "hostage taking", "aircraft hijacking", "ceasefire", "armistice", "peace conference",
  "embargo", "nationalization", "declaration of independence", "referendum",
  "armed conflict", "military campaign", "military occupation", "airstrike", "bombardment", "aircraft shootdown",
  "suicide attack", "pogrom", "mass murder", "riot", "political crisis", "international crisis",
  "public election", "protest", "demonstration", "summit",
];
const ON_LIST = new Set(RULE_CLASS_LABELS);

/**
 * The event's Wikidata classes that are on the event-class list, in Wikidata's order, or []
 * when they say nothing more than the category does (a "war" event typed only "war").
 */
export function shownClasses(event) {
  const classes = (event?.wikidata_classes ?? []).filter((c) => typeof c === "string" && ON_LIST.has(c));
  const category = String(event?.category ?? "").toLowerCase();
  return classes.some((c) => c.toLowerCase() !== category) ? classes : [];
}
