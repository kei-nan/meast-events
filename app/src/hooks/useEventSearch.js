import { useEffect, useMemo, useRef, useState } from "react";
import { API_ENABLED, fetchAllPages } from "../lib/dataClient";
import { apiMatchesFromStore, localSearch } from "../lib/localSearch";
import { MIN_QUERY_LENGTH, rankEvents } from "../lib/ranking";
import useDebouncedValue from "./useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_SEARCH_PAGES = 5;

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
// WHAT NEEDS THE API: only free-text search (q), because it matches the full
// lead text and ranks server-side. Everything else - category/country filters
// and drawn-area queries (bbox + circle trim, precise-only rule) - is computed
// locally from the in-memory store (`storeRef`, filled from static data), so it
// is instant and works with the API down or absent.
//
//   status: 'idle'    nothing to search (no text >= 2 chars, no filters)
//           'loading' the store is still loading, or a q request for the CURRENT
//                     inputs is in flight; `results` then holds INSTANT LOCAL
//                     title/snippet matches for that same query (interim true)
//           'ready'
//   results: ranked events with coordinates (circle areas trimmed by haversine)
//   total / truncated: server total when the answer was incomplete
//   source: 'api' (full-text answer) | 'local' (filters/area only, exact) |
//           'static' (q answered locally because the API is unavailable/absent:
//           titles and summaries only)
//
// A new q aborts the previous request (AbortController). If the q request fails
// `onOutage()` is called and local matches become the answer; while `degraded`
// the API is not tried again for each keystroke, only when `probeTick` changes
// (App bumps it every 20 s), and `onRecovered()` fires when a probe succeeds.
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

  // Latest API answer: {key, status: 'ready'|'failed', ...}
  const [api, setApi] = useState({ key: null });
  const degradedRef = useRef(degraded);
  degradedRef.current = degraded;
  const handledProbeRef = useRef(probeTick);

  useEffect(() => {
    const isProbe = probeTick !== handledProbeRef.current;
    handledProbeRef.current = probeTick;
    const [sq, sArea, sCats, sCountries] = JSON.parse(settledKey);
    if (!sq || !API_ENABLED || !ready) return;
    if (degradedRef.current && !isProbe) return;
    const controller = new AbortController();

    fetchAllPages(
      {
        q: sq,
        bbox: sArea?.bbox,
        category: sCats,
        country: sCountries,
        precise: sArea ? 1 : undefined,
        sort: "relevance",
        fields: "lite",
      },
      { signal: controller.signal, maxPages: MAX_SEARCH_PAGES }
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        // Records come from the static store, not the (possibly stale) index.
        const results = rankEvents(apiMatchesFromStore(res.events, storeRef.current, sArea), sq);
        onRecovered();
        setApi({
          key: settledKey,
          status: "ready",
          results,
          total: res.truncated ? Math.max(res.total, results.length) : results.length,
          truncated: res.truncated,
        });
      })
      .catch((err) => {
        if (err.aborted || controller.signal.aborted) return;
        if (err.outage !== false) onOutage();
        setApi({ key: settledKey, status: "failed" });
      });

    return () => controller.abort();
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
  if (api.key === currentKey && api.status === "ready") {
    return { ...IDLE, ...api, source: "api", textSearch: true };
  }
  if (!API_ENABLED || degraded || (api.key === currentKey && api.status === "failed")) {
    return localState("static");
  }
  // API answer pending: show the instant local matches meanwhile.
  return { ...localState("api"), status: "loading", interim: true };
}
