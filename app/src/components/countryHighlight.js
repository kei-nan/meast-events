import { useEffect, useMemo, useRef } from "react";
import { countryHighlightFeatures, featuresBbox } from "../lib/eventCountries";
import { reducedMotion } from "../lib/reducedMotion";
import { growPadding, keepPinInside, mapClearView } from "../lib/mapInsets";

// Map layer that shades the listed countries of an event without a precise
// location (lib/eventCountries.js decides which border shapes those are). The
// shapes are the borders already loaded for the displayed year, passed through
// untouched. Also fits the map to them when such an event is opened (a focus
// with `fitCountries`), falling back to the event's pin, if any, when none of
// its countries has a shape in that year. Either way the pin ends up in the
// part of the map no control or panel covers.

const SOURCE = "country-highlight";
// Above the borders, below the search area, markers and country labels.
const BEFORE_LAYER = "area-fill";
const FIT_MAX_ZOOM = 6;
// Air around the fitted countries, px.
const FIT_PADDING = 40;
// The clear part must leave at least this much, past FIT_PADDING, to fit into.
const MIN_FIT_PX = 80;
// How many zoom levels further out than a whole-map fit a fit into the clear
// part may be before the whole map's zoom is used instead.
const FIT_ZOOM_SLACK = 1;

function addLayers(map) {
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const before = map.getLayer(BEFORE_LAYER) ? BEFORE_LAYER : undefined;
  map.addLayer(
    { id: "country-highlight-fill", type: "fill", source: SOURCE, paint: { "fill-color": "#e39a2d", "fill-opacity": 0.3 } },
    before
  );
  map.addLayer(
    {
      id: "country-highlight-line",
      type: "line",
      source: SOURCE,
      paint: { "line-color": "#9a5a12", "line-width": 2.5 },
    },
    before
  );
}

/**
 * @param mapRef    ref to the MapLibre map
 * @param mapReady  true once the map's own layers exist
 * @param event     event whose countries to shade (null = none)
 * @param year      displayed border year
 * @param features  the loaded boundary decade covering `year` (null while loading)
 * @param focus     App's focus request ({id, lon?, lat?, countries, fitCountries, nonce})
 */
export default function useCountryHighlight({ mapRef, mapReady, event, year, features, focus }) {
  const shaded = useMemo(() => countryHighlightFeatures(event, year, features), [event, year, features]);

  // `shaded` is rebuilt on every year step, but its features are the loaded
  // border objects themselves: when they are the same ones (most steps, and
  // always when nothing is shaded) the source is left alone, since every
  // setData makes MapLibre reload it.
  const sentRef = useRef(null);
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map.getSource(SOURCE)) addLayers(map);
    const prev = sentRef.current;
    const next = shaded.features;
    if (prev && prev.length === next.length && next.every((f, i) => f === prev[i])) return;
    sentRef.current = next;
    map.getSource(SOURCE).setData(shaded);
  }, [mapRef, mapReady, shaded]);

  // A fit waits until the borders of the displayed year are loaded.
  const pendingRef = useRef(null);
  useEffect(() => {
    pendingRef.current = focus?.fitCountries ? focus : null;
  }, [focus]);
  useEffect(() => {
    const p = pendingRef.current;
    if (!mapReady || !p || !features) return;
    pendingRef.current = null;
    const map = mapRef.current;
    const bbox = featuresBbox(countryHighlightFeatures({ countries: p.countries }, year, features));
    // Fit the countries into the part of the map that the controls (and, on
    // phones, the sheet) leave in sight (lib/mapInsets.js), and always keep the
    // event's pin there.
    const { width, height, padding, offset } = mapClearView(map);
    const pin = p.lon != null && p.lat != null ? [p.lon, p.lat] : null;
    // easeTo with no duration, not jumpTo, which has no `offset`.
    const move = (opts) => (reducedMotion() ? map.easeTo({ ...opts, duration: 0 }) : map.flyTo(opts));
    const toPin = (cam) => ({ ...cam, center: pin ? keepPinInside(pin, cam, width, height, padding) : cam.center });
    if (bbox) {
      const bounds = [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ];
      const asArray = (cam) => cam && { center: [cam.center.lng, cam.center.lat], zoom: cam.zoom };
      // The zoom that fits the countries in the whole map.
      const whole = asArray(map.cameraForBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM }));
      // Fitted into the clear part instead, unless that part is too small for
      // it (a phone's strip above the sheet, ~60-120 px tall, fits a few
      // countries only at a zoom out past the map's extent): then their middle
      // goes in the middle of the clear part at the whole map's zoom, the rest
      // reaching under the sheet.
      const clearW = width - padding.left - padding.right - 2 * FIT_PADDING;
      const clearH = height - padding.top - padding.bottom - 2 * FIT_PADDING;
      const fit =
        clearW >= MIN_FIT_PX && clearH >= MIN_FIT_PX
          ? asArray(map.cameraForBounds(bounds, { padding: growPadding(padding, FIT_PADDING), maxZoom: FIT_MAX_ZOOM }))
          : null;
      if (fit && (!whole || fit.zoom >= whole.zoom - FIT_ZOOM_SLACK)) {
        move(toPin({ ...fit, offset: [0, 0] }));
        return;
      }
      if (whole) {
        move(toPin({ ...whole, offset }));
        return;
      }
    }
    if (pin) move({ center: pin, zoom: Math.max(map.getZoom(), 5), offset });
  }, [mapRef, mapReady, focus, year, features]);
}
