import { useEffect, useMemo, useRef, useState } from "react";
import { localSearch, textMatchesFromStore } from "../lib/localSearch";
import { MIN_QUERY_LENGTH, rankEvents } from "../lib/ranking";
import { searchEventIds } from "../lib/textSearch";
import useDebouncedValue from "./useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 300;

const IDLE = {
  status: "idle",
  results: [],
  total: 0,
  truncated: false,
  source: null,
  interim: false,
  textSearch: false,
};

// Text shorter than MIN_QUERY_LENGTH counts as no text.
function effectiveQ(q) {
  const t = q.trim();
  return t.length >= MIN_QUERY_LENGTH ? t : "";
}

function paramsKey(q, area, categories, countries) {
  return JSON.stringify([q, area, categories, countries]);
}

// Combined search: text + area + categories + countries, over the WHOLE
// timeline (the year scope is applied by the caller, so toggling it needs no
// refetch and both "N results" and "M in selected years" are exact).
//
// WHAT NEEDS THE FULL-TEXT INDEX: only free-text search (q), because it matches
// the full lead text, which the store does not hold (lib/textSearch.js, a static
// Pagefind index searched in the browser). The index only decides WHICH events
// match; category/country filters and drawn-area queries (bbox + circle trim,
// precise-only rule) and the ranking are computed locally from the in-memory
// store (`storeRef`, filled from static data).
//
//   status: 'idle'    nothing to search (no text >= 2 chars, no filters)
//           'loading' the store is still loading, or a q search for the CURRENT
//                     inputs is running; `results` then holds INSTANT LOCAL
//                     title/snippet matches for that same query (interim true)
//           'ready'
//   results: ranked events with coordinates (circle areas trimmed by haversine)
//   total / truncated: always exact (the index returns every match)
//   source: 'fulltext' (full-text answer) | 'local' (filters/area only, exact) |
//           'static' (q answered locally because the index could not be
//           loaded: titles and summaries only)
//
// A newer q makes an older answer stale (ignored). If the index cannot be
// loaded `onOutage()` is called and local matches become the answer; while
// `degraded` it is not tried again for each keystroke, only when `probeTick`
// changes (App bumps it every 20 s), and `onRecovered()` fires when it loads.
export default function useEventSearch({
  query,
  area = null,
  categories,
  countries,
  storeRef,
  version,
  ready,
  degraded,
  probeTick,
  onOutage,
  onRecovered,
}) {
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const catsKey = (categories ?? []).join("\u0000");
  const countriesKey = (countries ?? []).join("\u0000");
  const cats = useMemo(() => (catsKey ? catsKey.split("\u0000") : []), [catsKey]);
  const cs = useMemo(() => (countriesKey ? countriesKey.split("\u0000") : []), [countriesKey]);

  const q = effectiveQ(query);
  const active = Boolean(q || area || cats.length || cs.length);
  const currentKey = paramsKey(q, area, cats, cs);
  const settledKey = paramsKey(effectiveQ(debouncedQuery), area, cats, cs);

  // Instant local answer for the current inputs (not debounced).
  const local = useMemo(
    () => (ready && active ? localSearch([...storeRef.current.values()], { q, area, categories: cats, countries: cs }) : []),
    // version signals that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, active, q, area, cats, cs, version]
  );

  // Latest full-text answer: {key, status: 'ready'|'failed', ...}
  const [full, setFull] = useState({ key: null });
  const degradedRef = useRef(degraded);
  degradedRef.current = degraded;
  const handledProbeRef = useRef(probeTick);

  useEffect(() => {
    const isProbe = probeTick !== handledProbeRef.current;
    handledProbeRef.current = probeTick;
    const [sq, sArea, sCats, sCountries] = JSON.parse(settledKey);
    if (!sq || !ready) return;
    if (degradedRef.current && !isProbe) return;
    let stale = false;

    searchEventIds(sq)
      .then((ids) => {
        if (stale) return;
        // Records come from the static store; filters and area apply locally.
        const hits = textMatchesFromStore(ids, storeRef.current, { area: sArea, categories: sCats, countries: sCountries });
        const results = rankEvents(hits, sq);
        onRecovered();
        setFull({ key: settledKey, status: "ready", results, total: results.length, truncated: false });
      })
      .catch(() => {
        if (stale) return;
        onOutage();
        setFull({ key: settledKey, status: "failed" });
      });

    return () => {
      stale = true;
    };
  }, [settledKey, probeTick, ready, storeRef, onOutage, onRecovered]);

  if (!active) return IDLE;
  if (!ready) return { ...IDLE, status: "loading", textSearch: Boolean(q) };

  const localState = (source) => ({
    status: "ready",
    results: local,
    total: local.length,
    truncated: false,
    source,
    interim: false,
    textSearch: Boolean(q),
  });

  if (!q) return localState("local");
  if (full.key === currentKey && full.status === "ready") {
    return { ...IDLE, ...full, source: "fulltext", textSearch: true };
  }
  if (degraded || (full.key === currentKey && full.status === "failed")) {
    return localState("static");
  }
  // Full-text answer pending: show the instant local matches meanwhile.
  return { ...localState("fulltext"), status: "loading", interim: true };
}
