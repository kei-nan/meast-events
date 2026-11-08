import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setCityYear } from "../components/mapInstallLayers";
import { uniqueBoundaries } from "../components/mapBorders";
import useDebouncedValue from "./useDebouncedValue";
import { boundariesForYear, boundaryLabelsForYear } from "../lib/boundaryLabels";
import { decadeFloor, loadBoundaryDecade, loadDeferredGeometry, prefetchBoundaryDecade } from "../lib/dataClient";
import { deferredRefsInView, drawableBoundaries, listedBoundaries, withGeometry } from "../lib/deferredBoundaries";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";
import { withRetry } from "../lib/retry";

// The map's borders (MapView): the decade files of data/boundaries.json, fetched
// on demand and cached, the year's borders sent to the map, the West Bank's
// deferred geometries, and the load errors the map's notice shows.

/**
 * @param {object} o
 * @param {{current: import("maplibre-gl").Map}} o.mapRef
 * @param {boolean} o.mapReady
 * @param {number} o.year          the year the map shows
 * @param {{current: number}} o.yearRef  the same, for callbacks
 * @param {boolean} o.yearPending  the year is not known yet (an event link waiting for its event)
 */
export default function useBoundaryDecades({ mapRef, mapReady, year, yearRef, yearPending }) {
  // Boundary decade chunks are fetched (static files) on demand and cached forever here -
  // scrubbing the timeline back over an already-visited decade never re-fetches
  // it. `boundaryVersion` just forces a re-render when the (mutable) cache gets
  // a new entry, since map.getSource().setData() below is an imperative escape
  // hatch React doesn't know to react to on its own.
  const boundaryCacheRef = useRef(new Map()); // decade -> features[]
  const [boundaryVersion, setBoundaryVersion] = useState(0);
  // The boundary features last sent to the map, to skip identical updates.
  const appliedBordersRef = useRef(null);
  // {decade|"land", phase: "retrying"|"final"} while a load is failing (MapView's land too).
  const [borderError, setBorderError] = useState(null);
  const [displayedYear, setDisplayedYear] = useState(null);
  // The settled year re-checks the deferred geometries in view (below); border
  // decades are fetched as soon as the shown year enters them (the fetch trigger).
  const debouncedYear = useDebouncedValue(year, 150);

  // Fetch one boundary decade into the cache: one automatic retry with backoff,
  // a visible notice while failing, never throws. Resolves true when cached.
  const fetchDecade = useCallback(async (decade) => {
    const cache = boundaryCacheRef.current;
    if (cache.has(decade)) return true;
    try {
      const fc = await withRetry(
        () => loadBoundaryDecade(decade),
        () => setBorderError({ decade, phase: "retrying" })
      );
      cache.set(decade, fc.features);
      setBorderError((e) => (e && e.decade === decade ? null : e));
      setBoundaryVersion((v) => v + 1);
      return true;
    } catch {
      setBorderError({ decade, phase: "final" });
      return false;
    }
  }, []);

  // Fetch trigger: keyed on the decade of the year shown, which changes at most
  // once per ten years, so a continuous scrub or drag fetches each decade it
  // crosses as it crosses it (not only once it stops); fetchDecade skips a cached
  // decade and dataClient shares a request already on its way. Also
  // opportunistically warms the neighboring decades, so crossing a decade
  // boundary while scrubbing usually finds data already there; those wait until
  // this decade is in and the map has drawn it ("idle"), so they never compete
  // with what is on screen (a decade left before then drops them). Nothing is
  // fetched while the year is still unknown (`yearPending`: an event link waiting
  // for its event); the render that ends the pending already shows the event's
  // year, so its decade - not the mount year's (2020) - is the one fetched.
  const shownDecade = decadeFloor(year);
  useEffect(() => {
    if (yearPending) return undefined;
    const decade = shownDecade;
    let cancelled = false;
    let onIdle = null;
    let idleMap = null; // the map onIdle waits on
    const prefetchNeighbours = () => {
      if (cancelled) return;
      const prevDecade = decade - 10;
      const nextDecade = decade + 10;
      if (prevDecade >= decadeFloor(MIN_YEAR) && !boundaryCacheRef.current.has(prevDecade)) {
        prefetchBoundaryDecade(prevDecade);
      }
      if (nextDecade <= decadeFloor(MAX_YEAR) && !boundaryCacheRef.current.has(nextDecade)) {
        prefetchBoundaryDecade(nextDecade);
      }
    };
    fetchDecade(decade).then((ok) => {
      const map = mapRef.current;
      if (cancelled || !ok || !mapReady || !map) return;
      onIdle = prefetchNeighbours;
      idleMap = map;
      map.once("idle", onIdle);
      map.triggerRepaint(); // an already idle map fires "idle" after this frame
    });
    return () => {
      cancelled = true;
      if (onIdle) idleMap.off("idle", onIdle);
    };
  }, [shownDecade, fetchDecade, mapReady, yearPending, mapRef]);

  // Apply trigger: runs against the live (non-debounced) `year` so that once a
  // decade is cached, filtering/rendering it is instant with no debounce lag.
  // Until the target decade arrives, the map simply keeps showing whatever was
  // rendered last rather than clearing to empty.
  useEffect(() => {
    if (!mapReady) return;
    const decade = decadeFloor(year);
    const features = boundaryCacheRef.current.get(decade);
    if (!features) return;
    // Most years (every Play step) leave the same borders active: re-sending
    // identical data would make MapLibre re-tile every polygon for nothing. The
    // cached feature objects are stable, so comparing them by identity is enough.
    const active = boundariesForYear(year, drawableBoundaries(features));
    const prev = appliedBordersRef.current;
    const unchanged =
      prev && prev.length === active.features.length && active.features.every((f, i) => f === prev[i]);
    if (!unchanged) {
      appliedBordersRef.current = active.features;
      mapRef.current.getSource("boundaries")?.setData(active);
      // Already filtered to the year, so the labels' own filter keeps them all.
      mapRef.current.getSource("boundary-labels")?.setData(boundaryLabelsForYear(year, active.features));
    }
    // City names change with the borders, so the two always show the same year.
    setCityYear(mapRef.current, year);
    setDisplayedYear(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, boundaryVersion, mapReady]);

  // Deferred geometries (lib/deferredBoundaries.js, the West Bank Areas A/B/C):
  // fetched once the view is zoomed in over them, then swapped into every cached
  // decade that has them; the apply trigger above then replaces the outline.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const check = () => {
      const features = boundaryCacheRef.current.get(decadeFloor(yearRef.current));
      if (!features) return;
      const b = map.getBounds();
      const bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      for (const ref of deferredRefsInView(features, yearRef.current, map.getZoom(), bounds)) {
        loadDeferredGeometry(ref)
          .then((geometry) => {
            const cache = boundaryCacheRef.current;
            let changed = false;
            for (const [decade, feats] of cache) {
              const next = withGeometry(feats, ref, geometry);
              if (next !== feats) {
                cache.set(decade, next);
                changed = true;
              }
            }
            if (changed) setBoundaryVersion((v) => v + 1);
          })
          .catch(() => {}); // the outline stays; the next move retries
      }
    };
    check();
    map.on("moveend", check);
    return () => map.off("moveend", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, debouncedYear, boundaryVersion]);

  const decadeCached = boundaryCacheRef.current.has(decadeFloor(year));
  const shownBorderYear = decadeCached ? year : displayedYear;
  const yearFeatures = useMemo(
    () => {
      const feats = boundaryCacheRef.current.get(decadeFloor(year));
      return feats ? drawableBoundaries(feats) : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, boundaryVersion]
  );
  // Borders drawn for the year the map currently shows (for the keyboard-reachable
  // list) - the previous year's while a new decade is still loading.
  const yearBorders = useMemo(() => {
    if (shownBorderYear == null) return [];
    const feats = boundaryCacheRef.current.get(decadeFloor(shownBorderYear));
    if (!feats) return [];
    return uniqueBoundaries(boundariesForYear(shownBorderYear, listedBoundaries(feats)).features);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownBorderYear, boundaryVersion]);
  const relevantError =
    borderError && (borderError.decade === "land" || borderError.decade === decadeFloor(year))
      ? borderError.phase
      : null;

  return {
    boundaryCacheRef,
    appliedBordersRef,
    fetchDecade,
    setBorderError,
    decadeCached,
    shownBorderYear,
    yearFeatures,
    yearBorders,
    relevantError,
  };
}
