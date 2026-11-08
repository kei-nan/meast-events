import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MaplibreMap, prewarm, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { EMPTY_FC, eventFeature, eventSignature, eventsToGeoJSON, pointFeature } from "./mapLayers";
import { CLUSTER_MAX_ZOOM, installLayers } from "./mapInstallLayers";
import { loadLabelFont } from "../lib/labelFont";
import { readHintDismissed, writeHintDismissed } from "./mapBorders";
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
import useMapHoverLabel from "../hooks/useMapHoverLabel";
import usePlaceMarker from "../hooks/usePlaceMarker";
import { eventsBounds } from "../lib/mapStack";
import useCountryHighlight from "./countryHighlight";
import { boundariesForYear, boundaryLabelsForYear } from "../lib/boundaryLabels";
import { decadeFloor, loadLand } from "../lib/dataClient";
import { drawableBoundaries } from "../lib/deferredBoundaries";
import { MAP_EXTENT } from "../lib/mapExtent";
import { createLandStore } from "../lib/landStore";
import { startLandLoading } from "./mapLand";
import { installMapClicks, ringFor } from "./mapClicks";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, SEA_COLOR, defaultBounds, openingPadding } from "../lib/mapBase";
import { reducedMotion } from "../lib/reducedMotion";
import { keepPinInside, mapClearView, screenPoint, sheetCover } from "../lib/mapInsets";
import { eventCoords } from "../lib/geo";
import useAreaDrawing, { handleAt } from "../hooks/useAreaDrawing";
import useBoundaryDecades from "../hooks/useBoundaryDecades";
import { sleep, withRetry } from "../lib/retry";

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

const MAP_DESCRIPTION_ID = "map-description";

