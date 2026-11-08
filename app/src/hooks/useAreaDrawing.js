import { useCallback, useEffect, useRef, useState } from "react";
import { areaGeoJSON, makeRectArea } from "../components/mapLayers";
import { areaRoundTrips } from "../lib/urlState";
import { isUnhandledEscape } from "../lib/escapeKey";
import { dragArea, handleBox, pickHandle } from "../lib/areaDrag";

// The search area on the map (MapView): drawing a rectangle or circle, dragging
// its handles, Escape, and "Use map view". The area itself lives in App (URL
// state); this keeps the map's area layers and pointer handling in step with it.

// Drag/tap hit tolerance around area handles, in CSS pixels.
const HANDLE_HIT_PX = { mouse: 10, touch: 22, pen: 14 };
// The area handle at `pt` ([x, y] in the map's pixels; lib/areaDrag.js), or null.
export const handleAt = (map, pt, pointerType) => {
  const r = HANDLE_HIT_PX[pointerType] ?? HANDLE_HIT_PX.mouse;
  return pickHandle(map.queryRenderedFeatures(handleBox(pt, r), { layers: ["area-handles"] }));
};
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

// The map's search-area layers show area `a` (handles only when `showHandles`).
function setAreaSources(map, a, showHandles = true) {
  const g = areaGeoJSON(a, showHandles);
  map.getSource("area")?.setData(g.shape);
  map.getSource("area-handles")?.setData(g.handles);
  map.getSource("area-label")?.setData(g.label);
}

/**
 * @param {object} o
 * @param {{current: import("maplibre-gl").Map}} o.mapRef
 * @param {boolean} o.mapReady
 * @param {object|null} o.area            the current search area (App)
 * @param {"off"|"rect"|"circle"} o.areaMode
 * @param {{current: object}} o.propsRef  MapView's latest props (area, areaMode, onAreaChange, onAreaModeChange)
 * @param {{current: boolean}} o.draggingRef  true while a shape or handle is dragged (MapView's hover reads it)
 * @param {{current: boolean}} o.suppressClickRef  set briefly after a drag, so its release is not a map click
 * @param {Function} [o.onAreaChange]
 * @param {Function} [o.onAreaModeChange]
 * @returns {{viewAreaNote: boolean, areaFromView: Function, clearArea: Function}}
 */
export default function useAreaDrawing({
  mapRef,
  mapReady,
  area,
  areaMode,
  propsRef,
  draggingRef,
  suppressClickRef,
  onAreaChange,
  onAreaModeChange,
}) {
  const abortDragRef = useRef(null);

  // Search-area layers follow the `area` prop (URL state, chip removal, edits).
  // (The refs in the dependency lists are stable: they never re-run an effect.)
  useEffect(() => {
    if (!mapReady || draggingRef.current) return;
    setAreaSources(mapRef.current, area, areaMode === "off");
  }, [area, areaMode, mapReady, mapRef, draggingRef]);

  useEffect(() => {
    if (!mapReady) return;
    applyInteractivity(mapRef.current, areaMode, !!area);
  }, [areaMode, area, mapReady, mapRef]);

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
  }, [areaMode, propsRef]);

  // Pointer-driven drawing and handle editing (mouse, touch and pen alike).
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const el = map.getCanvasContainer();
    let drag = null;
    let aborted = null; // pointer id of a drag dropped by Escape, until its release
    // A drag redraws the shape at most once per animation frame, for the latest
    // move: each redraw is three setData calls (setAreaSources), each a new
    // GeoJSON tile job in MapLibre's worker, and a pointer can report several
    // moves per frame. `pending` is that latest move, `frame` its frame; the
    // release applies a move still pending first (flushMove), so the committed
    // shape is always where the pointer let go.
    let frame = 0;
    let pending = null;

    const locate = (ev) => {
      const r = el.getBoundingClientRect();
      const pt = [ev.clientX - r.left, ev.clientY - r.top];
      const ll = map.unproject(pt);
      return { pt, ll: [ll.lng, ll.lat] };
    };

    const applyMove = (ev) => {
      const { pt, ll } = locate(ev);
      if (!drag.moved) {
        if (Math.hypot(pt[0] - drag.startPt[0], pt[1] - drag.startPt[1]) < MIN_DRAW_PX) return;
        drag.moved = true;
      }
      drag.current = dragArea(drag, ll);
      setAreaSources(map, drag.current, drag.kind !== "rect" && drag.kind !== "circle");
    };
    const dropMove = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
    };
    const flushMove = () => {
      const ev = pending;
      dropMove();
      if (ev && drag) applyMove(ev);
    };

    const end = (commit) => {
      dropMove();
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
        setAreaSources(map, p.area, p.areaMode === "off");
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
      else if (p.area) kind = handleAt(map, pt, ev.pointerType);
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

    // Hovering a handle (no drag) sets the "grab" cursor in MapView's handleHover.
    const onMove = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      pending = ev;
      if (!frame) frame = requestAnimationFrame(flushMove);
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
      if (!drag || ev.pointerId !== drag.id) return;
      flushMove();
      end(true);
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
      dropMove();
      abortDragRef.current = null;
      window.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [mapReady, mapRef, propsRef, draggingRef, suppressClickRef]);

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
  const areaFromView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const next = makeRectArea([b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]);
    onAreaChange?.(next);
    onAreaModeChange?.("off");
    setViewArea(next);
  }, [mapRef, onAreaChange, onAreaModeChange]);
  const clearArea = useCallback(() => onAreaChange?.(null), [onAreaChange]);

  return { viewAreaNote, areaFromView, clearArea };
}
