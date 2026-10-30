import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MaplibreMap, prewarm, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import {
  EMPTY_FC,
  areaGeoJSON,
  eventFeature,
  eventSignature,
  eventsToGeoJSON,
  makeRectArea,
  pointFeature,
} from "./mapLayers";
import { CLUSTER_MAX_ZOOM, installLayers } from "./mapInstallLayers";
import { loadLabelFont } from "../lib/labelFont";
import { foldIncluded, readHintDismissed, uniqueBoundaries, writeHintDismissed } from "./mapBorders";
import {
  BoundaryPopup,
  MapKey,
  MapNotices,
  MapTip,
  MapToolbar,
  BorderYearChoice,
} from "./MapUi";
import MapNav from "./MapNav";
import useMediaQuery from "../hooks/useMediaQuery";
import MapLoading from "./MapLoading";
import { diffById } from "../lib/sourceDiff";
import ClusterList from "./ClusterList";
import useMapHoverLabel from "./useMapHoverLabel";
import usePlaceMarker from "./usePlaceMarker";
import { LIST_MAX, allSameCoordinates, clusterClickAction, eventsBounds, stackItems } from "../lib/mapStack";
import useCountryHighlight from "./countryHighlight";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { boundariesForYear, boundaryLabelsForYear } from "../lib/boundaryLabels";
import { areaRoundTrips } from "../lib/urlState";
import {
  decadeFloor,
  loadBoundaryDecade,
  loadDeferredGeometry,
  loadFarLand,
  loadLand,
  loadLandCell,
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
import { cellsInBounds, createLandStore, wantsBackgroundDetail } from "../lib/landStore";
import { SEA_COLOR, defaultBounds, openingPadding } from "../lib/mapBase";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";
import { reducedMotion } from "../lib/reducedMotion";
import { isUnhandledEscape } from "../lib/escapeKey";
import { TAP_SLOP_PX, pickMarker } from "../lib/tapTarget";
import { keepPinInside, mapClearView, screenPoint, sheetCover } from "../lib/mapInsets";
import { eventCoords } from "../lib/geo";
import { dragArea, handleBox, pickHandle } from "../lib/areaDrag";

// MapLibre GL resolves its worker script relative to its own module URL at
// runtime (via a dynamic import.meta.url template), which Vite's static
// asset analyzer can't follow - so in a production build the worker file
// never gets copied into dist/ and the map silently fails to render (no
// thrown error - the failure happens inside the Worker, which doesn't
// bubble up as a page-level exception). This only matters for the built
// app - Vite's dev server can already resolve maplibre-gl's own worker URL
// straight out of node_modules, so leave dev mode alone and only override
// the built app, where we ship the worker as a content-hashed asset. Since
// MapLibre 6.13.0 the worker is self-contained (it no longer imports
// maplibre-gl-shared.mjs, now an empty, deprecated file), so nothing needs a
// fixed file name.
if (import.meta.env.PROD) {
  setWorkerUrl(maplibreWorkerUrl);
}
// Start MapLibre's worker now, while React is still rendering the map's
// container and the style is being built, instead of when the Map is
// constructed. prewarm() acquires the same global worker pool every Map uses
// (one pool, created once, never torn down - the page only ever has this map),
// so it creates no extra worker; it must follow setWorkerUrl to start the
// hashed worker file. Measured (2026-10, slow 4G phone profile, median of 7):
// the map shows ~65 ms sooner, better in 7 of 7 runs, LCP unchanged.
prewarm();

// Period-correct naming (Ottoman Empire -> Turkey, mandate-era names, etc.) is now
// resolved at ingest time - see scripts/boundary-corrections.js - so boundaries.json's
// `name` property is already the right one to show for whatever year a feature is
// active. This component doesn't need its own historical knowledge.

// Our own base style: a sea-colored background and nothing else. Land, borders
// and events are all added from our own data on load, so the map depends on no
// third-party tile server, and no modern political layer can leak onto a
// historical map. No `glyphs` URL: MapLibre draws the labels in the browser
// from the page's own Inter (lib/labelFont.js).
// SEA_COLOR: keep in sync with .map-placeholder in SidePanel.css.
const BASE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": SEA_COLOR } }],
};

