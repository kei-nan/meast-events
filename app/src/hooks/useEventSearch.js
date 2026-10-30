import { useEffect, useMemo, useRef, useState } from "react";
import { localSearch, textMatchesFromStore } from "../lib/localSearch";
import { effectiveQuery, rankEvents, warmWords } from "../lib/ranking";
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
  typing: false,
};

// Text shorter than MIN_QUERY_LENGTH, or with no letters/digits, counts as no
// text (lib/ranking.js effectiveQuery).
const effectiveQ = effectiveQuery;

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
// The index is queried by the text alone: it answers with every matching id,
// and the filters/area are applied to those ids here, so changing a filter
// re-filters the cached ids instead of searching again (no interim flash).
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
  const settledQ = effectiveQ(debouncedQuery);

  // Tokenise every event's text once the list has loaded, while the browser is
  // idle, so the first keystroke does not pay for it (8,000 events: ~400 ms on
  // a 4x-slowed phone CPU). Same words either way (lib/ranking.js caches them).
  // In slices of 200 events, so it never blocks the page for long.
  useEffect(() => {
    if (!ready) return undefined;
    const events = [...storeRef.current.values()];
    const idle = typeof requestIdleCallback === "function";
    let i = 0;
    let id;
    const step = (deadline) => {
      do {
        warmWords(events.slice(i, i + 200));
        i += 200;
      } while (i < events.length && deadline && deadline.timeRemaining() > 5);
      if (i < events.length) id = idle ? requestIdleCallback(step) : setTimeout(step, 50);
    };
    id = idle ? requestIdleCallback(step) : setTimeout(step, 50);
    return () => (idle ? cancelIdleCallback(id) : clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, version]);

  // Instant local answer for the current inputs (not debounced).
  const local = useMemo(
    () => (ready && active ? localSearch([...storeRef.current.values()], { q, area, categories: cats, countries: cs }) : []),
    // version signals that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, active, q, area, cats, cs, version]
  );

  // Latest full-text answer: {q, status: 'ready'|'failed', ids}
  const [full, setFull] = useState({ q: null });
  // The latest values, for the effect below without re-running it on each
  // change (synced first: effects run in order; not written during render).
  const degradedRef = useRef(degraded);
  const fullRef = useRef(full);
  useEffect(() => {
    degradedRef.current = degraded;
    fullRef.current = full;
  });
  const handledProbeRef = useRef(probeTick);

  // Re-run when `degraded` clears too: a probe that loaded the index but went
  // stale (the text changed meanwhile, which is not searched while degraded)
  // still ends the outage, and the current text is then searched at once.
  useEffect(() => {
    const isProbe = probeTick !== handledProbeRef.current;
    handledProbeRef.current = probeTick;
    if (!settledQ || !ready) return;
    if (degradedRef.current && !isProbe) return;
    // Already answered (the recovery that answered it cleared `degraded`).
    if (!isProbe && fullRef.current.q === settledQ && fullRef.current.status === "ready") return;
    let stale = false;

    searchEventIds(settledQ)
      .then((ids) => {
        onRecovered();
        if (stale) return;
        setFull({ q: settledQ, status: "ready", ids });
      })
      .catch(() => {
        if (stale) return;
        onOutage();
        setFull({ q: settledQ, status: "failed" });
      });

    return () => {
      stale = true;
    };
  }, [settledQ, probeTick, ready, degraded, onOutage, onRecovered]);

  // The full-text answer for the current text, under the current filters.
  // Records come from the static store; filters and area apply locally.
  const fullResults = useMemo(() => {
    if (!ready || full.status !== "ready" || full.q !== q) return null;
    return rankEvents(textMatchesFromStore(full.ids, storeRef.current, { area, categories: cats, countries: cs }), q);
    // version signals that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, full, q, area, cats, cs, version]);

  // The text is still changing (the debounce has not caught up with it).
  const typing = q !== settledQ;
  if (!active) return IDLE;
  if (!ready) return { ...IDLE, status: "loading", textSearch: Boolean(q), typing };

  const localState = (source) => ({
    status: "ready",
    results: local,
    total: local.length,
    truncated: false,
    source,
    interim: false,
    textSearch: Boolean(q),
    typing,
  });

  if (!q) return localState("local");
  if (fullResults) {
    return {
      ...IDLE,
      status: "ready",
      results: fullResults,
      total: fullResults.length,
      truncated: false,
      source: "fulltext",
      textSearch: true,
      typing,
    };
  }
  if (degraded || (full.q === q && full.status === "failed")) {
    return localState("static");
  }
  // Full-text answer pending: show the instant local matches meanwhile.
  return { ...localState("fulltext"), status: "loading", interim: true };
}
