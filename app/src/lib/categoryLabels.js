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
  unclassified: "Unclassified (no listed Wikidata class)",
};

// The grouping rule's class table (scripts/lib/event-classes.js EVENT_CLASSES, in its order: label -> group); kept equal
// to it by scripts/lib/validate.test.js. Only used to say which Wikidata class decided an event's group.
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

/**
 * The Wikidata classes of an event that gave it its group (the overriding terrorism/atrocity classes, else the first
 * listed class in table order), or [] for an unclassified event or one whose classes are not loaded.
 */
export function categoryBasis(event) {
  const classes = (event?.wikidata_classes ?? []).filter((l) => GROUP_OF.get(l) === event?.category);
  if (event?.category === "terrorism" || event?.category === "atrocity") return classes;
  const first = CLASS_GROUPS.find(([l]) => (event?.wikidata_classes ?? []).includes(l));
  return first && first[1] === event?.category ? [first[0]] : [];
}

/** "Terrorism, from Wikidata's class “suicide attack”": the header text, attributing the group to Wikidata's class. */
export function categoryWithBasis(event) {
  const label = categoryShortLabel(event?.category);
  const basis = categoryBasis(event);
  if (event?.category === "unclassified") return `${label}: none of its Wikidata classes is on our list`;
  if (!basis.length) return label;
  const quoted = basis.map((l) => `“${l}”`).join(", ");
  return `${label}, from Wikidata’s class${basis.length > 1 ? "es" : ""} ${quoted}`;
}

/** Label for a category id; an unknown id is shown capitalized, never dropped. */
export function categoryLabel(id) {
  if (!id) return "";
  return CATEGORY_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Label without its parenthetical gloss, for tight spots (active-filter chips). */
export function categoryShortLabel(id) {
  return categoryLabel(id).replace(/\s*\(.*\)$/, "");
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
