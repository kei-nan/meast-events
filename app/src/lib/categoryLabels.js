// Display labels for the category ids ("our grouping"), shared by the map
// legend, filters, rows and detail view; URLs and data keep the ids.
export const CATEGORY_LABELS = {
  war: "War",
  treaty: "Treaty",
  political: "Political",
  uprising: "Uprising",
  migration: "Migration",
  diplomatic: "Diplomatic",
  economic: "Economic",
  terrorism: "Terrorism",
  atrocity: "Atrocity (genocide, massacre, war crime)",
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
