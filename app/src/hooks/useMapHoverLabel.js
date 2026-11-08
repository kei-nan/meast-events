import { useEffect } from "react";
import { LIST_MAX, clusterClickAction, hoverLabel, stackItems } from "../lib/mapStack";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const OFFSET = 14; // px from the cursor
// Every marker layer, the open event's own included: what the pointer is on
// (the pointer cursor); the label and the ring describe the first two only.
const MARKER_LAYERS = ["clusters", "unclustered-point", "selected-point"];

// Desktop hover label for event dots ("Title (year)") and clusters ("N events -
// click to zoom in / list them"). Imperative DOM updates on a ref'd element, so
// mousemove never re-renders React. Touch devices never see it (no hover); the
// label is aria-hidden because the same information is one click away.
//
// It is also the map's one hover query. A mouse reports moves faster than the
// screen is drawn (a gaming mouse at 1000 Hz, or a trackpad, sends several per
// frame), and each queryRenderedFeatures walks the rendered features under the
// point; only the latest move of a frame is looked at, once, in the next
// animation frame. `onHover({hits, point})` hands that one answer to MapView
// (its hover ring and the cursor) instead of MapView asking again; it is called
// with hits = [] when nothing is hovered (the pointer left, or the map is not
// idle: drawing or dragging an area). Measured (2026-11, desktop, a 200-step
// sweep across the map): 8 queries per mousemove before (the label, the ring,
// and MapLibre's own query for each of the six mouseenter/mouseleave layer
// listeners the pointer cursor used), 1 per frame now.
//
// Escape hides the label (WCAG 1.4.13: content shown on hover can be dismissed
// without moving the pointer). It stays hidden over the same marker until the
// pointer moves on to another one, or off the markers. The Escape is not taken
// (no preventDefault): it still does whatever else it does (lib/escapeKey.js),
// like closing a popup or leaving draw mode.
export default function useMapHoverLabel({ mapRef, mapReady, labelRef, isIdle, clusterMaxZoom, onHover }) {
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const el = labelRef.current;
    if (!map || !el) return;
    // cluster_id -> "zoom" | "list" (what a click does, decided as in MapView);
    // cluster ids change whenever the data does, so a lookup answered after a
    // change (`generation` moved on) is dropped: its id may be another cluster.
    const actions = new Map();
    let generation = 0;
    let key = null;
    let dismissed = null; // the marker key whose label Escape hid
    let frame = 0; // the pending animation frame, if any
    let latest = null; // the latest mousemove's point, for that frame

    const cancelFrame = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      latest = null;
    };
    const hide = () => {
      key = null;
      el.hidden = true;
    };
    // The pointer left the map or a move/click started: a frame still pending
    // would put the label back where the pointer was.
    const hideNow = () => {
      cancelFrame();
      hide();
    };
    const place = (point) => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const x = Math.min(point.x + OFFSET, Math.max(4, w - el.offsetWidth - 4));
      const y = point.y + OFFSET + el.offsetHeight > h - 4 ? point.y - OFFSET - el.offsetHeight : point.y + OFFSET;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const show = (k, text, point) => {
      if (k === dismissed) return hide();
      el.textContent = text;
      el.hidden = false;
      place(point);
    };

    const label = (hits, point) => {
      if (!window.matchMedia?.(FINE_POINTER).matches) return hide();
      const f = hits[0];
      if (!f) {
        dismissed = null;
        return hide();
      }
      const p = f.properties;
      if (p.point_count) {
        const id = p.cluster_id;
        const k = `c${id}`;
        if (k !== dismissed) dismissed = null;
        const action = actions.get(id);
        show(k, hoverLabel(p, { listable: action === "list" }), point);
        const source = map.getSource("events");
        if (action == null && key !== k && source) {
          const count = p.point_count;
          const asked = generation;
          Promise.all([
            source.getClusterExpansionZoom(id).catch(() => NaN),
            count <= LIST_MAX ? source.getClusterLeaves(id, LIST_MAX, 0).catch(() => null) : null,
          ]).then(([expansionZoom, leaves]) => {
            if (asked !== generation) {
              if (key === k) key = null; // the next move asks again
              return;
            }
            const a = clusterClickAction({ count, expansionZoom, clusterMaxZoom, leaves });
            actions.set(id, a);
            if (key === k && !el.hidden) show(k, hoverLabel(p, { listable: a === "list" }), point);
          });
        }
        key = k;
        return;
      }
      const k = `p${p.id}`;
      if (k !== dismissed) dismissed = null;
      key = k;
      const stacked = stackItems(hits.filter((h) => !h.properties.point_count)).length;
      show(k, hoverLabel(p, { stacked }), point);
    };

    const onFrame = () => {
      const point = latest;
      frame = 0;
      latest = null;
      if (!point) return;
      if (!isIdle()) {
        onHover?.({ hits: [], point });
        return hide();
      }
      const all = map.queryRenderedFeatures(point, { layers: MARKER_LAYERS });
      onHover?.({ hits: all, point });
      label(
        all.filter((h) => h.layer.id !== "selected-point"),
        point
      );
    };
    const onMove = (e) => {
      latest = e.point;
      if (!frame) frame = requestAnimationFrame(onFrame);
    };
    const onLeave = () => {
      hideNow();
      dismissed = null;
      onHover?.({ hits: [], point: null });
    };
    const onKey = (e) => {
      if (e.key !== "Escape" || el.hidden) return;
      dismissed = key;
      hide();
    };
    const onData = (e) => {
      if (e.sourceId === "events" && e.sourceDataType !== "metadata") {
        actions.clear();
        generation++;
      }
    };

    map.on("mousemove", onMove);
    map.on("movestart", hideNow);
    // A click opens a list/popup or the article; the label would sit under it.
    map.on("click", hideNow);
    map.on("data", onData);
    const canvas = map.getCanvas();
    canvas.addEventListener("mouseleave", onLeave);
    window.addEventListener("keydown", onKey);
    return () => {
      map.off("mousemove", onMove);
      map.off("movestart", hideNow);
      map.off("click", hideNow);
      map.off("data", onData);
      canvas.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("keydown", onKey);
      hideNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);
}
