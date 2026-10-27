// Run rules of scripts/enrich-candidates.js that decide what may be written or reused (pure; unit-tested in
// enrich-run.test.js):
//   - boundedRunError: a bounded run (--limit / --classes) holds only a subset of the candidates, so writing it over the
//     real output files would drop every other record. It must add to them (--keep-existing) or go to test files
//     (--out-suffix).
//   - reuseRecord (--reuse): only a clean record of the same article is reused, and the fields the candidate file gives
//     (countries, sitelinks, classes, description) are taken from the CURRENT candidate, not the stale copy.
//   - fetchErrors: records whose fetch failed (network/API error). They must never be reused or written as if the
//     event were excluded on its merits.
import { EVENT_CLASSES } from "./event-classes.js";
import { MAX_COUNTRIES_BEFORE_FLAG, coordinateFlag } from "./flags.js";

const CLASS_GROUP = Object.fromEntries(EVENT_CLASSES.map((c) => [c.label, c.category]));

export const FETCH_ERROR = "fetch_error";

/** The error message for a bounded run that would overwrite the real output files, or null when the run may write. */
export function boundedRunError({ limit = null, classes = null, keepExisting = false, outSuffix = "" } = {}) {
  // `classes` set at all (even empty: --classes= selects no candidate) bounds the run.
  const bounded = [limit ? `--limit=${limit}` : null, classes ? `--classes=${classes.join(",")}` : null].filter(Boolean);
  if (!bounded.length || keepExisting || outSuffix) return null;
  return (
    `${bounded.join(" ")} is a bounded run: it enriches only part of the candidates, and writing that part over ` +
    `data/events.proposed.json and data/enriched-candidates.json would drop every other record. ` +
    `Add --keep-existing (keep the records already there and add the new ones) or --out-suffix=.test (write *.test.json files instead).`
  );
}

/** Replaces the reason starting with `prefix` in place, removes it when `text` is null, appends it when absent. */
export function setReason(list, prefix, text) {
  const i = list.findIndex((r) => r.startsWith(prefix));
  if (i >= 0 && text) list[i] = text;
  else if (i >= 0) list.splice(i, 1);
  else if (text) list.push(text);
}

export const MANY_COUNTRIES_FLAG = "many_countries";
export function manyCountriesFlag(countries) {
  const n = countries?.length ?? 0;
  return n > MAX_COUNTRIES_BEFORE_FLAG
    ? `${MANY_COUNTRIES_FLAG}: ${n} countries tagged (kept exactly as Wikidata lists them; verify the event really concerns all of them)`
    : null;
}
export const FAR_FLAG = "coordinate_far_from_countries";

/** The fields of an enriched record that come from the candidate file (discover-events.js), as Wikidata gives them. */
export function candidateFields(candidate) {
  const classes = candidate.wikidata_classes ?? [];
  return {
    title: candidate.wikipedia_title,
    countries: candidate.countries,
    // Category is Wikidata's own class label (first class the item was found under).
    category: classes[0] ?? candidate.category,
    category_group: CLASS_GROUP[classes[0]] ?? candidate.category,
    wikidata_classes: classes,
    sitelinks: candidate.sitelinks,
    wikidata_description: candidate.wikidata_description ?? null,
  };
}

/**
 * --reuse: the cached enriched record to use for `candidate`, or null to fetch it again. Reused only when its
 * enrich_version is reusable, it carries its review list, it holds no error (a failed fetch or a missing summary is
 * always fetched again), and it was made from the same article title (the extract and URL are that title's). The
 * candidate-file fields are re-applied from the current candidate, with the review flags that depend on the countries.
 */
export function reuseRecord(cached, candidate, reusableVersions) {
  if (!cached || !candidate) return null;
  if (!reusableVersions.includes(cached.enrich_version) || !Array.isArray(cached._review)) return null;
  if (cached.error || cached.exclusion_reason === FETCH_ERROR) return null;
  if (cached.title !== candidate.wikipedia_title) return null;
  const r = { ...cached, ...candidateFields(candidate), _review: [...cached._review] };
  setReason(r._review, MANY_COUNTRIES_FLAG, manyCountriesFlag(r.countries));
  setReason(r._review, FAR_FLAG, coordinateFlag(r.coordinates, r.countries));
  return r;
}

/** The records whose fetch failed. */
export const fetchErrors = (results) => results.filter((r) => r.exclusion_reason === FETCH_ERROR);
