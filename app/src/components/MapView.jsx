import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MaplibreMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
// Not used directly - imported so Vite includes this file in the production
// bundle as a real asset (see the comment below and vite.config.js).
import "maplibre-gl/dist/maplibre-gl-shared.mjs?url";
import {
  EMPTY_FC,
  areaGeoJSON,
  eventFeature,
  eventSignature,
  eventsToGeoJSON,
  makeCircleArea,
  makeRectArea,
  oppositeCorner,
  pointFeature,
} from "./mapLayers";
import { CLUSTER_MAX_ZOOM, installLayers } from "./mapInstallLayers";
import { readHintDismissed, uniqueBoundaries, writeHintDismissed } from "./mapBorders";
import {
  BoundaryPopup,
  BordersList,
  MapNotices,
  MapTip,
  MapToolbar,
  YearToggle,
} from "./MapUi";
import useMediaQuery from "../hooks/useMediaQuery";
import { diffById } from "../lib/sourceDiff";
import ClusterList from "./ClusterList";
import useMapHoverLabel from "./useMapHoverLabel";
import { LIST_MAX, allSameCoordinates, clusterClickAction, eventsBounds, stackItems } from "../lib/mapStack";
import useCountryHighlight from "./countryHighlight";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { boundariesForYear, boundaryLabelsForYear } from "../lib/boundaryLabels";
import {
  decadeFloor,
  loadBoundaryDecade,
  loadDeferredGeometry,
  loadFarLand,
  loadLand,
  prefetchBoundaryDecade,
} from "../lib/dataClient";
import {
  deferredRefsInView,
  drawableBoundaries,
  isPlaceholder,
  listedBoundaries,
  placeholderMembers,
  withGeometry,
} from "../lib/deferredBoundaries";
import { MAP_EXTENT } from "../lib/mapExtent";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";
import { reducedMotion } from "../lib/reducedMotion";
import { haversineKm } from "../lib/geo";
import { isUnhandledEscape } from "../lib/escapeKey";
import { TAP_SLOP_PX, pickMarker } from "../lib/tapTarget";
import { sheetCoversMap, stripOffset, toolbarInset } from "../lib/mapInsets";

// Distance between two [lon, lat] points (the drawing code works in pairs).
const distanceKm = (a, b) => haversineKm(a[0], a[1], b[0], b[1]);

// MapLibre GL resolves its worker script relative to its own module URL at
// runtime (via a dynamic import.meta.url template), which Vite's static
// asset analyzer can't follow - so in a production build the worker file
// never gets copied into dist/ and the map silently fails to render (no
// thrown error - the failure happens inside the Worker, which doesn't
// bubble up as a page-level exception). This only matters for the built
// app - Vite's dev server can already resolve maplibre-gl's own worker URL
// straight out of node_modules, so leave dev mode alone and only override
// the built app, where we explicitly ship the worker (and the shared chunk
// it imports, see vite.config.js) as unhashed static assets.
if (import.meta.env.PROD) {
  setWorkerUrl(maplibreWorkerUrl);
}

// Period-correct naming (Ottoman Empire -> Turkey, mandate-era names, etc.) is now
// resolved at ingest time - see scripts/boundary-corrections.js - so boundaries.json's
// `name` property is already the right one to show for whatever year a feature is
// active. This component doesn't need its own historical knowledge.