// Memoized (the export at the end): App re-renders on every keystroke in the
// search box, and while the text is being typed its props to the map stay the
// same (App.jsx mapEvents, matchIds), so the map skips those renders.
function MapView({
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
  onMapStatus, // ("ready"): the map has started (App.jsx; its stand-ins report "failed")
  initialView = null, // {lon, lat, zoom}: the link's camera to open on (lib/urlState.js `m`); read at mount
  onCameraChange, // ({lon, lat, zoom}): the camera after a move settles, for the link
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
  const draggingRef = useRef(false); // an area shape or handle is being dragged (useAreaDrawing)
  const suppressClickRef = useRef(false); // set briefly after a drag: its release is not a map click
  const [mapReady, setMapReady] = useState(false);
  const [landDrawn, setLandDrawn] = useState(false); // the canvas shows the opening view: MapLoading can go
  // The events source holds the loaded event list (or its load has failed): the
  // reveal waits for it (the load handler).
  const eventsInRef = useRef(false);

  const [borderPopup, setBorderPopup] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hintOpen, setHintOpen] = useState(() => !readHintDismissed());
  // An opened event retires the first-visit tip for this visit: it would come
  // back over the event's place when the phone sheet is lowered ("Show map").
  if (hintOpen && selectedEventId) setHintOpen(false);
  // Events sharing one spot, listed after a click: {point, items, total}.
  const [stackList, setStackList] = useState(null);
  const stackOpenerRef = useRef(null); // what had focus when the list opened
  const popupOpenerRef = useRef(null); // the same for the border details
  const hoverLabelRef = useRef(null);
  const hoverRingRef = useRef(null); // (feature | null): the hover ring, set by the load handler
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

  // The borders: decade files fetched and cached, the year's borders on the map,
  // the deferred geometries, and the load errors (land's too: fetchLand below).
  const {
    boundaryCacheRef,
    appliedBordersRef,
    fetchDecade,
    setBorderError,
    decadeCached,
    shownBorderYear,
    yearFeatures,
    yearBorders,
    relevantError,
  } = useBoundaryDecades({ mapRef, mapReady, year, yearRef, yearPending });

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
  }, [setBorderError]); // a state setter (useBoundaryDecades): stable

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
  }, [fetchDecade, fetchLand, setBorderError]);

  useEffect(() => {
    // A link's camera (its `m`, lib/urlState.js) opens the map where it was
    // seen; without one, the tracked countries on a narrow (phone) map, the
    // wider region otherwise, on phones above the lowered sheet (lib/mapBase.js
    // openingPadding). MapLoading draws its stand-in in this same view
    // (lib/mapBase.js viewCamera, defaultCamera).
    const opening = initialView
      ? { center: [initialView.lon, initialView.lat], zoom: initialView.zoom }
      : {
          bounds: defaultBounds(containerRef.current.clientWidth),
          fitBoundsOptions: {
            padding: openingPadding(containerRef.current.clientHeight, sheetCover(containerRef.current)),
          },
        };
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      ...opening,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
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
        year: yearRef.current,
      });
      sourceSigsRef.current = new Map(
        eventsRef.current.filter((e) => e.coordinates).map((e) => [e.id, eventSignature(e, matchIdsRef.current)])
      );

      // Hover state for clusters and dots: a gold ring around whatever is under
      // the pointer, from the hover label's query (handleHover, below).
      let hoverKey = null;
      hoverRingRef.current = (f) => {
        const key = f ? (f.properties.cluster_id ?? f.properties.id) : null;
        if (key === hoverKey) return;
        hoverKey = key;
        map.getSource("pointer-hover")?.setData(f ? ringFor(f, 5) : EMPTY_FC);
      };

      const clickable = () => propsRef.current.areaMode === "off" && !suppressClickRef.current;

      // Clicks and taps: clusters, dots, the events at one spot, border details (mapClicks.js).
      installMapClicks(map, {
        isCancelled: () => cancelled,
        clickable,
        propsRef,
        boundaryCacheRef,
        yearRef,
        setStackList,
        setBorderPopup,
        stackOpenerRef,
        popupOpenerRef,
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

      // The land beyond the opening view, and the 1:10m coast cell by cell (mapLand.js);
      // the function it returns picks up a land.json that arrives late (Retry).
      landArrivedRef.current = startLandLoading(map, { landRef, store: landStoreRef.current, isCancelled: () => cancelled });
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

  // The panel's controls that need the map work (App.jsx, lib/mapUnavailable.js).
  useEffect(() => {
    if (mapReady) onMapStatus?.("ready");
  }, [mapReady, onMapStatus]);

  usePlaceMarker({ mapRef, mapReady, place });

  // The hover label's one query per frame (useMapHoverLabel.js) also draws the
  // ring and sets the cursor: "grab" on an area handle (a press there drags it,
  // even over a marker: hooks/useAreaDrawing.js), "pointer" on a marker.
  // Neither is touched while drawing ("cell", useAreaDrawing) or dragging.
  const isIdle = () => propsRef.current.areaMode === "off" && !draggingRef.current;
  const handleHover = ({ hits, point }) => {
    hoverRingRef.current?.(hits.find((h) => h.layer.id !== "selected-point") ?? null);
    const map = mapRef.current;
    if (!point || !isIdle()) return;
    const onHandle = propsRef.current.area && handleAt(map, [point.x, point.y], "mouse");
    map.getCanvas().style.cursor = onHandle ? "grab" : hits.length ? "pointer" : "";
  };
  useMapHoverLabel({
    mapRef,
    mapReady,
    labelRef: hoverLabelRef,
    isIdle,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    onHover: handleHover,
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

  useCountryHighlight({ mapRef, mapReady, event: highlightEvent, year, features: yearFeatures, focus, openEventId: selectedEventId ?? null });
  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    const el = map.getContainer();
    map.fitBounds(defaultBounds(el.clientWidth), {
      padding: openingPadding(el.clientHeight, sheetCover(el)),
      duration: reducedMotion() ? 0 : 600,
    });
  };
  // Closing the border details or the list (× or Escape) removes the focused
  // card: focus goes back to what had it before (or the map itself, which
  // MapLibre makes focusable).
  const closePopup = useCallback(() => {
    setBorderPopup(null);
    const opener = popupOpenerRef.current;
    popupOpenerRef.current = null;
    (opener?.isConnected ? opener : mapRef.current?.getCanvas())?.focus({ preventScroll: true });
  }, []);
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
  // This and the toolbar's other callbacks are useCallback: MapToolbar (and
  // MapKey) are memoized (MapUi.jsx), so a render of the map for something else -
  // a list row hovered (hoverId), a popup - does not render them again.
  const showMatches = useCallback(() => {
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
  }, [matchBounds, compact]);
  // The × on the tip, and any use of the toolbar, retire it for good (the map
  // itself is covered by the auto-hide effect above).
  const dismissHint = useCallback(() => {
    setHintOpen(false);
    writeHintDismissed();
  }, []);

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

  // The camera, for the link (App.jsx, lib/urlState.js `m`): reported after
  // each move settles, the same 200 ms after moveend as the viewport above (an
  // arrow key held down, or a fling, ends many moves in a row); the URL write
  // that follows is a debounced replace (hooks/useUrlState.js), never a history
  // entry. Not reported for the opening view: a link nobody moved keeps no `m`,
  // so it opens on the default view of the screen it is opened on.
  useEffect(() => {
    if (!mapReady || !onCameraChange) return;
    const map = mapRef.current;
    let timeoutId;
    const report = () => {
      const c = map.getCenter();
      onCameraChange({ lon: c.lng, lat: c.lat, zoom: map.getZoom() });
    };
    const handleMoveEnd = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(report, 200);
    };
    map.on("moveend", handleMoveEnd);
    return () => {
      clearTimeout(timeoutId);
      map.off("moveend", handleMoveEnd);
    };
  }, [mapReady, onCameraChange]);

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

  // The search area: its layers, drawing and handle dragging, Escape and "Use map view".
  const { viewAreaNote, areaFromView, clearArea } = useAreaDrawing({
    mapRef,
    mapReady,
    area,
    areaMode,
    propsRef,
    draggingRef,
    suppressClickRef,
    onAreaChange,
    onAreaModeChange,
  });

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

  const toggle = useCallback(
    (mode) => onAreaModeChange?.(areaMode === mode ? "off" : mode),
    [areaMode, onAreaModeChange]
  );
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
      {!landDrawn && <MapLoading cover view={initialView} />}
      <MapToolbar
        areaMode={areaMode}
        hasArea={!!area}
        compact={compact}
        onToggleMode={toggle}
        onClearArea={clearArea}
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

export default memo(MapView);
