// The event's English Wikidata aliases as the event panel lists them ("Also
// called (Wikidata): …"): Wikidata's values as-is and in its order, leaving out
// only those that read the same as the title (Wikidata sometimes repeats the
// article's name as an alias) or as an earlier alias, ignoring case and accents.
import { normalizeText } from "./ranking.js";

export function shownAliases(event) {
  const seen = new Set([normalizeText(event?.title).trim()]);
  const out = [];
  for (const a of Array.isArray(event?.aliases) ? event.aliases : []) {
    if (typeof a !== "string") continue;
    const key = normalizeText(a).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
