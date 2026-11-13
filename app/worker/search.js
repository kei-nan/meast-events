// Finding an event id for the MCP tool search_events (worker/index.js), over dist/ai/index.json.
// A match needs every query word in the title, the id or one of the event's own Wikidata
// groups. Results are in date order, not ranked: ranking by how well an event matches the
// question's words would put first the events that share its framing.

const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const SEARCH_LIMIT = 25;

/** `index`: [{id, title, date_start, countries, groups}]. Returns {total, results}. */
export function searchIndex(index, query, limit = SEARCH_LIMIT) {
  const q = words(query);
  if (!q.length) return { total: 0, results: [] };
  const hits = index.filter((e) => {
    const hay = new Set(words(`${e.title} ${e.id} ${(e.groups ?? []).join(" ")}`));
    return q.every((w) => hay.has(w) || [...hay].some((h) => h.startsWith(w) && w.length >= 4));
  });
  // dist/ai/index.json is already in the data's order; sort by start date, undated last.
  hits.sort((a, b) => (a.date_start ?? "￿").localeCompare(b.date_start ?? "￿") || a.id.localeCompare(b.id));
  return { total: hits.length, results: hits.slice(0, Math.max(1, Math.min(limit, 100))) };
}
