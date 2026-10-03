// Display labels for the category ids ("our grouping"). Same text as the map
// legend (components/MapUi.jsx CATEGORY_TEXT); URLs and data keep the ids.
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
