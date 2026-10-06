// Incremental updates for the map's event source. Pure.
//
// Replacing a GeoJSON source's data (setData) serializes EVERY feature to the
// map's worker on the main thread: with 25,000 events that was ~170 ms per
// timeline step on a 4x-throttled CPU, the largest cost of scrubbing. A
// timeline step changes only the events entering or leaving the range, so the
// map is sent just that difference (MapLibre's updateData, which needs a unique
// id per feature: the source uses promoteId "id").
//
// Each feature is summarised by a signature of everything that can change how
// it is drawn; a feature whose signature changed is removed and re-added.

/**
 * @param {Map<string, string>} prev  id -> signature of what the source holds now
 * @param {Array<{id: string, sig: string}>} next  what it should hold
 * @param {number} [maxChangeRatio]  above this share of changed features a full
 *   replacement is cheaper than a diff (e.g. a search dims every marker)
 * @returns {{full: boolean, remove: string[], add: string[], sigs: Map<string, string>}}
 *   `add` lists ids (new or changed); `sigs` is the new state to keep.
 */
export function diffById(prev, next, maxChangeRatio = 0.5) {
  const sigs = new Map();
  const remove = [];
  const add = [];
  for (const { id, sig } of next) {
    sigs.set(id, sig);
    const old = prev.get(id);
    if (old === undefined) add.push(id);
    else if (old !== sig) {
      remove.push(id);
      add.push(id);
    }
  }
  for (const id of prev.keys()) if (!sigs.has(id)) remove.push(id);
  const changed = add.length + remove.length - Math.min(add.length, remove.length);
  const full = changed > Math.max(sigs.size, prev.size) * maxChangeRatio;
  return { full, remove, add, sigs };
}
