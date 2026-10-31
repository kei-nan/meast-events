// MapView's own sources and layers, added once on map load. Kept apart from
// mapLayers.js because that file is also imported by the eagerly loaded search
// panel and filter bar, while this one only ships with the lazy-loaded map.
import {
  APPROX_EDGE_PAINT,
  CATEGORY_COLOR_EXPRESSION,
  CLUSTER_COUNT_TEXT,
  CLUSTER_LABEL_PAINT,
  CLUSTER_PAINT,
  EMPTY_FC,
  HOLLOW_FILL,
  IS_APPROX,
  POINT_PAINT,
} from "./mapLayers";
import { BORDER_STYLE, DASHED_EXPR } from "./mapBorders";
import { LAND_ON_SEA, SEA_COLOR } from "../lib/mapBase";
import WATER from "../data/water.json";
import CITIES from "../data/cities.json";
import { LABEL_FONT_FAMILY } from "../lib/labelFont";

// Labels are drawn in the browser from the site's Inter at weight 600
// (lib/labelFont.js); MapView loads the font before adding these layers.
const LABEL_FONT = [LABEL_FONT_FAMILY];

// A country label's anchors (boundaries-label below): centred, or 1.9 em below
// or above when its state has at least `room` degrees of latitude both ways.
const labelMoveIf = (room) => [
  "case",
  [">=", ["get", "room"], room],
  ["literal", ["center", [0, 0], "top", [0, 1.9], "bottom", [0, -1.9]]],
  ["literal", ["center", [0, 0]]],
];

// Points stop clustering above this zoom; identical points then draw as one dot.
export const CLUSTER_MAX_ZOOM = 12;

// City names (scripts/build-cities.js): one layer per `minzoom`, each showing the name
// a city had in the year shown. A name's `from` is the first year it is shown, `to` the
// first year it is not; a missing one is open.
const CITY_TIERS = [...new Set(CITIES.features.map((f) => f.properties.minzoom))].sort((a, b) => a - b);
const cityLayerId = (minzoom) => `city-label-${minzoom}`;
const cityFilter = (minzoom, year) => [
  "all",
  ["==", ["get", "minzoom"], minzoom],
  ["<=", ["coalesce", ["get", "from"], 0], year],
  [">", ["coalesce", ["get", "to"], 9999], year],
];

/** Shows each city's name for `year` (MapLibre skips a filter equal to the current one). */
export function setCityYear(map, year) {
  for (const minzoom of CITY_TIERS) {
    if (map.getLayer(cityLayerId(minzoom))) map.setFilter(cityLayerId(minzoom), cityFilter(minzoom, year));
  }
}

/**
 * Adds every source and layer, bottom to top.
 * @param map         the MapLibre map (style loaded)
 * @param land        initial land FeatureCollection
 * @param boundaries  initial boundaries FeatureCollection (active for the year)
 * @param labels      initial boundary-labels FeatureCollection
 * @param events      initial events FeatureCollection
 * @param year        the year shown (city names)
 */
