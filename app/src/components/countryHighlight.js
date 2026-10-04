import { useEffect, useMemo, useRef } from "react";
import { countryHighlightFeatures, featuresBbox } from "../lib/eventCountries";
import { reducedMotion } from "../lib/reducedMotion";

// Map layer that shades the listed countries of an event without a precise
// location (lib/eventCountries.js decides which border shapes those are). The
// shapes are the borders already loaded for the displayed year, passed through
// untouched. Also fits the map to them when such an event is opened (a focus
// with `fitCountries`), falling back to the event's pin, if any, when none of
// its countries has a shape in that year.

const SOURCE = "country-highlight";
// Above the borders, below the search area, markers and country labels.
const BEFORE_LAYER = "area-fill";
const FIT_MAX_ZOOM = 6;

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

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map.getSource(SOURCE)) addLayers(map);
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
    const duration = reducedMotion() ? 0 : undefined;
    if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 40, maxZoom: FIT_MAX_ZOOM, ...(duration === 0 ? { duration } : {}) }
      );
    } else if (p.lon != null && p.lat != null) {
      const opts = { center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 5) };
      if (duration === 0) map.jumpTo(opts);
      else map.flyTo(opts);
    }
  }, [mapRef, mapReady, focus, year, features]);
}
