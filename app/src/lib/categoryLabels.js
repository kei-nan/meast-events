// Display labels for the category ids ("our grouping"), shared by the map
// legend, filters, rows and detail view; URLs and data keep the ids.
export const CATEGORY_LABELS = {
  war: "War",
  treaty: "Treaty",
  political: "Political",
  uprising: "Uprising",
  protest: "Protest (protest, demonstration, riot)",
  migration: "Migration",
  diplomatic: "Diplomatic",
  economic: "Economic",
  terrorism: "Terrorism (Wikidata: terrorist attack, suicide attack, hostage taking, hijacking)",
  atrocity: "Atrocity (genocide, massacre, war crime, ethnic cleansing)",
  mixed: "Mixed (classes from more than one group)",
  unclassified: "Unclassified (no listed Wikidata class)",
};

/** Label for a category id; an unknown id is shown capitalized, never dropped. */
export function categoryLabel(id) {
  if (!id) return "";
  return CATEGORY_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Label without its parenthetical gloss, for tight spots (active-filter chips). */
export function categoryShortLabel(id) {
  return categoryLabel(id).replace(/\s*\(.*\)$/, "");
}

// The grouping rule's class table (scripts/lib/event-classes.js EVENT_CLASSES: label -> group); kept equal to it by
// scripts/lib/validate.test.js. Only used to name the Wikidata classes behind an event's group.
export const CLASS_GROUPS = [
  ["battle", "war"], ["war", "war"], ["military operation", "war"], ["treaty", "treaty"], ["coup d'état", "political"],
  ["assassination", "political"], ["genocide", "atrocity"], ["massacre", "atrocity"], ["terrorist attack", "terrorism"],
  ["revolution", "uprising"], ["rebellion", "uprising"], ["population transfer", "migration"], ["siege", "war"],
  ["war crime", "atrocity"], ["hostage taking", "terrorism"], ["aircraft hijacking", "terrorism"], ["ceasefire", "diplomatic"],
  ["armistice", "treaty"], ["peace conference", "diplomatic"], ["embargo", "economic"], ["nationalization", "economic"],
  ["declaration of independence", "political"], ["referendum", "political"], ["armed conflict", "war"],
  ["military campaign", "war"], ["military occupation", "war"], ["airstrike", "war"], ["bombardment", "war"],
  ["aircraft shootdown", "war"], ["suicide attack", "terrorism"], ["pogrom", "atrocity"], ["mass murder", "atrocity"],
  ["riot", "protest"], ["political crisis", "political"], ["international crisis", "political"],
  ["public election", "political"], ["protest", "protest"], ["demonstration", "protest"], ["summit", "diplomatic"],
  ["ethnic cleansing", "atrocity"],
];
const GROUP_OF = new Map(CLASS_GROUPS);

const OVERRIDING = ["terrorism", "atrocity"];

/**
 * The listed Wikidata classes behind an event's group, as [class, group] pairs: the terrorism or atrocity classes for
 * those groups, otherwise every listed class (one group, or several for "mixed"); [] for an unclassified event or one
 * whose classes are not loaded. The same rule as scripts/lib/event-classes.js groupBasis.
 */
export function categoryBasis(event) {
  const listed = [...new Set(event?.wikidata_classes ?? [])].filter((l) => GROUP_OF.has(l)).map((l) => [l, GROUP_OF.get(l)]);
  if (OVERRIDING.includes(event?.category)) return listed.filter(([, g]) => g === event.category);
  return listed;
}

/**
 * The header text after "Category: ", attributing the group to Wikidata's classes. That attribution is what tells
 * the reader the group is ours; "our grouping" itself is said once, where the groups are introduced (legend, About,
 * the export's column name).
 */
export function categoryWithBasis(event) {
  const label = categoryShortLabel(event?.category);
  if (event?.category === "unclassified") return `${label}: none of its Wikidata classes is on our list`;
  const basis = categoryBasis(event);
  if (!basis.length) return label;
  if (event.category === "mixed") {
    const list = basis.map(([l, g]) => `${l} (${categoryShortLabel(g)})`).join(", ");
    return `${label} — Wikidata’s classes point to more than one group: ${list}`;
  }
  const quoted = basis.map(([l]) => `“${l}”`).join(", ");
  return `${label}, from Wikidata’s class${basis.length > 1 ? "es" : ""} ${quoted}`;
}

/**
 * The group a framing-review category note was written about ("Shown as \"political\" because ..."), when it is no
 * longer the event's group; null when the note names no group or the current one. The note is kept as written and
 * shown with this date-stamp of what it describes.
 */
export function categoryNoteOutdated(note, category) {
  const named = (note ?? "").match(/"([a-z]+)"/)?.[1];
  return named && named in CATEGORY_LABELS && named !== category ? named : null;
}
