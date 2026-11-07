// The first line of the panel's empty list (components/SearchPanel.jsx): why
// nothing is listed. It must agree with the status line above it, which counts
// the matches over the whole timeline ("0 results in selected years · Show
// all 29"): "no events in this atlas match" only when there are none at all.
//
//   textQuery  the searched text ("" when the search is filters only)
//   searching  a search or filters are active (otherwise the browse list)
//   inView     "In map view" is on
//   scope      "range" while only the selected years are listed, else "all"
//   counts     App's {all, inRange, unfiltered}: the matches over the whole
//              timeline and in the selected years, both before "In map view";
//              `unfiltered` the text's matches with no category, country or
//              area filter (hooks/useEventSearch.js unfilteredTotal; counted
//              only when those filters leave none)
//   filters    which of those filters are on: {categories, countries, area}
//   offline    the full text could not be searched (titles and summaries only)
export function emptyResultsText({ textQuery = "", searching = false, inView = false, scope = "all", counts = null, filters = null, offline = false }) {
  if (!searching) return inView ? "No events in the selected years in this map view." : "No events in the selected years.";
  const what = textQuery ? `“${textQuery}”` : "these filters";
  if (!counts?.all) {
    // The text matches events, only none that the filters keep.
    const named = filterNames(filters);
    if (textQuery && counts?.unfiltered > 0 && named) {
      const withFilters = `with the ${named} filter${named.includes(" and ") ? "s" : ""}`;
      if (offline) return `No titles or summaries matching “${textQuery}” ${withFilters}; the full text could not be searched.`;
      return `No events matching “${textQuery}” ${withFilters}.`;
    }
    if (textQuery && offline) return `No titles or summaries match “${textQuery}”; the full text could not be searched.`;
    return `No events in this atlas match ${what}.`;
  }
  // There are matches, outside what is listed: the selected years or the map view.
  const matching = `No events matching ${what}`;
  if (scope === "range" && !counts.inRange) return `${matching} in the selected years.`;
  if (inView) return `${matching} ${scope === "range" ? "in the selected years in this map view" : "in this map view"}.`;
  return `${matching} in the selected years.`;
}

// "category", "category and area", "category, country and area"; "" for none.
function filterNames(filters) {
  const names = [];
  if (filters?.categories) names.push("category");
  if (filters?.countries) names.push("country");
  if (filters?.area) names.push("area");
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
