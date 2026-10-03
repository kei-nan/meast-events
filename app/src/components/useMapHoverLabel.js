import { useEffect } from "react";
import { LIST_MAX, clusterClickAction, hoverLabel, stackItems } from "../lib/mapStack";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const OFFSET = 14; // px from the cursor

// Desktop hover label for event dots ("Title (year)") and clusters ("N events -
// click to zoom in / list them"). Imperative DOM updates on a ref'd element, so
// mousemove never re-renders React. Touch devices never see it (no hover); the
// label is aria-hidden because the same information is one click away.
export default function useMapHoverLabel({ mapRef, mapReady, labelRef, isIdle, clusterMaxZoom }) {
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const el = labelRef.current;
    if (!map || !el) return;
    // cluster_id -> "zoom" | "list" (what a click does, decided as in MapView);
    // cluster ids change whenever the data does.
    const actions = new Map();
    let key = null;

    const hide = () => {
      key = null;
      el.hidden = true;
    };
    const place = (point) => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const x = Math.min(point.x + OFFSET, Math.max(4, w - el.offsetWidth - 4));
      const y = point.y + OFFSET + el.offsetHeight > h - 4 ? point.y - OFFSET - el.offsetHeight : point.y + OFFSET;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const show = (text, point) => {
      el.textContent = text;
      el.hidden = false;
      place(point);
    };

    const onMove = (e) => {
      if (!window.matchMedia?.(FINE_POINTER).matches || !isIdle()) return hide();
      const hits = map.queryRenderedFeatures(e.point, { layers: ["clusters", "unclustered-point"] });
      const f = hits[0];
      if (!f) return hide();
      const p = f.properties;
      if (p.point_count) {
        const id = p.cluster_id;
        const k = `c${id}`;
        const action = actions.get(id);
        show(hoverLabel(p, { listable: action === "list" }), e.point);
        const source = map.getSource("events");
        if (action == null && key !== k && source) {
          const count = p.point_count;
          Promise.all([
            source.getClusterExpansionZoom(id).catch(() => NaN),
            count <= LIST_MAX ? source.getClusterLeaves(id, LIST_MAX, 0).catch(() => null) : null,
          ]).then(([expansionZoom, leaves]) => {
            const a = clusterClickAction({ count, expansionZoom, clusterMaxZoom, leaves });
            actions.set(id, a);
            if (key === k && !el.hidden) show(hoverLabel(p, { listable: a === "list" }), e.point);
          });
        }
        key = k;
        return;
      }
      key = `p${p.id}`;
      const stacked = stackItems(hits.filter((h) => !h.properties.point_count)).length;
      show(hoverLabel(p, { stacked }), e.point);
    };
    const onData = (e) => {
      if (e.sourceId === "events" && e.sourceDataType !== "metadata") actions.clear();
    };

    map.on("mousemove", onMove);
    map.on("movestart", hide);
    // A click opens a list/popup or the article; the label would sit under it.
    map.on("click", hide);
    map.on("data", onData);
    const canvas = map.getCanvas();
    canvas.addEventListener("mouseleave", hide);
    return () => {
      map.off("mousemove", onMove);
      map.off("movestart", hide);
      map.off("click", hide);
      map.off("data", onData);
      canvas.removeEventListener("mouseleave", hide);
      hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);
}
