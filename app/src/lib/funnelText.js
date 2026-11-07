// Counts the About the data page states in its text, taken from selection-funnel.json (written by
// scripts/build-selection-funnel.js from the data), so the sentences cannot drift from the data.
// Only AboutData.jsx imports this, so it stays in About's own chunk.

// The hand-picked events whose countries differ from Wikidata's (`shown_now`). "" while the file loads or
// if it lacks the counts: the sentence reads on without them.
export function handPickedCountriesClause(shownNow) {
  const found = shownNow?.seed_events_also_found_by_discovery;
  const other = shownNow?.seed_events_found_with_other_countries_than_wikidata;
  if (!Number.isInteger(found) || !Number.isInteger(other)) return "";
  return `of the ${found} the rule also finds, ${other} ${other === 1 ? "has" : "have"} other countries than Wikidata gives, and `;
}
