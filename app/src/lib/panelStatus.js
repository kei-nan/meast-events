// The search panel's status line and its scope button (components/SearchPanel.jsx). Pure.

const plural = (n) => `${n} result${n === 1 ? "" : "s"}`;

/**
 * The status line: `text`, and `extra` (screen-reader-only text repeating what the scope button
 * next to the visible line says). `years` names the selected years: the visible line passes null
 * and says "selected years" (the timeline shows them); the announcement spells them out.
 *
 * @param {object} s
 * @param {string|null} s.years
 * @param {boolean} s.eventsLoading
 * @param {unknown} s.eventsError
 * @param {boolean} s.loading       the search is still running
 * @param {boolean} s.interim       the results so far are the instant title/summary matches
 * @param {number} s.resultCount    results listed now
 * @param {number} s.total          all results
 * @param {boolean} s.searching     a query, filter or area is set
 * @param {boolean} s.inView        "Only in current map view"
 * @param {"all"|"range"} s.scope
 * @param {number|null} s.shownInRange  results in the selected years (when the whole timeline is listed), else null
 * @returns {{text: string, extra: string}}
 */
export function describeStatus({ years, eventsLoading, eventsError, loading, interim, resultCount, total, searching, inView, scope, shownInRange }) {
  const sel = years ?? "selected years";
  if (eventsLoading) return { text: "Loading events…", extra: "" };
  if (eventsError) return { text: "Events could not be loaded - retrying", extra: "" };
  if (loading && interim && resultCount > 0)
    return { text: `${total} title/summary match${total === 1 ? "" : "es"} so far - full-text search running…`, extra: "" };
  if (loading && resultCount === 0) return { text: "Searching…", extra: "" };
  if (!searching)
    return {
      text: `${total} event${total === 1 ? "" : "s"} in ${years ?? "the selected years"}${inView ? ", in map view" : ""}`,
      extra: "",
    };
  if (scope === "range") return { text: `${plural(total)} in ${sel}`, extra: "" };
  if (total === 0) return { text: "0 results", extra: "" };
  if (shownInRange === 0) return { text: `${plural(total)} (none in ${sel})`, extra: "" };
  if (shownInRange !== null && shownInRange !== total) return { text: plural(total), extra: `, ${shownInRange} in ${sel}` };
  return { text: plural(total), extra: "" };
}

/**
 * The scope button beside the status line, or null. The relevance order is kept in both scopes;
 * the button only switches between listing every match and listing the ones in the selected years.
 *
 * @param {object} s
 * @param {boolean} s.settled       the events are in and the search has finished
 * @param {"all"|"range"} s.scope
 * @param {number|null} s.allCount  whole-timeline count while only the selected years are listed (null: unknown)
 * @param {number} s.total
 * @param {number|null} s.shownInRange
 * @returns {{label: string, aria: string|null, scope: "all"|"range"}|null}
 */
export function scopeAction({ settled, scope, allCount, total, shownInRange }) {
  if (settled && scope === "range" && (allCount === null || allCount > total)) {
    return {
      label: allCount === null ? "Show whole timeline" : `Show all ${allCount}`,
      aria: allCount === null ? "Show results from the whole timeline" : `Show all ${plural(allCount)}, whole timeline`,
      scope: "all",
    };
  }
  if (settled && scope !== "range" && total > 0 && shownInRange && shownInRange !== total) {
    return { label: `Show the ${shownInRange} in selected years`, aria: null, scope: "range" };
  }
  return null;
}