// The longest the loading cover stays up once the map has its layers (the load
// handler), for a slow worker or event list, or a map that never settles: it
// normally goes ~0.2 s after that on desktop and ~0.6 s on a slow phone link
// (measured 2026-10, 1.6 Mbps/150 ms, 4x CPU: MapLibre's worker script is the
// last thing in), so 2 s leaves room for a slower link without a long wait.
const REVEAL_CAP_MS = 2000;

// The first-visit hint hides itself after this long (or on the first map interaction).
const HINT_AUTO_HIDE_MS = 8000;

// Drag/tap hit tolerance around area handles, in CSS pixels.
const HANDLE_HIT_PX = { mouse: 10, touch: 22, pen: 14 };
// A drag shorter than this (px) is treated as a stray click, not a drawn area.
const MIN_DRAW_PX = 6;
// How long "Search area: the map view" stays under the toolbar after Use map view.
const VIEW_AREA_NOTE_MS = 5000;

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
  map.getCanvas().style.cursor = drawing ? "cell" : ""; // drag-to-select cursor, not a crosshair (no weapon-like visuals)
}

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

const MAP_DESCRIPTION_ID = "map-description";

export default function MapView({
  events,
  year: timelineYear,
  borderYear = null, // an opened event's year: shown instead of the timeline year (App.jsx)
  eventYear = null, // the opened event's year, for the "Borders as of" choice
  eventYearLabel = "event", // "event start" for a multi-year event
  onChooseBorderYear, // ("event" | "range")
  highlightEvent = null, // event whose listed countries are shaded (countryHighlight.js)
  matchIds = null,
  selectedEventId,
  hoverId,
  focus,
  keepPin = null, // {nonce, center}: a new one each time the phone sheet moves with an event open (App.jsx)
  areaMode = "off",
  area = null,
  onAreaModeChange,
  onAreaChange,
  onViewportChange,
  onSelectEvent,
  eventsLoading = false,
  yearPending = false, // true while the year to show is not known yet: no borders are fetched (App.jsx)
  categories = null, // category ids that have events: the Map key lists only these (null = all)
  place = null, // {lon, lat} "What was this place?" describes: marked on the map (usePlaceMarker.js)
  onPlaceHistory, // ({lon, lat}): the border popup's "History of this place"
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
  // Drops the area drag in progress, if any (the pointer effect sets it).
  const abortDragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [landDrawn, setLandDrawn] = useState(false); // the canvas shows the opening view: MapLoading can go
  // The events source holds the loaded event list (or its load has failed): the
  // reveal waits for it (the load handler).
  const eventsInRef = useRef(false);

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
  // An opened event retires the first-visit tip for this visit: it would come
  // back over the event's place when the phone sheet is lowered ("Show map").
  if (hintOpen && selectedEventId) setHintOpen(false);
  // Events sharing one spot, listed after a click: {point, items, total}.
  const [stackList, setStackList] = useState(null);
  const stackOpenerRef = useRef(null); // what had focus when the list opened
  const hoverLabelRef = useRef(null);
  const compact = useMediaQuery("(max-width: 768px)");
  const landFailedRef = useRef(false);
  // The land source draws both light files (lib/mapExtent.js NEAR_LAND_EXTENT) and,
  // inside the Middle East, each cell's 1:10m coast once loaded (lib/landStore.js).
  const landRef = useRef({ near: null, far: null });
  const landAppliedRef = useRef(false); // the land source holds the light land
  const landStoreRef = useRef(null);
  // Set by the map's load handler: starts the 1:10m coast for land.json that
  // arrived late (after a failure, via Retry), whose cell list was empty then.
  const landArrivedRef = useRef(null);
  landStoreRef.current ??= createLandStore();
  const landData = () => landStoreRef.current.data();
  // The settled year re-checks the deferred geometries in view (below); border
  // decades are fetched as soon as the shown year enters them (the fetch trigger).
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
      if (!landRef.current.near) landStoreRef.current.addLow(land);
      landRef.current.near = land;
      landFailedRef.current = false;
      setBorderError((e) => (e && e.decade === "land" ? null : e));
      landArrivedRef.current?.();
      return land;
    } catch {
      landFailedRef.current = true;
      setBorderError({ decade: "land", phase: "final" });
      // The loading cover waits for a frame with the land in, or its failure
      // (the reveal in the load handler): a map that went idle while the land was
      // still loading draws no further frame by itself.
      mapRef.current?.triggerRepaint();
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
    // An already cached decade returns at once without touching the notice,
    // so the "retrying" set above is cleared here.
    if (await fetchDecade(decade)) setBorderError((e) => (e && e.decade === decade ? null : e));
  }, [fetchDecade, fetchLand]);

  useEffect(() => {
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      // The tracked countries on a narrow (phone) map, the wider region
      // otherwise; on phones above the lowered sheet (lib/mapBase.js openingPadding).
      bounds: defaultBounds(containerRef.current.clientWidth),
      // MapLoading draws its stand-in in this same view (lib/mapBase.js defaultCamera).
      fitBoundsOptions: {
        padding: openingPadding(containerRef.current.clientHeight, sheetCover(containerRef.current)),
      },
      // land.json is clipped to this extent (scripts/split-data.mjs), so panning
      // further would show a sea where land was dropped.
      maxBounds: [MAP_EXTENT.slice(0, 2), MAP_EXTENT.slice(2)],
    });
    mapRef.current = map;
    // MapLibre's canvas is a region named "Map" with nothing inside for a screen reader: it points at a hidden line
    // (MAP_DESCRIPTION_ID, rendered below) saying where the events are listed and which keys move the map.
    map.getCanvas().setAttribute("aria-describedby", MAP_DESCRIPTION_ID);
    if (import.meta.env.DEV) window.__map = map; // debug helper, dev-only
    // Set on unmount; the async load handler checks it after each await.
    let cancelled = false;
    let revealCap; // the loading cover's time limit (the load handler)

    map.on("load", async () => {
      // No "idle" until our layers are in: MapLibre places labels without a fade
      // until its first "idle" (then fades them in over 300 ms, and redoes the
      // placement at most once per fade). Without this the bare map went idle
      // while the data below loaded, and the country names faded in ~0.2-0.5 s
      // after the borders (measured 2026-10, desktop filmstrip). "load" fires
      // just before that check in the same frame, so set here it is in time.
      // Costs a repaint per frame of an empty map until installLayers (at most
      // the 1.2 s races below); fades on later pans and zooms are unchanged.
      map.repaint = true;
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
        if (l && !cancelled && map.getSource("land")) {
          map.getSource("land").setData(landData());
          landAppliedRef.current = true;
        }
        return l;
      });
      const [landResult] = await Promise.all([
        Promise.race([landPromise, sleep(1200).then(() => null)]),
        // A year still unknown (yearPending) is fetched by the effect below once known.
        yearPendingRef.current ? null : Promise.race([fetchDecade(initialDecade), sleep(1200)]),
        // Labels drawn before their font loads keep a fallback font (lib/labelFont.js).
        // The files are the page's own Inter, so normally already in the cache.
        Promise.race([loadLabelFont(), sleep(1200)]),
      ]);
      // Unmounted while the data was loading: the map is already removed.
      if (cancelled) return;
      map.repaint = false;
      if (landResult) landAppliedRef.current = true;
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

      // Cluster ids change whenever the events data does (each Play step, a new
      // search): a lookup answered after a change (`eventsGeneration` moved on) is
      // dropped, as its id may now be another cluster (as in useMapHoverLabel.js).
      let eventsGeneration = 0;
      map.on("data", (e) => {
        if (e.sourceId === "events" && e.sourceDataType === "content") eventsGeneration++;
      });

      const clickCluster = async (e, feature) => {
        const center = feature.geometry.coordinates;
        const { cluster_id: clusterId, point_count: count } = feature.properties;
        const source = map.getSource("events");
        const asked = eventsGeneration;
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
        if (cancelled || asked !== eventsGeneration) return;
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
        setBorderPopup(
          hits.length
            ? { point: [e.point.x, e.point.y], lngLat: [e.lngLat.lng, e.lngLat.lat], items: foldIncluded(uniqueBoundaries(items)), hint }
            : null
        );
      });

      setMapReady(true);

      // The stand-in (MapLoading) stays over the canvas until the map has drawn
      // the whole opening view - land, borders, their names and the events - and
      // then goes in one step. "idle" is that frame: every tile cut and drawn,
      // every label placed (no fade yet, see map.repaint above). Revealing on the
      // first frame with land and borders instead showed the map in stages
      // (measured 2026-10, desktop filmstrip: bare land at 0.77 s, borders and
      // events 0.9 s, names fading in until 1.35 s).
      // Never before the land is in: its request may outlast installLayers' 1.2 s
      // wait, and the map would uncover bare sea. A failed land load reveals the
      // map with its notice, as does a failed event list (eventsLoading ends).
      // REVEAL_CAP_MS after this point the map is shown with whatever it has
      // drawn, so a slow worker or event list never keeps the stand-in up.
      let capped = false;
      const reveal = () => {
        map.off("idle", revealOnIdle);
        clearTimeout(revealCap);
        setLandDrawn(true);
      };
      const landIn = () => landAppliedRef.current || landFailedRef.current;
      const revealOnIdle = () => {
        if (landIn() && (eventsInRef.current || capped)) reveal();
      };
      revealCap = setTimeout(() => {
        capped = true;
        if (landIn()) reveal();
      }, REVEAL_CAP_MS);
      map.on("idle", revealOnIdle);
      map.triggerRepaint();

      // Land beyond the opening view loads once that view has drawn, so it never
      // competes with it; a failed load is retried on the next pan or zoom.
      const addFarLand = () => {
        loadFarLand()
          .then((far) => {
            if (cancelled || landRef.current.far) return;
            landRef.current.far = far;
            map.off("moveend", addFarLand);
            const { add } = landStoreRef.current.addLow(far);
            map.getSource("land")?.updateData({ add });
          })
          .catch(() => {});
      };
      map.once("idle", () => {
        if (cancelled) return;
        addFarLand();
        map.on("moveend", addFarLand);
        startLandDetail();
      });

      // The Middle East's Natural Earth 1:10m coast, one cell at a time (lib/landStore.js,
      // scripts/build-land.js): first the cells in and around the view once zoomed in past
      // DETAIL_FETCH_ZOOM, then - unless the visitor asked to save data or the link looks
      // slow (wantsBackgroundDetail) - all the others in the background, nearest first, so
      // a zoom-in finds its coast already drawn. Only the cells land.json lists have a
      // file: an unlisted cell's light piece is already its exact 1:10m land, and stays.
      const DETAIL_FETCH_ZOOM = 5;
      const store = landStoreRef.current;
      const requested = new Set();
      const manifest = () => landRef.current.near ?? { cells: [], cellSize: 5 };
      // Fetch cells and swap them in together, in one update of the source.
      const loadCells = (cells) => {
        const todo = cells.filter((c) => !requested.has(c));
        if (!todo.length) return Promise.resolve();
        for (const c of todo) requested.add(c);
        const fetches = todo.map((c) =>
          loadLandCell(c).then(
            (fc) => [c, fc],
            () => (requested.delete(c), null) // retried on a later pan or zoom
          )
        );
        return Promise.all(fetches).then(async (got) => {
          if (cancelled) return;
          const add = [];
          const remove = [];
          for (const [c, fc] of got.filter(Boolean)) {
            const d = store.addDetail(c, fc);
            add.push(...d.add);
            remove.push(...d.remove);
          }
          if (add.length || remove.length) await map.getSource("land")?.updateData({ add, remove });
        });
      };
      const onView = () => {
        if (map.getZoom() < DETAIL_FETCH_ZOOM) return;
        const { cells, cellSize } = manifest();
        const b = map.getBounds();
        const mx = (b.getEast() - b.getWest()) * 0.25;
        const my = (b.getNorth() - b.getSouth()) * 0.25;
        loadCells(cellsInBounds(cells, cellSize, [b.getWest() - mx, b.getSouth() - my, b.getEast() + mx, b.getNorth() + my]));
      };
      const backgroundFill = async () => {
        const { cells, cellSize } = manifest();
        const c = map.getCenter();
        const dist = (id) => {
          const [x, y] = id.split("_").map(Number);
          return Math.hypot(x + cellSize / 2 - c.lng, y + cellSize / 2 - c.lat);
        };
        const order = [...cells].sort((a, b) => dist(a) - dist(b));
        // A few cells per batch, each when the browser is idle, so no update of the source is large.
        for (let i = 0; i < order.length && !cancelled; i += 8) {
          await new Promise((r) => (window.requestIdleCallback ?? setTimeout)(r));
          await loadCells(order.slice(i, i + 8));
        }
      };
      // The cell list comes with land.json: until it is in (it may first fail
      // and arrive through Retry) there is nothing to fill, so the background
      // fill starts once both the map is idle and the list is known.
      let detailStarted = false;
      let fillStarted = false;
      const startFill = () => {
        if (fillStarted || !landRef.current.near || !wantsBackgroundDetail(navigator.connection)) return;
        fillStarted = true;
        backgroundFill();
      };
      const startLandDetail = () => {
        detailStarted = true;
        map.on("moveend", onView);
        onView();
        startFill();
      };
      landArrivedRef.current = () => {
        if (cancelled || !detailStarted) return;
        onView();
        startFill();
      };
    });

    return () => {
      cancelled = true;
      clearTimeout(revealCap);
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

  // After the effect above, so the events are in the source: the next "idle"
  // has drawn them, and may reveal the map (the load handler).
  useEffect(() => {
    if (!mapReady || eventsLoading || eventsInRef.current) return;
    eventsInRef.current = true;
    mapRef.current.triggerRepaint(); // an already idle map fires "idle" after this frame
  }, [eventsLoading, mapReady]);

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
  }, [shownDecade, fetchDecade, mapReady, yearPending]);

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
  // Both are placed at the clicked pixel and describe that year's map: a new year
  // (a scrub, each Play step) or a pan/zoom by the user leaves them pointing at the
  // wrong place, so they close. Moves the app makes itself carry no originalEvent
  // and leave them open.
  // The map's own zoom/pan/reset buttons are user moves too (MapNav, below).
  const closeMapPopups = () => {
    setBorderPopup(null);
    setStackList(null);
  };
  useEffect(() => {
    setBorderPopup(null);
    setStackList(null);
  }, [year]);
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const onMoveStart = (e) => {
      if (!e.originalEvent) return;
      setBorderPopup(null);
      setStackList(null);
    };
    map.on("movestart", onMoveStart);
    return () => map.off("movestart", onMoveStart);
  }, [mapReady]);

  usePlaceMarker({ mapRef, mapReady, place });

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
  useCountryHighlight({ mapRef, mapReady, event: highlightEvent, year, features: yearFeatures, focus, openEventId: selectedEventId ?? null });
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
    const el = map.getContainer();
    map.fitBounds(defaultBounds(el.clientWidth), {
      padding: openingPadding(el.clientHeight, sheetCover(el)),
      duration: reducedMotion() ? 0 : 600,
    });
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

  // "Zoom to results": fit the view around the search/filter matches that
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
  useEffect(() => {
    if (!mapReady || !onViewportChange) return;
    const map = mapRef.current;
    let timeoutId;

    function report() {
      const b = map.getBounds();
      onViewportChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
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
  }, [mapReady, onViewportChange]);

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

  // Selected marker (own source: stays visible even inside a cluster). App's
  // mapEvents always includes the selected event.
  useEffect(() => {
    if (!mapReady) return;
    const ev = selectedEventId ? events.find((e) => e.id === selectedEventId) : null;
    setPointSource("selected", ev);
  }, [selectedEventId, events, mapReady, setPointSource]);

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
    // The place goes in the middle of the part of the map that the controls
    // and, on phones, the sheet leave in sight (lib/mapInsets.js), not under them.
    const { offset } = mapClearView(map);
    const opts = { center: [focus.lon, focus.lat], zoom, offset };
    // easeTo with no duration, not jumpTo, which has no `offset`.
    if (reducedMotion()) map.easeTo({ ...opts, duration: 0 });
    else map.flyTo(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, mapReady]);

  // The phone sheet moved with an event open: more or less of the map is in
  // sight now, and the pin may sit under the controls or the sheet. Nudge the
  // camera just enough to keep it inside what is in sight (lib/mapInsets.js
  // keepPinInside), without changing the zoom. A pin the reader had already
  // moved off the map is left alone. Lowered to its bar ("Show map"), the sheet
  // leaves the whole map in sight: the pin goes in the middle of it.
  useEffect(() => {
    if (!mapReady || !keepPin || !selectedEventId) return;
    const map = mapRef.current;
    const ev = eventsRef.current.find((e) => e.id === selectedEventId);
    const c = ev && eventCoords(ev);
    if (!c) return;
    const pin = [c.lon, c.lat];
    const { width, height, padding, offset } = mapClearView(map);
    if (keepPin.center) {
      map.easeTo({ center: pin, offset, duration: reducedMotion() ? 0 : 350 });
      return;
    }
    const at = map.getCenter();
    const cam = { center: [at.lng, at.lat], zoom: map.getZoom() };
    const [sx, sy] = screenPoint(pin, cam, width, height);
    if (sx < 0 || sy < 0 || sx > width || sy > height) return;
    const center = keepPinInside(pin, cam, width, height, padding);
    if (center === cam.center) return;
    map.easeTo({ center, duration: reducedMotion() ? 0 : 350 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepPin]);

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
  }, [area, areaMode, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    applyInteractivity(mapRef.current, areaMode, !!area);
  }, [areaMode, area, mapReady]);

  // Escape leaves draw mode, unless something else took that Escape (lib/escapeKey.js).
  // A shape being dragged out is dropped first, so its release commits nothing.
  useEffect(() => {
    if (areaMode === "off") return;
    const onKey = (e) => {
      if (!isUnhandledEscape(e)) return;
      e.preventDefault();
      abortDragRef.current?.();
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
    let aborted = null; // pointer id of a drag dropped by Escape, until its release

    const locate = (ev) => {
      const r = el.getBoundingClientRect();
      const pt = [ev.clientX - r.left, ev.clientY - r.top];
      const ll = map.unproject(pt);
      return { pt, ll: [ll.lng, ll.lat] };
    };

    // The area handle under the pointer (lib/areaDrag.js), or null.
    const handleAt = (pt, pointerType) => {
      const r = HANDLE_HIT_PX[pointerType] ?? HANDLE_HIT_PX.mouse;
      return pickHandle(map.queryRenderedFeatures(handleBox(pt, r), { layers: ["area-handles"] }));
    };

    const end = (commit) => {
      const d = drag;
      drag = null;
      draggingRef.current = false;
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 60);
      const p = propsRef.current;
      const isDraw = d.kind === "rect" || d.kind === "circle";
      // A shape its own link would drop (a sideways-only rectangle, a circle of a
      // few metres: lib/urlState.js areaRoundTrips) is not committed; a draw
      // stays armed for another try, an edit snaps back.
      if (commit && d.moved && d.current && !areaRoundTrips(d.current)) commit = false;
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
      aborted = null; // a new press: the dropped drag's release is long gone
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
      drag.current = dragArea(drag, ll);
      setAreaSources(drag.current, drag.kind !== "rect" && drag.kind !== "circle");
    };

    const releaseAborted = (ev) => {
      if (aborted !== ev.pointerId) return false;
      aborted = null;
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 60);
      return true;
    };
    const onUp = (ev) => {
      if (releaseAborted(ev)) return;
      if (drag && ev.pointerId === drag.id) end(true);
    };
    const onCancel = (ev) => {
      if (releaseAborted(ev)) return;
      if (drag && ev.pointerId === drag.id) end(false);
    };
    // Escape mid-drag drops the drag: the area stays as it was, and the release
    // that follows commits nothing. In draw mode the Escape handler above calls
    // this before leaving the mode; a handle edit (no draw mode) is handled here.
    // The pointer is still down, so its release (a click, for the map) is
    // swallowed as well (`aborted`, in onUp/onCancel).
    const abort = () => {
      aborted = drag.id;
      end(false);
    };
    abortDragRef.current = () => drag && abort();
    const onKey = (e) => {
      if (!drag || propsRef.current.areaMode !== "off" || !isUnhandledEscape(e)) return;
      e.preventDefault();
      abort();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      abortDragRef.current = null;
      window.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [mapReady]);

  // "Use map view" (the Draw menu): the area is a rectangle of what the map
  // shows, the way to set one without dragging (keyboard, a single tap). A
  // short note under the toolbar confirms it, also to screen readers: the
  // outline lies on the map's own edges.
  // The note shows while that area is still the one set.
  const [viewArea, setViewArea] = useState(null);
  useEffect(() => {
    if (!viewArea) return;
    const timer = setTimeout(() => setViewArea(null), VIEW_AREA_NOTE_MS);
    return () => clearTimeout(timer);
  }, [viewArea]);
  const viewAreaNote = viewArea != null && viewArea === area && areaMode === "off";
  const areaFromView = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const next = makeRectArea([b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]);
    onAreaChange?.(next);
    onAreaModeChange?.("off");
    setViewArea(next);
  };

  // Zoom buttons: one level, eased like the other camera moves (none with reduced motion).
  const zoomBy = (dir) => {
    const map = mapRef.current;
    if (!map) return;
    const opts = { duration: reducedMotion() ? 0 : 300 };
    if (dir > 0) map.zoomIn(opts);
    else map.zoomOut(opts);
    if (hintOpen) dismissHint();
  };
  // Pan buttons: a third of the map's width or height per press, eased the same way.
  const panBy = (dx, dy) => {
    const map = mapRef.current;
    if (!map) return;
    const el = map.getContainer();
    map.panBy([Math.round((dx * el.clientWidth) / 3), Math.round((dy * el.clientHeight) / 3)], {
      duration: reducedMotion() ? 0 : 300,
    });
    if (hintOpen) dismissHint();
  };

  const toggle = (mode) => onAreaModeChange?.(areaMode === mode ? "off" : mode);
  const hint =
    areaMode === "rect"
      ? "Drag on the map from one corner to the opposite corner, or choose Use map view under Draw area. Esc cancels."
      : areaMode === "circle"
        ? "Press at the centre and drag out to set the radius, or choose Use map view under Draw area. Esc cancels."
        : viewAreaNote
          ? "Search area: the current map view."
          : null;

  return (
    <div className="map-view" style={{ position: "relative" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {!landDrawn && <MapLoading cover />}
      <MapToolbar
        areaMode={areaMode}
        hasArea={!!area}
        compact={compact}
        onToggleMode={toggle}
        onClearArea={() => onAreaChange?.(null)}
        onUseView={areaFromView}
        matchCount={matchBounds?.count ?? null}
        matchTotal={matchIds?.size ?? null}
        onShowMatches={showMatches}
        drawHint={hint}
        onInteract={hintOpen ? dismissHint : undefined}
      />
      <div className="mu-ctrl-right">
        <MapKey
          year={year}
          shownYear={shownBorderYear}
          updating={!decadeCached}
          eventYearShown={borderYear != null}
          items={yearBorders}
          categories={categories}
          yearBeside={eventYear != null && eventYear !== timelineYear}
        />
        {eventYear != null && eventYear !== timelineYear && (
          <BorderYearChoice
            eventYear={eventYear}
            eventLabel={eventYearLabel}
            rangeYear={timelineYear}
            eventShown={borderYear != null}
            compact={compact}
            onChoose={onChooseBorderYear}
          />
        )}
        <MapNotices
          loading={eventsLoading || !mapReady || !decadeCached}
          borderError={relevantError}
          onRetry={retryBorders}
        />
      </div>
      <MapNav
        onZoomIn={() => {
          closeMapPopups();
          zoomBy(1);
        }}
        onZoomOut={() => {
          closeMapPopups();
          zoomBy(-1);
        }}
        onReset={() => {
          closeMapPopups();
          resetView();
          if (hintOpen) dismissHint();
        }}
        onPan={(dx, dy) => {
          closeMapPopups();
          panBy(dx, dy);
        }}
      />
      {hintOpen && <MapTip onDismiss={dismissHint} />}
      {borderPopup && (
        <BoundaryPopup
          popup={borderPopup}
          onClose={closePopup}
          width={size.w}
          height={size.h}
          onPlaceHistory={
            onPlaceHistory &&
            ((p) => {
              setBorderPopup(null);
              onPlaceHistory(p);
            })
          }
        />
      )}
      {stackList && (
        <ClusterList list={stackList} onSelect={selectFromStack} onClose={closeStack} width={size.w} height={size.h} />
      )}
      <div ref={hoverLabelRef} className="mu-tooltip" aria-hidden="true" hidden />
      {/* The keys are MapLibre's keyboard handler (arrows pan, + and - zoom, with the map focused) and MapNav. */}
      <p id={MAP_DESCRIPTION_ID} className="mu-visually-hidden">
        The panel lists the events the map shows: those of the selected years, or the matches of a search. With the map
        focused, the arrow keys move the map and the plus and minus keys zoom; the zoom and Move map buttons do the same.
      </p>
    </div>
  );
}
