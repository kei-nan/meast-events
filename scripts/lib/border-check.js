// Guards for the border check's reference points (scripts/verify-borders.js, fetch-border-references.js). Pure.

// A fresh fetch much smaller than the committed list is a failed or partial query, not Wikidata losing points.
const MIN_KEPT_SHARE = 0.9;

/** Baseline points with a measured distance that the check no longer measures: `base` and `now` are { id: km|null }. */
export function missingReferencePoints(base, now) {
  return Object.entries(base ?? {}).filter(([id, km]) => km != null && !(id in (now ?? {}))).map(([id]) => id);
}

/** Throws unless a fresh fetch of `fresh` points may replace a committed list of `committed` points. */
export function assertEnoughReferencePoints(fresh, committed) {
  if (fresh === 0 || fresh < committed * MIN_KEPT_SHARE) {
    throw new Error(`the query returned ${fresh} reference points, the committed file has ${committed}: not written (a failed or partial query?). If the drop is real, run again with --allow-fewer`);
  }
}
