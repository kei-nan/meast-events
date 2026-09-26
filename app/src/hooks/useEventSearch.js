import { useEffect, useMemo, useState } from "react";
import { fetchAllPages, searchStaticEvents } from "../lib/dataClient";
import { eventCoords, inArea } from "../lib/geo";
import { MIN_QUERY_LENGTH, rankEvents } from "../lib/ranking";
import useDebouncedValue from "./useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 300;
const INTERIM_STATIC_MS = 1500;
const MAX_SEARCH_PAGES = 5;

const IDLE = {
  status: "idle",
  results: [],
  total: 0,
  truncated: false,
  source: null,
  interim: false,
};
const LOADING = { ...IDLE, status: "loading" };

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
//   status: 'idle'    nothing to search (no text >= 2 chars, no filters)
//           'loading' a query for the CURRENT inputs is in flight; `results`
//                     holds only interim static results for that same query
//                     (source 'static', interim true) - never a previous query's
//           'ready' | 'error'
//   results: ranked events with coordinates (circle areas trimmed by haversine)
//   total / truncated: server total when the answer was incomplete
//   source: 'api' (API) | 'static' (offline dataset)
//
// Each new query aborts the previous request (AbortController). While the live
// answer is pending past ~1.5s an interim static answer is shown.
export default function useEventSearch({
  query,
  area = null,
  categories,
  countries,
  live,
  addEvents,
  onOutage,
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

  const [state, setState] = useState({ key: null, ...IDLE });

  useEffect(() => {
    const [sq, sArea, sCats, sCountries] = JSON.parse(settledKey);
    if (!(sq || sArea || sCats.length || sCountries.length)) return;
    const controller = new AbortController();
    const filters = { q: sq, area: sArea, categories: sCats, countries: sCountries };
    let finished = false;
    let timer = null;

    const finish = (events, { total, truncated, source }) => {
      if (controller.signal.aborted) return;
      finished = true;
      const located = events.filter((e) => eventCoords(e));
      const trimmed = sArea ? located.filter((e) => inArea(eventCoords(e), sArea)) : located;
      const results = rankEvents(trimmed, sq);
      addEvents(results);
      setState({
        key: settledKey,
        status: "ready",
        results,
        total: truncated ? Math.max(total, results.length) : results.length,
        truncated,
        source,
        interim: false,
      });
    };

    const fail = () => {
      if (controller.signal.aborted) return;
      finished = true;
      setState({ key: settledKey, ...IDLE, status: "error" });
    };

    const runStatic = () =>
      searchStaticEvents(filters).then((events) =>
        finish(events, { total: events.length, truncated: false, source: "static" })
      );

    if (!live) {
      runStatic().catch(fail);
    } else {
      timer = setTimeout(() => {
        searchStaticEvents(filters)
          .then((events) => {
            if (finished || controller.signal.aborted) return;
            const results = rankEvents(events, sq);
            setState({
              key: settledKey,
              status: "loading",
              results,
              total: results.length,
              truncated: false,
              source: "static",
              interim: true,
            });
          })
          .catch(() => {});
      }, INTERIM_STATIC_MS);

      fetchAllPages(
        {
          q: sq || undefined,
          bbox: sArea?.bbox,
          category: sCats,
          country: sCountries,
          precise: sArea ? 1 : undefined,
          sort: sq ? "relevance" : "date",
          fields: "lite",
        },
        { signal: controller.signal, maxPages: MAX_SEARCH_PAGES }
      )
        .then((res) => finish(res.events, { total: res.total, truncated: res.truncated, source: "api" }))
        .catch((err) => {
          if (err.aborted || controller.signal.aborted) return;
          if (err.outage) onOutage();
          return runStatic();
        })
        .catch(fail);
    }

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [settledKey, live, addEvents, onOutage]);

  if (!active) return IDLE;
  if (state.key !== currentKey) return LOADING;
  return state;
}