export function installLayers(map, { land, boundaries, labels, events, year }) {
  // Physical land/water silhouette for world context (Mediterranean, Black Sea, Red
  // Sea, Persian Gulf, Europe, Africa, etc). Sourced from Natural Earth land
  // polygons - pure physical geography with no political information at all, so it
  // can't introduce modern-border anachronisms. Added first, so it sits below our
  // own boundaries/events layers and reads as background context.
  map.addSource("land", {
    type: "geojson",
    data: land,
    // Cells swap in place (lib/landStore.js, GeoJSONSource.updateData), which needs
    // an id on every feature; the store sets them.
  });

  map.addLayer(
    {
      id: "land-fill",
      type: "fill",
      source: "land",
      // MapLoading draws the same land before MapLibre has loaded (lib/mapBase.js).
      // One opaque colour (lib/mapBase.js LAND_ON_SEA): the land is made of pieces cut
      // into cells, and a translucent fill would show a line where two pieces meet.
      paint: { "fill-color": LAND_ON_SEA, "fill-opacity": 1 },
    }
  );

  // The two lakes Natural Earth's land covers (the Dead Sea and the Sea of Galilee),
  // physical geography like the land (scripts/build-water.js): the sea's colour over
  // the land. MapLoading draws them the same way. Their names: "water-label-*" below.
  map.addSource("water", { type: "geojson", data: WATER });
  map.addLayer({
    id: "lake-fill",
    type: "fill",
    source: "water",
    filter: ["==", ["get", "kind"], "lake"],
    paint: { "fill-color": SEA_COLOR, "fill-opacity": 1 },
  });

  map.addSource("boundaries", {
    type: "geojson",
    data: boundaries,
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
      // status flag (mandate/occupation/annexation/dispute). See BORDER_STYLE
      // and isDashedStatus for the "...-included" exception.
      "line-color": ["case", DASHED_EXPR, BORDER_STYLE.flagged.color, BORDER_STYLE.solid.color],
      "line-width": ["case", DASHED_EXPR, BORDER_STYLE.flagged.width, BORDER_STYLE.solid.width],
      "line-dasharray": [
        "case",
        DASHED_EXPR,
        ["literal", BORDER_STYLE.flagged.dash],
        ["literal", [1, 0]],
      ],
    },
  });

  // Water names (scripts/build-water.js): over the border lines, under the search
  // area and the event markers. Every other label (states, cluster counts) sits higher,
  // so it is placed first (symbols are placed top layer down) and a water name that
  // would overlap it is not drawn. One layer per `minzoom`: seas, gulfs, straits.
  const tiers = [...new Set(WATER.features.map((f) => f.properties.minzoom).filter((z) => z != null))].sort((a, b) => a - b);
  for (const minzoom of tiers) {
    map.addLayer({
      id: `water-label-${minzoom}`,
      type: "symbol",
      source: "water",
      minzoom,
      filter: ["all", ["!=", ["get", "kind"], "lake"], ["==", ["get", "minzoom"], minzoom]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": LABEL_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 5, 12, 8, 14],
        "text-letter-spacing": 0.12,
        "text-max-width": 6,
        "text-padding": 2,
      },
      // #2e5a72 on the sea (lib/mapBase.js SEA_COLOR): 4.85:1, WCAG AA for text.
      paint: { "text-color": "#2e5a72", "text-halo-color": "rgba(214,232,241,0.8)", "text-halo-width": 1 },
    });
  }

  map.addSource("boundary-labels", {
    type: "geojson",
    data: labels,
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
    data: events,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    // Number of search matches inside each cluster (m is 1 for every
    // feature when no search is active, so nothing dims in that case).
    // `searching` (s is the same on every feature) tells the count label
    // whether to show matches or the plain total.
    clusterProperties: { matches: ["+", ["get", "m"]], searching: ["max", ["get", "s"]] },
    // The event id identifies each feature, so a timeline step can send the map
    // only the events that entered or left the range (updateData, see
    // lib/sourceDiff.js) instead of every feature.
    promoteId: "id",
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "events",
    filter: ["has", "point_count"],
    paint: CLUSTER_PAINT,
  });

  // The dark edge of an approximate location (mapLayers.js APPROX_EDGE_PAINT),
  // just under its ring: same source and filter, so it comes and goes with it.
  map.addLayer({
    id: "unclustered-point-edge",
    type: "circle",
    source: "events",
    filter: ["all", ["!", ["has", "point_count"]], IS_APPROX],
    paint: APPROX_EDGE_PAINT,
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: POINT_PAINT,
  });

  // City names: above the event markers, under the state names, as a state's name is
  // placed (so markers never hide a city's name). No mark of their own: the name sits
  // beside the city's point (below, above, then either side, wherever it fits first),
  // off a marker there; a cluster's number, placed first, pushes it aside rather than
  // hiding it. State names and cluster counts are placed before them, so a city name that
  // would overlap one is not drawn (it returns on zoom).
  map.addSource("cities", { type: "geojson", data: CITIES });
  for (const minzoom of CITY_TIERS) {
    map.addLayer({
      id: cityLayerId(minzoom),
      type: "symbol",
      source: "cities",
      minzoom,
      filter: cityFilter(minzoom, year),
      layout: {
        "text-field": ["get", "name"],
        "text-font": LABEL_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 8, 13],
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.8,
        "text-justify": "auto",
        "text-max-width": 8,
        "text-padding": 2,
      },
      // #3b3a36 on the land (lib/mapBase.js LAND_ON_SEA, ~#d5dbd7): ~9:1.
      paint: { "text-color": "#3b3a36", "text-halo-color": "rgba(244,241,234,0.85)", "text-halo-width": 1.2 },
    });
  }

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
      // Centred on the state when there is room. When a cluster's number sits
      // there (cluster-count below takes the spot first), the name tries 1.9 em
      // below or above its centre instead of being dropped: at the opening zoom
      // that used to hide Iran, Iraq, Saudi Arabia and Egypt. Collision keeps
      // the name off the cluster's number; it may still cross the edge of a
      // cluster circle (circles take no part in collision), drawn above it.
      // Only a state whose largest part reaches far enough above and below the
      // anchor (`room`, degrees, lib/boundaryLabels.js) may move, so a moved name
      // stays on its own state: the move plus the text is ~2.9x text-size px, and
      // a degree of latitude here is ~1.6 * 2^zoom px (512 px tiles, Mercator
      // at ~28N), so the room needed about halves with each zoom level. Each
      // step is the need at the low end of its band, for a small state's text
      // size. At the opening desktop zoom (~3.6) Israel (1.8), Jordan (2.1) and
      // up may move, not the UAE (1.3), Kuwait, Lebanon, Qatar, the West Bank
      // areas or the neutral zones; on a phone (~2.6) only Egypt and larger.
      "text-variable-anchor-offset": [
        "step",
        ["zoom"],
        labelMoveIf(3.8),
        3,
        labelMoveIf(2.2),
        3.5,
        labelMoveIf(1.65),
        4,
        labelMoveIf(1.25),
        4.5,
        labelMoveIf(0.9),
        5,
        labelMoveIf(0.7),
        6,
        labelMoveIf(0.4),
        7,
        labelMoveIf(0.2),
      ],
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

  // Cluster counts sit above the country labels, so they are placed first
  // (symbols are placed top layer down) and always drawn: a cluster on
  // "Syria" or "Kuwait" used to lose its number to the label. They still
  // take part in collision detection, so a country label that would sit
  // under a cluster's digits is dropped (it returns on zoom) instead of
  // being overprinted. A 0-match cluster has no text, so it blocks nothing.
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "events",
    filter: ["has", "point_count"],
    layout: {
      "text-field": CLUSTER_COUNT_TEXT,
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": false,
    },
    paint: CLUSTER_LABEL_PAINT,
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
  // A soft gold disc behind the selected dot, with no outer stroke: a dark outer
  // ring around the dot, white ring and gold disc read as a bullseye (project
  // rule: no target-like visuals).
  map.addLayer({
    id: "selected-halo",
    type: "circle",
    source: "selected",
    paint: {
      "circle-radius": 20,
      "circle-color": "rgba(255,210,90,0.35)",
    },
  });
  // Approximate locations stay hollow when selected, like their regular dot.
  // (No extra dark edge here either: one more ring would stack into a target.)
  map.addLayer({
    id: "selected-point",
    type: "circle",
    source: "selected",
    paint: {
      "circle-radius": 11,
      "circle-color": ["case", IS_APPROX, HOLLOW_FILL, CATEGORY_COLOR_EXPRESSION],
      "circle-stroke-width": 4,
      "circle-stroke-color": ["case", IS_APPROX, CATEGORY_COLOR_EXPRESSION, "#ffffff"],
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
}
