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

import { wikidataUrl } from "./partOf.js";

// The grouping rule's class table (scripts/lib/event-classes.js EVENT_CLASSES: label -> group, and the class's own
// Wikidata QID); kept equal to it by scripts/lib/validate.test.js. Only used to name, and link to, the Wikidata classes
// behind an event's group.
export const CLASS_GROUPS = [
  ["battle", "war", "Q178561"], ["war", "war", "Q198"], ["military operation", "war", "Q645883"],
  ["treaty", "treaty", "Q131569"], ["coup d'état", "political", "Q45382"],
  ["assassination", "political", "Q3882219"], ["genocide", "atrocity", "Q41397"],
  ["massacre", "atrocity", "Q3199915"], ["terrorist attack", "terrorism", "Q2223653"],
  ["revolution", "uprising", "Q10931"], ["rebellion", "uprising", "Q124734"],
  ["population transfer", "migration", "Q15589476"], ["siege", "war", "Q188055"],
  ["war crime", "atrocity", "Q135010"], ["hostage taking", "terrorism", "Q1371150"],
  ["aircraft hijacking", "terrorism", "Q898712"], ["ceasefire", "diplomatic", "Q208383"],
  ["armistice", "treaty", "Q107706"], ["peace conference", "diplomatic", "Q7157512"],
  ["embargo", "economic", "Q989265"], ["nationalization", "economic", "Q178564"],
  ["declaration of independence", "political", "Q1464916"], ["referendum", "political", "Q43109"],
  ["armed conflict", "war", "Q350604"], ["military campaign", "war", "Q831663"],
  ["military occupation", "war", "Q188686"], ["airstrike", "war", "Q2380335"], ["bombardment", "war", "Q678146"],
  ["aircraft shootdown", "war", "Q6539177"], ["suicide attack", "terrorism", "Q217327"],
  ["pogrom", "atrocity", "Q177716"], ["mass murder", "atrocity", "Q750215"], ["riot", "protest", "Q124757"],
  ["political crisis", "political", "Q3002772"], ["international crisis", "political", "Q5791104"],
  ["public election", "political", "Q40231"], ["protest", "protest", "Q273120"],
  ["demonstration", "protest", "Q175331"], ["summit", "diplomatic", "Q1072326"],
  ["ethnic cleansing", "atrocity", "Q154278"],
];
const GROUP_OF = new Map(CLASS_GROUPS.map(([label, group]) => [label, group]));
const QID_OF = new Map(CLASS_GROUPS.map(([label, , qid]) => [label, qid]));

/** The Wikidata page of a class on the grouping rule's list (by its label), or null for any other label. */
export function classUrl(label) {
  return wikidataUrl(QID_OF.get(label));
}

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

// The groups behind a "mixed" event, as [group, its classes] in one fixed order (the order of CATEGORY_LABELS), so
// the order of Wikidata's class list plays no part.
function mixedGroups(basis) {
  return Object.keys(CATEGORY_LABELS)
    .map((g) => [g, basis.filter(([, lg]) => lg === g).map(([l]) => l)])
    .filter(([, classes]) => classes.length);
}

/**
 * The header text after "Category: ": the group alone, or for "mixed" the groups its classes belong to ("Mixed: War,
 * Political"). Where it comes from is in categorySourceParts, one tap away. "Our grouping" itself is said once, where
 * the groups are introduced (legend, About, the export's column name).
 */
export function categorySummary(event) {
  const label = categoryShortLabel(event?.category);
  if (event?.category !== "mixed") return label;
  const groups = mixedGroups(categoryBasis(event)).map(([g]) => categoryShortLabel(g));
  return groups.length ? `${label}: ${groups.join(", ")}` : label;
}

/**
 * Where the group comes from, as pieces for the event panel and the event pages to render: plain strings, and
 * {label, url} for each Wikidata class named (its label, unchanged, and the Wikidata page of that class, or null), so
 * the class can be linked. [] when there is nothing to say (no group, or the classes are not loaded). The same rule
 * for every group and every event.
 */
export function categorySourceParts(event) {
  if (event?.category === "unclassified") return ["None of its Wikidata classes is on our list"];
  const basis = categoryBasis(event);
  if (!event?.category || !basis.length) return [];
  const cls = (l) => ({ label: l, url: classUrl(l) });
  if (event.category === "mixed") {
    const parts = ["From Wikidata’s classes: "];
    mixedGroups(basis).forEach(([g, classes], i) => {
      if (i) parts.push("; ");
      classes.forEach((l, j) => parts.push(...(j ? [", "] : []), cls(l)));
      parts.push(` (${categoryShortLabel(g)})`);
    });
    return parts;
  }
  const parts = [`From Wikidata’s class${basis.length > 1 ? "es" : ""} `];
  basis.forEach(([l], i) => parts.push(i ? ", “" : "“", cls(l), "”"));
  return parts;
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
