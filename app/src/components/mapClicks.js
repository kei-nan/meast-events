// Clicks and taps on the map (MapView's load handler): a cluster zooms in (or lists its events
// when no zoom can split it), a dot opens its event (or lists the events drawn on one spot),
// and a border opens its details. Plain MapLibre code; React state comes in through `ctx`.
import { EMPTY_FC } from "./mapLayers";
import { CLUSTER_MAX_ZOOM } from "./mapInstallLayers";
import { foldIncluded, uniqueBoundaries } from "./mapBorders";
import { LIST_MAX, allSameCoordinates, clusterClickAction, stackItems } from "../lib/mapStack";
import { decadeFloor } from "../lib/dataClient";
import { isPlaceholder, placeholderMembers } from "../lib/deferredBoundaries";
import { reducedMotion } from "../lib/reducedMotion";
import { TAP_SLOP_PX, pickMarker } from "../lib/tapTarget";

const clusterRadius = (count) => (count >= 15 ? 24 : count >= 5 ? 18 : 14);
// A ring `extra` px outside a cluster or dot (the hover ring, the cluster's click flash).
export const ringFor = (f, extra) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { r: (f.properties.point_count ? clusterRadius(f.properties.point_count) : 6) + extra },
      geometry: f.geometry,
    },
  ],
});

/**
 * @param {import("maplibre-gl").Map} map
 * @param {object} ctx
 * @param {() => boolean} ctx.isCancelled     MapView has unmounted
 * @param {() => boolean} ctx.clickable       not drawing an area, and not the release of a drag
 * @param {{current: object}} ctx.propsRef    MapView's latest props (onSelectEvent)
 * @param {{current: Map}} ctx.boundaryCacheRef  decade -> border features (hooks/useBoundaryDecades.js)
 * @param {{current: number}} ctx.yearRef
 * @param {Function} ctx.setStackList         the list of events at one spot ({point, items, total, oneSpot} | null)
 * @param {Function} ctx.setBorderPopup       a border's details ({point, lngLat, items, hint} | null)
 * @param {{current: Element|null}} ctx.stackOpenerRef  what had focus when the list opened
 * @param {{current: Element|null}} ctx.popupOpenerRef  the same for the border details
 */
export function installMapClicks(map, ctx) {
  const { isCancelled, clickable, propsRef, boundaryCacheRef, yearRef, setStackList, setBorderPopup, stackOpenerRef, popupOpenerRef } = ctx;

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
    const leaves = count <= LIST_MAX ? await source.getClusterLeaves(clusterId, LIST_MAX, 0).catch(() => null) : null;
    if (isCancelled() || asked !== eventsGeneration) return;
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
    // Escape or × puts focus back where it was (closePopup), as for the list.
    const active = document.activeElement;
    popupOpenerRef.current = active && active !== document.body ? active : null;
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
}