// Our own base style: a sea-colored background and nothing else. Land, borders
// and events are all added from our own data on load, so the map depends on no
// third-party tile server, and no modern political layer can leak onto a
// historical map. Label glyphs (see LABEL_FONT in mapInstallLayers.js) are
// served from public/glyphs/; MapLibre needs an absolute glyphs URL.
// A calm, slightly greyed sea (was a bright #d8f2ff). Keep in sync with
// .map-placeholder in SidePanel.css, which stands in for the map while it loads.
const SEA_COLOR = "#b9d5e3";
const BASE_STYLE = {
  version: 8,
  glyphs: `${window.location.origin}${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": SEA_COLOR } }],
};

// The first-visit hint hides itself after this long (or on the first map interaction).
const HINT_AUTO_HIDE_MS = 8000;

// Drag/tap hit tolerance around area handles, in CSS pixels.
const HANDLE_HIT_PX = { mouse: 10, touch: 22, pen: 14 };
// A drag shorter than this (px) is treated as a stray click, not a drawn area.
const MIN_DRAW_PX = 6;

function applyInteractivity(map, mode, hasArea) {
  const drawing = mode !== "off";
  if (drawing) {
    map.dragPan.disable();
    map.doubleClickZoom.disable();
  } else {
    map.dragPan.enable();
    map.doubleClickZoom.enable();
  }
  const el = map.getCanvasContainer();
  // Touch drags must reach our pointer handlers instead of scrolling the page.
  el.style.touchAction = drawing || hasArea ? "none" : "";
  map.getCanvas().style.cursor = drawing ? "crosshair" : "";
}

// Default view: the Middle East. Shared by the initial view and "Reset view".
const DEFAULT_BOUNDS = [
  [8, 6],
  [72, 50],
];
const RETRY_DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One automatic retry with backoff. onFirstFail lets the UI show a notice
// while the retry is pending.
async function withRetry(fn, onFirstFail) {
  try {
    return await fn();
  } catch (err) {
    onFirstFail?.(err);
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}

export default function MapView({
  events,
  year: timelineYear,
  borderYear = null, // an opened event's year: shown instead of the timeline year (App.jsx)
  eventYear = null, // the opened event's year, for the "Use event year" button
  onToggleEventYear,
  highlightEvent = null, // event whose listed countries are shaded (countryHighlight.js)
  matchIds = null,
  selectedEventId,
  hoverId,
  focus,
  areaMode = "off",
  area = null,
  onAreaModeChange,
  onAreaChange,
  onViewportChange,
  onViewportBounds,
  onSelectEvent,
  eventsLoading = false,
  yearPending = false, // true while the year to show is not known yet: no borders are fetched (App.jsx)
}) {
  const year = borderYear ?? timelineYear;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const eventsRef = useRef(events);
  const matchIdsRef = useRef(matchIds);
  // id -> signature of what the map's event source holds (lib/sourceDiff.js).
  const sourceSigsRef = useRef(new Map());
  const yearRef = useRef(year);
  const yearPendingRef = useRef(yearPending);
  const focusRef = useRef(focus);
  const propsRef = useRef({});
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Boundary decade chunks are fetched (static files) on demand and cached forever here -
  // scrubbing the timeline back over an already-visited decade never re-fetches
  // it. `boundaryVersion` just forces a re-render when the (mutable) cache gets
  // a new entry, since map.getSource().setData() below is an imperative escape
  // hatch React doesn't know to react to on its own.
  const boundaryCacheRef = useRef(new Map()); // decade -> features[]
  const [boundaryVersion, setBoundaryVersion] = useState(0);
  // The boundary features last sent to the map, to skip identical updates.
  const appliedBordersRef = useRef(null);
  // {decade|"land", phase: "retrying"|"final"} while a load is failing.
  const [borderError, setBorderError] = useState(null);
  const [displayedYear, setDisplayedYear] = useState(null);
  const [borderPopup, setBorderPopup] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hintOpen, setHintOpen] = useState(() => !readHintDismissed());
  // Events sharing one spot, listed after a click: {point, items, total}.
  const [stackList, setStackList] = useState(null);
  const stackOpenerRef = useRef(null); // what had focus when the list opened
  const hoverLabelRef = useRef(null);
  const compact = useMediaQuery("(max-width: 768px)");
  const landFailedRef = useRef(false);
  // The land source draws both files (lib/mapExtent.js NEAR_LAND_EXTENT).
  const landRef = useRef({ near: null, far: null });
  const landData = () => ({
    type: "FeatureCollection",
    features: [...(landRef.current.near?.features ?? []), ...(landRef.current.far?.features ?? [])],
  });
  // Only the settled year triggers a new fetch; boundariesForYear/labels below
  // still run against the live `year` for instant filtering of whatever decade
  // is already cached, so scrubbing within a loaded decade has zero lag.
  const debouncedYear = useDebouncedValue(year, 150);

  eventsRef.current = events;
  matchIdsRef.current = matchIds;
  yearRef.current = year;
  yearPendingRef.current = yearPending;
  focusRef.current = focus;
  propsRef.current = {
    areaMode,
    area,
    onAreaChange,
    onAreaModeChange,
    onSelectEvent,
    onViewport: onViewportChange ?? onViewportBounds,
  };

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

  const fetchLand = useCallback(async () => {
    try {
      const land = await withRetry(loadLand, () => setBorderError({ decade: "land", phase: "retrying" }));
      landRef.current.near = land;
      landFailedRef.current = false;
      setBorderError((e) => (e && e.decade === "land" ? null : e));
      return land;
    } catch {
      landFailedRef.current = true;
      setBorderError({ decade: "land", phase: "final" });
      return null;
    }
  }, []);

  const retryBorders = useCallback(async () => {
    const decade = decadeFloor(yearRef.current);
    setBorderError({ decade, phase: "retrying" });
    if (landFailedRef.current) {
      const land = await fetchLand();
      if (land) mapRef.current?.getSource("land")?.setData(landData());
    }
    await fetchDecade(decade);
  }, [fetchDecade, fetchLand]);

  useEffect(() => {
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      bounds: DEFAULT_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      // land.json is clipped to this extent (scripts/split-data.mjs), so panning
      // further would show a sea where land was dropped.
      maxBounds: [MAP_EXTENT.slice(0, 2), MAP_EXTENT.slice(2)],
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map; // debug helper, dev-only
    // Set on unmount; the async load handler checks it after each await.
    let cancelled = false;

    map.on("load", async () => {
      // Land silhouette and the boundary decade covering the initial year are
      // both needed for a correct first paint, so fetch them in parallel and
      // wait on both before building the map's own sources/layers - this
      // avoids a flash of an empty map that then pops in borders a moment later.
      // A failed fetch (after one automatic retry) no longer blocks the map: the
      // layers are still built (empty) and the notice's Retry button fills them.
      const initialDecade = decadeFloor(yearRef.current);
      // Each is raced against a short timeout so a failing fetch (which retries
      // after a backoff) never holds the whole map hostage: layers are built with
      // whatever has arrived and late data is applied by the effects/callback below.
      const landPromise = fetchLand().then((l) => {
        if (l && !cancelled) map.getSource("land")?.setData(landData());
        return l;
      });
      const [landResult] = await Promise.all([
        Promise.race([landPromise, sleep(1200).then(() => null)]),
        // A year still unknown (yearPending) is fetched by the effect below once known.
        yearPendingRef.current ? null : Promise.race([fetchDecade(initialDecade), sleep(1200)]),
      ]);
      // Unmounted while the data was loading: the map is already removed.
      if (cancelled) return;
      const initialFeatures = boundaryCacheRef.current.get(initialDecade) ?? [];
      const boundaries = boundariesForYear(yearRef.current, drawableBoundaries(initialFeatures));
      appliedBordersRef.current = boundaries.features;
      installLayers(map, {
        land: landResult ? landData() : EMPTY_FC,
        boundaries,
        // Already filtered to the year, so the labels' own filter keeps them all.
        labels: boundaryLabelsForYear(yearRef.current, boundaries.features),
        events: eventsToGeoJSON(eventsRef.current, matchIdsRef.current),
      });
      sourceSigsRef.current = new Map(
        eventsRef.current.filter((e) => e.coordinates).map((e) => [e.id, eventSignature(e, matchIdsRef.current)])
      );

      const pointerCursor = (on) => () => {
        if (propsRef.current.areaMode === "off" && !draggingRef.current) {
          map.getCanvas().style.cursor = on ? "pointer" : "";
        }
      };
      for (const layer of ["clusters", "unclustered-point", "selected-point"]) {
        map.on("mouseenter", layer, pointerCursor(true));
        map.on("mouseleave", layer, pointerCursor(false));
      }

      const clusterRadius = (count) => (count >= 15 ? 24 : count >= 5 ? 18 : 14);
      const ringFor = (f, extra) => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { r: (f.properties.point_count ? clusterRadius(f.properties.point_count) : 6) + extra },
            geometry: f.geometry,
          },
        ],
      });
      // Hover state for clusters and dots: a gold ring around whatever is under the pointer.
      let hoverKey = null;
      const setHoverRing = (f) => {
        const key = f ? (f.properties.cluster_id ?? f.properties.id) : null;
        if (key === hoverKey) return;
        hoverKey = key;
        map.getSource("pointer-hover")?.setData(f ? ringFor(f, 5) : EMPTY_FC);
      };
      map.on("mousemove", (e) => {
        if (propsRef.current.areaMode !== "off" || draggingRef.current) return setHoverRing(null);
        setHoverRing(map.queryRenderedFeatures(e.point, { layers: ["clusters", "unclustered-point"] })[0] ?? null);
      });
      map.getCanvas().addEventListener("mouseleave", () => setHoverRing(null));

      const clickable = () => propsRef.current.areaMode === "off" && !suppressClickRef.current;

      const openStack = (e, features, total) => {
        setBorderPopup(null);
        // Escape or × puts focus back where it was (closeStack).
        const active = document.activeElement;
        stackOpenerRef.current = active && active !== document.body ? active : null;
        setStackList({
          point: [e.point.x, e.point.y],
          items: stackItems(features),
          total,
          oneSpot: allSameCoordinates(features),
        });
      };

      const clickCluster = async (e, feature) => {
        const center = feature.geometry.coordinates;
        const { cluster_id: clusterId, point_count: count } = feature.properties;
        const source = map.getSource("events");
        // Visible click feedback: flash the cluster while the map zooms into it.
        map.getSource("cluster-flash")?.setData(ringFor(feature, 8));
        setTimeout(() => map.getSource("cluster-flash")?.setData(EMPTY_FC), 550);
        let zoom = map.getZoom() + 2;
        let expansion = NaN;
        try {
          expansion = await source.getClusterExpansionZoom(clusterId);
          zoom = Math.max(expansion, map.getZoom() + 1);
        } catch {
          // Fall back to the fixed +2 zoom step.
        }
        // A cluster no zoom can split (e.g. capital-pinned events on one point)
        // lists its events instead of zooming in to a single unclickable dot.
        const leaves =
          count <= LIST_MAX ? await source.getClusterLeaves(clusterId, LIST_MAX, 0).catch(() => null) : null;
        if (cancelled) return;
        const action = clusterClickAction({ count, expansionZoom: expansion, clusterMaxZoom: CLUSTER_MAX_ZOOM, leaves });
        if (action === "list" && leaves?.length) return openStack(e, leaves, count);
        map.easeTo({ center, zoom, duration: reducedMotion() ? 0 : 500 });
      };

      // A dot with others drawn under it (same spot, past CLUSTER_MAX_ZOOM)
      // lists them all; a lone dot selects its event.
      const clickDot = (e, feature) => {
        const here = map.queryRenderedFeatures(map.project(feature.geometry.coordinates), {
          layers: ["unclustered-point"],
        });
        const distinct = stackItems(here).length;
        if (distinct > 1) return openStack(e, here, distinct);
        propsRef.current.onSelectEvent?.(feature.properties.id);
      };

      // The marker a click is on; on a touch screen also the nearest one
      // within TAP_SLOP_PX of a tap (lib/tapTarget.js), since a finger easily
      // misses a 12-16 px dot and would otherwise open the border under it.
      const markerLayers = ["clusters", "unclustered-point", "selected-point"];
      const coarse = window.matchMedia?.("(pointer: coarse)").matches;
      const markerAt = (point) => {
        const toPixel = (c) => map.project(c);
        const exact = map.queryRenderedFeatures(point, { layers: markerLayers });
        if (exact.length || !coarse) return pickMarker(exact, point, toPixel);
        const r = TAP_SLOP_PX;
        const near = map.queryRenderedFeatures(
          [
            [point.x - r, point.y - r],
            [point.x + r, point.y + r],
          ],
          { layers: markerLayers }
        );
        return pickMarker(near, point, toPixel);
      };

      // One click handler: a marker (see markerAt), else a border polygon,
      // which shows its status/note/source. A placeholder outline is described
      // by the areas it stands for.
      map.on("click", (e) => {
        if (!clickable()) return;
        const marker = markerAt(e.point);
        if (marker) {
          if (marker.layer.id === "clusters") clickCluster(e, marker);
          else clickDot(e, marker);
          return;
        }
        setStackList(null);
        const hits = map.queryRenderedFeatures(e.point, { layers: ["boundaries-fill"] });
        const chunk = boundaryCacheRef.current.get(decadeFloor(yearRef.current)) ?? [];
        let hint = null;
        const items = hits.flatMap((h) => {
          if (h.properties.placeholder_for == null) return [h];
          const placeholder = chunk.find((f) => isPlaceholder(f) && f.properties.name === h.properties.name);
          if (!placeholder) return [h];
          hint = placeholder.properties.note;
          return placeholderMembers(placeholder, chunk);
        });
        setBorderPopup(hits.length ? { point: [e.point.x, e.point.y], items: uniqueBoundaries(items), hint } : null);
      });

      setMapReady(true);

      // Land beyond the opening view loads once that view has drawn, so it never
      // competes with it; a failed load is retried on the next pan or zoom.
      const addFarLand = () => {
        loadFarLand()
          .then((far) => {
            if (cancelled || landRef.current.far) return;
            landRef.current.far = far;
            map.off("moveend", addFarLand);
            map.getSource("land")?.setData(landData());
          })
          .catch(() => {});
      };
      map.once("idle", () => {
        if (cancelled) return;
        addFarLand();
        map.on("moveend", addFarLand);
      });
    });

    return () => {
      cancelled = true;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send the map only what changed (lib/sourceDiff.js): a timeline step adds and
  // removes the events entering and leaving the range; a full replacement is
  // used when most features change (a search starts or ends).
  useEffect(() => {
    if (!mapReady) return;
    const source = mapRef.current.getSource("events");
    if (!source) return;
    const mapped = events.filter((e) => e.coordinates);
    const byId = new Map(mapped.map((e) => [e.id, e]));
    const diff = diffById(
      sourceSigsRef.current,
      mapped.map((e) => ({ id: e.id, sig: eventSignature(e, matchIds) }))
    );
    sourceSigsRef.current = diff.sigs;
    if (diff.full) source.setData(eventsToGeoJSON(mapped, matchIds));
    else if (diff.remove.length || diff.add.length) {
      source.updateData({ remove: diff.remove, add: diff.add.map((id) => eventFeature(byId.get(id), matchIds)) });
    }
  }, [events, matchIds, mapReady]);

  // Fetch trigger: only fires when the *settled* year lands in a decade that
  // isn't cached yet. Also opportunistically warms the neighboring decades, so
  // crossing a decade boundary while scrubbing usually finds data already there;
  // those wait until this decade is in and the map has drawn it ("idle"), so
  // they never compete with what is on screen. Nothing is fetched while the
  // year is still unknown (`yearPending`: an event link waiting for its event).
  useEffect(() => {
    if (yearPending) return undefined;
    const decade = decadeFloor(debouncedYear);
    let cancelled = false;
    let onIdle = null;
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
      map.once("idle", onIdle);
      map.triggerRepaint(); // an already idle map fires "idle" after this frame
    });
    return () => {
      cancelled = true;
      if (onIdle) mapRef.current?.off("idle", onIdle);
    };
  }, [debouncedYear, fetchDecade, mapReady, yearPending]);

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
    setDisplayedYear(year);
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
  }, [mapReady, debouncedYear, boundaryVersion]);

  // Container size (for popup placement) and popup housekeeping.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (areaMode !== "off") {
      setBorderPopup(null);
      setStackList(null);
    }
  }, [areaMode]);
  // A listed stack goes stale once the events (year range, search) change.
  useEffect(() => setStackList(null), [events]);

  useMapHoverLabel({
    mapRef,
    mapReady,
    labelRef: hoverLabelRef,
    isIdle: () => propsRef.current.areaMode === "off" && !draggingRef.current,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
  });

  // The first-visit hint steps aside after a few seconds (for this visit only),
  // or for good once the map is used: a click, drag, wheel, pinch or a
  // keyboard pan/zoom. Moves the app makes itself (flyTo, fitBounds) carry no
  // originalEvent, so opening an event does not count as a use.
  useEffect(() => {
    if (!hintOpen || !mapReady) return;
    const map = mapRef.current;
    const timer = setTimeout(() => setHintOpen(false), HINT_AUTO_HIDE_MS);
    const used = (e) => {
      if (e?.type === "movestart" && !e.originalEvent) return;
      setHintOpen(false);
      writeHintDismissed();
    };
    const types = ["click", "dragstart", "wheel", "touchstart", "movestart"];
    for (const t of types) map.on(t, used);
    return () => {
      clearTimeout(timer);
      for (const t of types) map.off(t, used);
    };
  }, [hintOpen, mapReady]);

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
  useCountryHighlight({ mapRef, mapReady, event: highlightEvent, year, features: yearFeatures, focus });
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
  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(DEFAULT_BOUNDS, { padding: 20, duration: reducedMotion() ? 0 : 600 });
  };
  const closePopup = useCallback(() => setBorderPopup(null), []);
  // Closing the list (× or Escape) removes the focused card: focus goes back to
  // what had it before (or the map itself, which MapLibre makes focusable).
  const closeStack = useCallback(() => {
    setStackList(null);
    const opener = stackOpenerRef.current;
    stackOpenerRef.current = null;
    (opener?.isConnected ? opener : mapRef.current?.getCanvas())?.focus({ preventScroll: true });
  }, []);
  const selectFromStack = (id) => {
    setStackList(null);
    onSelectEvent?.(id);
  };

  // "Show results on map": fit the view around the search/filter matches that
  // have coordinates. Only on request - never on each keystroke.
  const matchBounds = useMemo(() => (matchIds ? eventsBounds(events, matchIds) : null), [events, matchIds]);
  const showMatches = () => {
    const map = mapRef.current;
    if (!map || !matchBounds) return;
    const [w, s, e, n] = matchBounds.bbox;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        // Keep clear of the overlay controls (and the phone results sheet).
        padding: compact ? { top: 80, bottom: 150, left: 40, right: 40 } : { top: 80, bottom: 60, left: 200, right: 120 },
        maxZoom: 8,
        duration: reducedMotion() ? 0 : 700,
      }
    );
  };
  // The × on the tip, and any use of the toolbar, retire it for good (the map
  // itself is covered by the auto-hide effect above).
  const dismissHint = () => {
    setHintOpen(false);
    writeHintDismissed();
  };

  // Reports the settled viewport ([west, south, east, north]) after each
  // pan/zoom so the parent can count events in view (computed client-side
  // from the static event store).
  const hasViewportCb = !!(onViewportChange ?? onViewportBounds);
  const viewportCb = onViewportChange ?? onViewportBounds;
  useEffect(() => {
    if (!mapReady || !hasViewportCb) return;
    const map = mapRef.current;
    let timeoutId;

    function report() {
      const b = map.getBounds();
      viewportCb([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    }

    function handleMoveEnd() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(report, 200);
    }

    map.on("moveend", handleMoveEnd);
    report(); // initial view

    return () => {
      clearTimeout(timeoutId);
      map.off("moveend", handleMoveEnd);
    };
  }, [mapReady, hasViewportCb, viewportCb]);

  // The point sources' effects below re-run on every timeline step (`events`
  // changes) while the point itself rarely does, and every setData makes
  // MapLibre reload the source in its worker. So send only a changed point.
  const pointDataRef = useRef({}); // source name -> JSON last sent
  const setPointSource = useCallback((name, ev) => {
    const source = mapRef.current.getSource(name);
    if (!source) return;
    const data = pointFeature(ev);
    const json = JSON.stringify(data);
    if (pointDataRef.current[name] === json) return;
    pointDataRef.current[name] = json;
    source.setData(data);
  }, []);

  // Selected marker (own source: stays visible even inside a cluster).
  useEffect(() => {
    if (!mapReady) return;
    let ev = selectedEventId ? events.find((e) => e.id === selectedEventId) : null;
    if (!ev && selectedEventId && focus && focus.id === selectedEventId && focus.lon != null) {
      ev = { id: focus.id, coordinates: { lon: focus.lon, lat: focus.lat } };
    }
    setPointSource("selected", ev);
  }, [selectedEventId, events, focus, mapReady, setPointSource]);

  useEffect(() => {
    if (!mapReady) return;
    const ev = hoverId && hoverId !== selectedEventId ? events.find((e) => e.id === hoverId) : null;
    setPointSource("hover", ev);
  }, [hoverId, selectedEventId, events, mapReady, setPointSource]);

  // Fly to a focused event. `nonce` lets the caller re-focus the same event.
  useEffect(() => {
    if (!mapReady || !focus || focus.fitCountries) return; // fitCountries: useCountryHighlight
    const map = mapRef.current;
    const ev = eventsRef.current.find((e) => e.id === focus.id);
    // There is no basemap with towns or rivers: the only context is the land
    // outline and one name per state. Zoom 6 often showed neither (just grey
    // land and dots), so the target is the deepest zoom that still kept a
    // coastline and a state name in view in screenshots (Mush, 1901): 5 on a
    // ~1060px desktop map, 4.5 on a 390px phone, 4 on a 320px one. An
    // approximate location gets half a level less. A user who zoomed in
    // further keeps their zoom, but at most two levels past the target, so a
    // jump never lands in blank land.
    const w = map.getContainer().clientWidth;
    const target = 5 - (w < 700 ? 0.5 : 0) - (w < 360 ? 0.5 : 0) - (ev?.location_quality === "approximate" ? 0.5 : 0);
    const zoom = Math.min(Math.max(map.getZoom(), target), target + 2);
    // On phones the event's sheet covers the map but its top strip: the place
    // goes in the middle of that strip, below the toolbar (lib/mapInsets.js),
    // not under the sheet.
    const box = map.getContainer();
    const offset = stripOffset(box.clientHeight, sheetCoversMap(), toolbarInset(box));
    const opts = { center: [focus.lon, focus.lat], zoom, offset };
    // easeTo with no duration, not jumpTo, which has no `offset`.
    if (reducedMotion()) map.easeTo({ ...opts, duration: 0 });
    else map.flyTo(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, mapReady]);

  // Search-area layers follow the `area` prop (URL state, chip removal, edits).
  const setAreaSources = (a, showHandles = true) => {
    const map = mapRef.current;
    const g = areaGeoJSON(a, showHandles);
    map.getSource("area")?.setData(g.shape);
    map.getSource("area-handles")?.setData(g.handles);
    map.getSource("area-label")?.setData(g.label);
  };

  useEffect(() => {
    if (!mapReady || draggingRef.current) return;
    setAreaSources(area, areaMode === "off");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, areaMode, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    applyInteractivity(mapRef.current, areaMode, !!area);
  }, [areaMode, area, mapReady]);

  // Escape leaves draw mode, unless something else took that Escape (lib/escapeKey.js).
  useEffect(() => {
    if (areaMode === "off") return;
    const onKey = (e) => {
      if (!isUnhandledEscape(e)) return;
      e.preventDefault();
      propsRef.current.onAreaModeChange?.("off");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [areaMode]);

  // Pointer-driven drawing and handle editing (mouse, touch and pen alike).
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const el = map.getCanvasContainer();
    let drag = null;

    const locate = (ev) => {
      const r = el.getBoundingClientRect();
      const pt = [ev.clientX - r.left, ev.clientY - r.top];
      const ll = map.unproject(pt);
      return { pt, ll: [ll.lng, ll.lat] };
    };

    const handleAt = (pt, pointerType) => {
      const r = HANDLE_HIT_PX[pointerType] ?? HANDLE_HIT_PX.mouse;
      const hits = map.queryRenderedFeatures(
        [
          [pt[0] - r, pt[1] - r],
          [pt[0] + r, pt[1] + r],
        ],
        { layers: ["area-handles"] }
      );
      if (!hits.length) return null;
      // Prefer the radius handle over the centre when they overlap.
      return (hits.find((h) => h.properties.kind !== "center") ?? hits[0]).properties.kind;
    };

    const compute = (d, ll) => {
      switch (d.kind) {
        case "rect":
          return makeRectArea(d.start, ll);
        case "circle":
          return makeCircleArea(d.start, distanceKm(d.start, ll));
        case "radius":
          return makeCircleArea(d.area0.center, Math.max(0.1, distanceKm(d.area0.center, ll)));
        case "center":
          return makeCircleArea(ll, d.area0.radiusKm);
        default:
          return makeRectArea(oppositeCorner(d.area0.bbox, d.kind), ll);
      }
    };

    const end = (commit) => {
      const d = drag;
      drag = null;
      draggingRef.current = false;
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 60);
      const p = propsRef.current;
      const isDraw = d.kind === "rect" || d.kind === "circle";
      if (commit && d.moved && d.current) {
        p.onAreaChange?.(d.current);
        if (isDraw) p.onAreaModeChange?.("off");
      } else {
        setAreaSources(p.area, p.areaMode === "off");
      }
      applyInteractivity(map, isDraw && commit && d.moved ? "off" : p.areaMode, true);
    };

    const onDown = (ev) => {
      if (drag || !ev.isPrimary || (ev.pointerType === "mouse" && ev.button !== 0)) return;
      const p = propsRef.current;
      const { pt, ll } = locate(ev);
      let kind = null;
      if (p.areaMode !== "off") kind = p.areaMode;
      else if (p.area) kind = handleAt(pt, ev.pointerType);
      if (!kind) return;
      drag = { kind, id: ev.pointerId, start: ll, startPt: pt, area0: p.area, moved: false, current: null };
      draggingRef.current = true;
      map.dragPan.disable();
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        // Pointer already released; harmless.
      }
      ev.preventDefault();
    };

    const onMove = (ev) => {
      const { pt, ll } = locate(ev);
      if (!drag) {
        if (ev.pointerType === "mouse" && propsRef.current.areaMode === "off" && propsRef.current.area) {
          map.getCanvas().style.cursor = handleAt(pt, "mouse") ? "grab" : "";
        }
        return;
      }
      if (ev.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(pt[0] - drag.startPt[0], pt[1] - drag.startPt[1]) < MIN_DRAW_PX) return;
        drag.moved = true;
      }
      drag.current = compute(drag, ll);
      setAreaSources(drag.current, drag.kind !== "rect" && drag.kind !== "circle");
    };

    const onUp = (ev) => {
      if (drag && ev.pointerId === drag.id) end(true);
    };
    const onCancel = (ev) => {
      if (drag && ev.pointerId === drag.id) end(false);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  const toggle = (mode) => onAreaModeChange?.(areaMode === mode ? "off" : mode);
  const hint =
    areaMode === "rect"
      ? "Drag on the map from one corner to the opposite corner. Esc cancels."
      : areaMode === "circle"
        ? "Press at the centre and drag out to set the radius. Esc cancels."
        : null;

  return (
    <div className="map-view" style={{ position: "relative" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <MapToolbar
        areaMode={areaMode}
        hasArea={!!area}
        compact={compact}
        onToggleMode={toggle}
        onClearArea={() => onAreaChange?.(null)}
        onReset={resetView}
        matchCount={matchBounds?.count ?? null}
        matchTotal={matchIds?.size ?? null}
        onShowMatches={showMatches}
        drawHint={hint}
        onInteract={hintOpen ? dismissHint : undefined}
      />
      <div className="mu-ctrl-right">
        <BordersList
          year={year}
          shownYear={shownBorderYear}
          updating={!decadeCached}
          eventYearShown={borderYear != null}
          items={yearBorders}
          compact={compact}
        />
        {eventYear != null && eventYear !== timelineYear && (
          <YearToggle
            useTimeline={borderYear != null}
            timelineYear={timelineYear}
            eventYear={eventYear}
            compact={compact}
            onClick={onToggleEventYear}
          />
        )}
        <MapNotices
          loading={eventsLoading || !mapReady || !decadeCached}
          borderError={relevantError}
          onRetry={retryBorders}
        />
      </div>
      {hintOpen && <MapTip onDismiss={dismissHint} />}
      {borderPopup && <BoundaryPopup popup={borderPopup} onClose={closePopup} width={size.w} height={size.h} />}
      {stackList && (
        <ClusterList list={stackList} onSelect={selectFromStack} onClose={closeStack} width={size.w} height={size.h} />
      )}
      <div ref={hoverLabelRef} className="mu-tooltip" aria-hidden="true" hidden />
    </div>
  );
}
