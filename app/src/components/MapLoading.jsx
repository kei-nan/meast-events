import { useLayoutEffect, useRef } from "react";
import { loadLand } from "../lib/dataClient";
import { LAND_COLOR, LAND_OPACITY, SEA_COLOR, defaultCamera, mercatorX, mercatorY } from "../lib/mapBase";

// Stands in for the map while MapLibre downloads and starts (~1.5 MB of
// script, its worker included): the sea, and the land as soon as land.json
// has arrived (App.jsx starts it at first paint), drawn with a 2D canvas in
// the map's own projection, view and colours (lib/mapBase.js), so the map can
// take over without anything moving. App.jsx shows it until the map's code
// has loaded; MapView keeps it over its canvas until that has drawn the land.

// The land colour over the sea, as one opaque colour: MapLibre blends one layer
// at LAND_OPACITY, while separate canvas fills would darken where polygons touch.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const LAND_ON_SEA = (() => {
  const land = rgb(LAND_COLOR);
  const sea = rgb(SEA_COLOR);
  const mixed = land.map((c, i) => Math.round(c * LAND_OPACITY + sea[i] * (1 - LAND_OPACITY)));
  return `rgb(${mixed.join(",")})`;
})();

// land.json once it has loaded, so a remounted stand-in (App's, then MapView's)
// draws in its first frame instead of a frame later.
let landCache = null;
// The last canvas drawn: MapView's stand-in copies App's (same box) instead of
// projecting every coastline again while the map's code is starting up.
let lastDrawn = null;

function draw(canvas, land) {
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const previous = lastDrawn;
  lastDrawn = canvas;
  if (previous && previous !== canvas && previous.width === canvas.width && previous.height === canvas.height) {
    ctx.drawImage(previous, 0, 0);
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { worldSize, x0, y0 } = defaultCamera(width, height);
  ctx.fillStyle = LAND_ON_SEA;
  for (const feature of land.features) {
    const { type, coordinates } = feature.geometry ?? {};
    const polygons = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : [];
    for (const rings of polygons) {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([lon, lat], i) => {
          const x = mercatorX(lon) * worldSize - x0;
          const y = mercatorY(lat) * worldSize - y0;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill("evenodd"); // holes (lakes) stay sea
    }
  }
}

/**
 * @param cover  true: drawn over MapView's canvas (MapView announces loading
 *               itself, so no status text); false: App's stand-in for the map.
 */
export default function MapLoading({ cover = false }) {
  const canvasRef = useRef(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;
    let drawnSize = "";
    const redraw = () => {
      const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (!landCache || size === drawnSize) return; // the observer's first call repeats the first draw
      drawnSize = size;
      draw(canvas, landCache);
    };
    if (landCache) redraw();
    else
      loadLand()
        .then((land) => {
          landCache = land;
          if (!cancelled) redraw();
        })
        .catch(() => {}); // the map shows its own error and retries
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => {
      cancelled = true;
      ro.disconnect();
      if (cover) lastDrawn = null; // the map has drawn: free the bitmap
    };
  }, [cover]);

  return (
    <div
      className={cover ? "map-placeholder map-cover" : "map-view map-placeholder"}
      aria-busy={cover ? undefined : "true"}
      aria-hidden={cover ? "true" : undefined}
    >
      <canvas ref={canvasRef} className="map-placeholder-land" />
      {!cover && (
        <span className="map-placeholder-status app-loading" role="status">
          <span className="app-loading-spinner" aria-hidden="true" />
          Loading map…
        </span>
      )}
    </div>
  );
}
