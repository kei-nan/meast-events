import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MaplibreMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
// Not used directly - imported so Vite includes this file in the production
// bundle as a real asset (see the comment below and vite.config.js).
import "maplibre-gl/dist/maplibre-gl-shared.mjs?url";
import {
  CATEGORY_COLORS,
  CLUSTER_LABEL_PAINT,
  CLUSTER_PAINT,
  EMPTY_FC,
  POINT_PAINT,
  areaGeoJSON,
  eventsToGeoJSON,
  haversineKm,
  makeCircleArea,
  makeRectArea,
  oppositeCorner,
  pointFeature,
} from "./mapLayers";
import { BORDER_STYLE, readHintDismissed, uniqueBoundaries, writeHintDismissed } from "./mapBorders";
import {
  BoundaryPopup,
  BordersList,
  MapLegend,
  MapNotices,
} from "./MapUi";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { boundariesForYear, boundaryLabelsForYear } from "../lib/boundaryLabels";
import {
  decadeFloor,
  loadBoundaryDecade,
  loadLand,
  prefetchBoundaryDecade,
} from "../lib/dataClient";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";

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

export { CATEGORY_COLORS };

// Period-correct naming (Ottoman Empire -> Turkey, mandate-era names, etc.) is now
// resolved at ingest time - see scripts/boundary-corrections.js - so boundaries.json's
// `name` property is already the right one to show for whatever year a feature is
// active. This component doesn't need its own historical knowledge.

