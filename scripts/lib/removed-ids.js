// Event ids that disappear. An event's address is /event/<id> and links to it get shared (DEPLOYMENT.md, "Renamed
// event ids"), so an id that was in data/events.json may leave it only
//  - renamed: listed in data/event-redirects.json ({"old-id": "new-id"}; the build writes a 301 for it), or
//  - removed on purpose: listed in data/removed-events.json, [{ "id", "reason", "removed_on": "YYYY-MM-DD" }]
//    (an entry that is not an event, a duplicate merged away, ...; the old link then 404s, knowingly).
// scripts/check-removed-ids.js compares the ids with a base ref's data/events.json (CI: the pull request's base).
// No imports: pure logic, tested in removed-ids.test.js.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The ids of an events array (non-string ids are left out: the validator reports them). */
export const eventIds = (events) => new Set((Array.isArray(events) ? events : []).map((e) => e?.id).filter((id) => typeof id === "string"));

/** Problems with data/removed-events.json's content (null/undefined: the file is absent, which is fine). */
export function removedListProblems(list, currentIds) {
  if (list == null) return [];
  if (!Array.isArray(list)) return ["data/removed-events.json must be an array of { id, reason, removed_on }"];
  const problems = [];
  const seen = new Set();
  list.forEach((r, i) => {
    const at = `data/removed-events.json[${i}]`;
    if (!r || typeof r !== "object" || Array.isArray(r)) return problems.push(`${at}: not an object`);
    const extra = Object.keys(r).filter((k) => !["id", "reason", "removed_on"].includes(k));
    if (extra.length) problems.push(`${at}: unknown key(s) ${extra.join(", ")} (only id, reason, removed_on)`);
    if (typeof r.id !== "string" || !r.id) return problems.push(`${at}: id missing`);
    if (seen.has(r.id)) problems.push(`${at}: ${r.id} listed twice`);
    seen.add(r.id);
    if (typeof r.reason !== "string" || !r.reason.trim()) problems.push(`${at} ${r.id}: reason missing (say why the event was removed)`);
    if (typeof r.removed_on !== "string" || !DAY_RE.test(r.removed_on) || Number.isNaN(Date.parse(`${r.removed_on}T00:00:00Z`))) {
      problems.push(`${at} ${r.id}: removed_on must be a YYYY-MM-DD day (got ${JSON.stringify(r.removed_on)})`);
    }
    if (currentIds.has(r.id)) problems.push(`${at} ${r.id}: it is still an event (remove the entry, or the event)`);
  });
  return problems;
}

/**
 * The ids of `baseIds` that are not in `headIds` and are accounted for neither by `redirects` ({old: new}) nor by
 * `removed` ([{ id }]): { missing, unaccounted }, both sorted.
 */
export function unaccountedRemovals({ baseIds, headIds, redirects, removed }) {
  const redirected = redirects && typeof redirects === "object" && !Array.isArray(redirects) ? redirects : {};
  const recorded = new Set((Array.isArray(removed) ? removed : []).map((r) => r?.id));
  const missing = [...baseIds].filter((id) => !headIds.has(id)).sort();
  const unaccounted = missing.filter((id) => !Object.hasOwn(redirected, id) && !recorded.has(id));
  return { missing, unaccounted };
}