// Our own base style: a sea-colored background and nothing else. Land, borders
// and events are all added from our own data on load, so the map depends on no
// third-party tile server, and no modern political layer can leak onto a
// historical map. Label glyphs (Open Sans Semibold, Apache 2.0; see NOTICE) are
// served from public/glyphs/ - only the ranges the labels use are shipped.
// MapLibre needs an absolute glyphs URL.
const LABEL_FONT = ["Open Sans Semibold"];
const BASE_STYLE = {
  version: 8,
  glyphs: `${window.location.origin}${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#D8F2FF" } }],
};

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
  year,
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
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const eventsRef = useRef(events);
  const matchIdsRef = useRef(matchIds);
  const yearRef = useRef(year);
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
  // {decade|"land", phase: "retrying"|"final"} while a load is failing.
  const [borderError, setBorderError] = useState(null);
  const [displayedYear, setDisplayedYear] = useState(null);
  const [borderPopup, setBorderPopup] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hintOpen, setHintOpen] = useState(() => !readHintDismissed());
  const landFailedRef = useRef(false);
  // Only the settled year triggers a new fetch; boundariesForYear/labels below
  // still run against the live `year` for instant filtering of whatever decade
  // is already cached, so scrubbing within a loaded decade has zero lag.
  const debouncedYear = useDebouncedValue(year, 150);

  eventsRef.current = events;
  matchIdsRef.current = matchIds;
  yearRef.current = year;
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
      if (land) mapRef.current?.getSource("land")?.setData(land);
    }
    await fetchDecade(decade);
  }, [fetchDecade, fetchLand]);

  useEffect(() => {
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      bounds: DEFAULT_BOUNDS,
      fitBoundsOptions: { padding: 20 },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map; // debug helper, dev-only

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
        if (l) map.getSource("land")?.setData(l);
        return l;
      });
      const [landResult] = await Promise.all([
        Promise.race([landPromise, sleep(1200).then(() => null)]),
        Promise.race([fetchDecade(initialDecade), sleep(1200)]),
      ]);
      const initialLand = landResult ?? EMPTY_FC;
      const initialBoundaries = { features: boundaryCacheRef.current.get(initialDecade) ?? [] };

      // Physical land/water silhouette for world context (Mediterranean, Black Sea, Red
      // Sea, Persian Gulf, Europe, Africa, etc). Sourced from Natural Earth 1:50m land
      // polygons - pure physical geography with no political information at all, so it
      // can't introduce modern-border anachronisms. Added first, so it sits below our
      // own boundaries/events layers and reads as background context.
      map.addSource("land", {
        type: "geojson",
        data: initialLand,
      });

      map.addLayer(
        {
          id: "land-fill",
          type: "fill",
          source: "land",
          paint: { "fill-color": "#e4ded0", "fill-opacity": 0.65 },
        }
      );

      map.addSource("boundaries", {
        type: "geojson",
        data: boundariesForYear(yearRef.current, initialBoundaries.features),
      });

      map.addLayer(
        {
          id: "boundaries-fill",
          type: "fill",
          source: "boundaries",
          paint: { "fill-color": "#8a6f45", "fill-opacity": 0.08 },
        }
      );

      map.addLayer({
        id: "boundaries-line",
        type: "line",
        source: "boundaries",
        paint: {
          // Solid = source-dated geometry; dashed + darker amber + thicker = a
          // status flag (mandate/occupation/annexation/dispute). See BORDER_STYLE.
          "line-color": ["case", ["!=", ["get", "status"], null], BORDER_STYLE.flagged.color, BORDER_STYLE.solid.color],
          "line-width": ["case", ["!=", ["get", "status"], null], BORDER_STYLE.flagged.width, BORDER_STYLE.solid.width],
          "line-dasharray": [
            "case",
            ["!=", ["get", "status"], null],
            ["literal", BORDER_STYLE.flagged.dash],
            ["literal", [1, 0]],
          ],
        },
      });

      map.addSource("boundary-labels", {
        type: "geojson",
        data: boundaryLabelsForYear(yearRef.current, initialBoundaries.features),
      });

      // User-drawn search area: sits under the event markers so they stay clickable.
      map.addSource("area", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "area-fill",
        type: "fill",
        source: "area",
        paint: { "fill-color": "#2f6f9f", "fill-opacity": 0.16 },
      });
      map.addLayer({
        id: "area-line",
        type: "line",
        source: "area",
        paint: { "line-color": "#1f5a8a", "line-width": 2.5, "line-dasharray": [3, 2] },
      });

      map.addSource("events", {
        type: "geojson",
        data: eventsToGeoJSON(eventsRef.current, matchIdsRef.current),
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 12,
        // Number of search matches inside each cluster (m is 1 for every
        // feature when no search is active, so nothing dims in that case).
        clusterProperties: { matches: ["+", ["get", "m"]] },
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: CLUSTER_PAINT,
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "events",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": LABEL_FONT,
          "text-size": 12,
        },
        paint: CLUSTER_LABEL_PAINT,
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: POINT_PAINT,
      });

      // Country labels sit ABOVE the event markers (below only hover/selection) so
      // markers never hide a state's name. Placement priority = state size (bigger
      // first) and big states print larger.
      map.addLayer({
        id: "boundaries-label",
        type: "symbol",
        source: "boundary-labels",
        layout: {
          // boundary-labels' "name" property is already the period-appropriate
          // display name, resolved at ingest time.
          "text-field": ["get", "name"],
          "text-font": LABEL_FONT,
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            ["+", 8, ["*", 3, ["get", "big"]]],
            5,
            ["+", 11, ["*", 6, ["get", "big"]]],
            8,
            ["+", 14, ["*", 8, ["get", "big"]]],
          ],
          "symbol-sort-key": ["-", 0, ["get", "area"]],
          "text-max-width": 7,
          "text-padding": 2,
          "symbol-placement": "point",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#f4f1ea",
          "text-halo-color": "rgba(15,17,20,0.9)",
          "text-halo-width": 1.6,
          "text-halo-blur": 0.3,
        },
      });

      // Hover and selection live in their own (unclustered) sources so the
      // highlighted event is visible even while its marker sits inside a cluster.
      map.addSource("hover", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "hover-ring",
        type: "circle",
        source: "hover",
        paint: {
          "circle-radius": 12,
          "circle-color": "rgba(255,255,255,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#1b1b1b",
        },
      });

      // Pointer feedback: a ring on whichever cluster/dot is under the cursor, and a
      // short-lived flash on a clicked cluster (which then zooms in).
      map.addSource("pointer-hover", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "pointer-hover",
        type: "circle",
        source: "pointer-hover",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": "rgba(255,210,90,0.18)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffd25a",
        },
      });
      map.addSource("cluster-flash", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "cluster-flash",
        type: "circle",
        source: "cluster-flash",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": "rgba(255,210,90,0.4)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addSource("selected", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "selected-halo",
        type: "circle",
        source: "selected",
        paint: {
          "circle-radius": 20,
          "circle-color": "rgba(255,210,90,0.35)",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#1b1b1b",
        },
      });
      map.addLayer({
        id: "selected-point",
        type: "circle",
        source: "selected",
        paint: {
          "circle-radius": 11,
          "circle-color": [
            "case",
            ["==", ["get", "a"], 1],
            "#f4f1ea",
            [
              "match",
              ["get", "category"],
              ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
              "#6b6151",
            ],
          ],
          "circle-stroke-width": 4,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "a"], 1],
            [
              "match",
              ["get", "category"],
              ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
              "#6b6151",
            ],
            "#ffffff",
          ],
        },
      });

      map.addSource("area-handles", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "area-handles",
        type: "circle",
        source: "area-handles",
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "center"], 5, 8],
          "circle-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#1f5a8a",
        },
      });
      map.addSource("area-label", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "area-label",
        type: "symbol",
        source: "area-label",
        layout: {
          "text-field": ["get", "text"],
          "text-font": LABEL_FONT,
          "text-size": 13,
          "text-offset": [0, -2.1],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#12385a",
          "text-halo-color": "rgba(255,255,255,0.95)",
          "text-halo-width": 2,
        },
      });

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

      map.on("click", "clusters", async (e) => {
        if (!clickable()) return;
        const feature = e.features[0];
        const center = feature.geometry.coordinates;
        // Visible click feedback: flash the cluster while the map zooms into it.
        map.getSource("cluster-flash")?.setData(ringFor(feature, 8));
        setTimeout(() => map.getSource("cluster-flash")?.setData(EMPTY_FC), 550);
        let zoom = map.getZoom() + 2;
        try {
          const expansion = await map.getSource("events").getClusterExpansionZoom(feature.properties.cluster_id);
          zoom = Math.max(expansion, map.getZoom() + 1);
        } catch {
          // Fall back to the fixed +2 zoom step.
        }
        map.easeTo({ center, zoom, duration: reducedMotion() ? 0 : 500 });
      });

      const selectFromLayer = (e) => {
        if (clickable()) propsRef.current.onSelectEvent?.(e.features[0].properties.id);
      };
      map.on("click", "unclustered-point", selectFromLayer);
      map.on("click", "selected-point", selectFromLayer);

      // Click on a border polygon (not on a marker): show its status/note/source.
      map.on("click", (e) => {
        if (!clickable()) return;
        const onMarker = map.queryRenderedFeatures(e.point, {
          layers: ["clusters", "unclustered-point", "selected-point"],
        });
        if (onMarker.length) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: ["boundaries-fill"] });
        setBorderPopup(hits.length ? { point: [e.point.x, e.point.y], items: uniqueBoundaries(hits) } : null);
      });

      setMapReady(true);
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current.getSource("events")?.setData(eventsToGeoJSON(events, matchIds));
  }, [events, matchIds, mapReady]);

  // Fetch trigger: only fires when the *settled* year lands in a decade that
  // isn't cached yet. Also opportunistically warms the neighboring decades, so
  // crossing a decade boundary while scrubbing usually finds data already there.
  useEffect(() => {
    const decade = decadeFloor(debouncedYear);
    if (!boundaryCacheRef.current.has(decade)) fetchDecade(decade);
    const prevDecade = decade - 10;
    const nextDecade = decade + 10;
    if (prevDecade >= decadeFloor(MIN_YEAR) && !boundaryCacheRef.current.has(prevDecade)) {
      prefetchBoundaryDecade(prevDecade);
    }
    if (nextDecade <= decadeFloor(MAX_YEAR) && !boundaryCacheRef.current.has(nextDecade)) {
      prefetchBoundaryDecade(nextDecade);
    }
  }, [debouncedYear, fetchDecade]);

  // Apply trigger: runs against the live (non-debounced) `year` so that once a
  // decade is cached, filtering/rendering it is instant with no debounce lag.
  // Until the target decade arrives, the map simply keeps showing whatever was
  // rendered last rather than clearing to empty.
  useEffect(() => {
    if (!mapReady) return;
    const decade = decadeFloor(year);
    const features = boundaryCacheRef.current.get(decade);
    if (!features) return;
    mapRef.current.getSource("boundaries")?.setData(boundariesForYear(year, features));
    mapRef.current.getSource("boundary-labels")?.setData(boundaryLabelsForYear(year, features));
    setDisplayedYear(year);
  }, [year, boundaryVersion, mapReady]);

  // Container size (for popup placement) and popup housekeeping.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (areaMode !== "off") setBorderPopup(null);
  }, [areaMode]);

  const decadeCached = boundaryCacheRef.current.has(decadeFloor(year));
  // Borders drawn for the current year (for the keyboard-reachable list).
  const yearBorders = useMemo(() => {
    const feats = boundaryCacheRef.current.get(decadeFloor(year));
    if (!feats) return [];
    return uniqueBoundaries(boundariesForYear(year, feats).features);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, boundaryVersion]);
  const shownBorderYear = decadeCached ? year : displayedYear;
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
  const dismissHint = () => {
    setHintOpen(false);
    writeHintDismissed();
  };

  // Reports the settled viewport ([west, south, east, north]) after each
  // pan/zoom so the parent can count events in view (server bbox query, or
  // client-side when the API is unavailable).
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

  // Selected marker (own source: stays visible even inside a cluster).
  useEffect(() => {
    if (!mapReady) return;
    let ev = selectedEventId ? events.find((e) => e.id === selectedEventId) : null;
    if (!ev && selectedEventId && focus && focus.id === selectedEventId) {
      ev = { id: focus.id, coordinates: { lon: focus.lon, lat: focus.lat } };
    }
    mapRef.current.getSource("selected")?.setData(pointFeature(ev));
  }, [selectedEventId, events, focus, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const ev = hoverId && hoverId !== selectedEventId ? events.find((e) => e.id === hoverId) : null;
    mapRef.current.getSource("hover")?.setData(pointFeature(ev));
  }, [hoverId, selectedEventId, events, mapReady]);

  // Fly to a focused event. `nonce` lets the caller re-focus the same event.
  useEffect(() => {
    if (!mapReady || !focus) return;
    const map = mapRef.current;
    const ev = eventsRef.current.find((e) => e.id === focus.id);
    const minZoom = ev?.location_quality === "approximate" ? 5 : 6;
    const opts = { center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), minZoom) };
    if (reducedMotion()) map.jumpTo(opts);
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

  // Escape leaves draw mode.
  useEffect(() => {
    if (areaMode === "off") return;
    const onKey = (e) => {
      if (e.key === "Escape") propsRef.current.onAreaModeChange?.("off");
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
          return makeCircleArea(d.start, haversineKm(d.start, ll));
        case "radius":
          return makeCircleArea(d.area0.center, Math.max(0.1, haversineKm(d.area0.center, ll)));
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
      <div className="mu-ctrl-left" role="group" aria-label="Search area tools">
        <button type="button" className="mu-btn" aria-pressed={areaMode === "rect"} onClick={() => toggle("rect")}>
          {"\u25ad"} Draw rectangle
        </button>
        <button type="button" className="mu-btn" aria-pressed={areaMode === "circle"} onClick={() => toggle("circle")}>
          {"\u25ef"} Draw circle
        </button>
        {area && (
          <button type="button" className="mu-btn" onClick={() => onAreaChange?.(null)}>
            Clear area
          </button>
        )}
        <button type="button" className="mu-btn" onClick={resetView}>
          {"\u21ba"} Reset view
        </button>
        {hint && (
          <div
            role="status"
            style={{
              font: "12px/1.3 system-ui, sans-serif",
              maxWidth: 220,
              padding: "6px 8px",
              background: "rgba(244,241,234,0.95)",
              border: "1px solid #5c4d38",
              borderRadius: 6,
              color: "#3a3020",
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div className="mu-ctrl-right">
        {shownBorderYear != null && (
          <div className="mu-badge" aria-label={`Borders as of ${shownBorderYear}`}>
            Borders as of {shownBorderYear}
            {!decadeCached && <span className="mu-badge-sub"> (updating to {year})</span>}
          </div>
        )}
        <BordersList year={year} items={yearBorders} />
        <MapNotices
          loading={eventsLoading || !mapReady || !decadeCached}
          borderError={relevantError}
          onRetry={retryBorders}
          hint={hintOpen}
          onDismissHint={dismissHint}
        />
      </div>
      <MapLegend />
      {borderPopup && <BoundaryPopup popup={borderPopup} onClose={closePopup} width={size.w} height={size.h} />}
    </div>
  );
}
