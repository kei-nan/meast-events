import { useCallback, useEffect, useState } from "react";
import { loadLand } from "../lib/dataClient";
import { isFastConnection } from "../lib/landStore";
import { mapUnavailableAfter } from "../lib/mapUnavailable.js";

// What the map needs before its chunk arrives (land.json, for the land
// MapLoading draws; the map chunk itself is lazy-loaded) starts downloading
// right after the FIRST PAINT. Not before it: on a slow connection these
// downloads would share bandwidth with index.js and delay the header, panel and
// timeline (Lighthouse measured LCP 4.1 s -> 5.6 s with land and the borders
// decade preloaded from index.html). The data loaders cache their requests, so
// MapView reuses this one.
function startMapDownloads() {
  // The borders decade is not fetched ahead either: MapView requests it at
  // mount. Fetched here (~95 KB: the decade file and the shared geometries it
  // needs) it competed with the MapView chunk, and the first-visit map tip in
  // that chunk is the phone's LCP: measured (2026-10, slow 4G 1.6 Mbps/150 ms,
  // 4x CPU, median of 7) LCP 4.33 -> 3.85 s without it, with the map showing
  // its borders no later and desktop unchanged.
  //
  // MapLibre's worker (self-contained since 6.13.0) is not preloaded: Chromium
  // ignores <link rel=preload as=worker>, and modulepreload would parse it on
  // the main thread. It downloads when the map starts it. A fetch() from here
  // would fill the HTTP cache for the Worker (Chromium reuses it), but measured
  // (2026-10) it took bandwidth from the panel's content on a slow phone
  // connection (LCP 4.5 -> 5.2 s) to save ~0.25 s of map wait on desktop, and
  // re-measured alongside the map chunk it delayed that chunk (LCP +0.73 s).
  // The land MapLoading draws from land.json covers that wait instead.
  loadLand().catch(() => {}); // MapView retries
}

// Calls fn once the browser reports the First Contentful Paint. "The next frame"
// is not enough: while a web font loads, frames paint no text. Falls back to a
// timer where paint timing is unsupported or never reported (e.g. a background
// tab). Returns a cancel function.
function afterFirstContentfulPaint(fn, fallbackMs = 3000) {
  let done = false;
  let observer = null;
  let timer;
  const run = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
    fn();
  };
  if (window.PerformanceObserver?.supportedEntryTypes?.includes("paint")) {
    observer = new PerformanceObserver((list) => {
      if (list.getEntriesByName("first-contentful-paint").length) setTimeout(run);
    });
    observer.observe({ type: "paint", buffered: true });
  } else {
    fallbackMs = 0;
  }
  timer = setTimeout(run, fallbackMs);
  return () => {
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
  };
}

/**
 * When the map mounts (App.jsx), and whether it is unavailable.
 *
 * The map mounts (and its downloads start) after the first paint; see
 * startMapDownloads. On a link known to be fast (lib/landStore.js
 * isFastConnection) it starts at once instead of waiting for the First
 * Contentful Paint (~0.2 s on desktop): measured (2026-10, local HTTP/2
 * server, cold cache) the map completes ~0.09 s sooner on desktop (median of
 * 5), and on a phone on a fast link (10 Mbps/50 ms, 3x CPU, median of 7) LCP
 * 1.10 -> 1.00 s, with the first paint unchanged in both.
 *
 * No map (its code failed to load, or no WebGL 2): the panel's controls that
 * act on it are disabled until a map reports "ready" (lib/mapUnavailable.js).
 *
 * @returns {{mapStarted: boolean, mapUnavailable: boolean, handleMapStatus: (status: string) => void}}
 */
export default function useMapStart() {
  const [mapStarted, setMapStarted] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const handleMapStatus = useCallback((status) => setMapUnavailable(mapUnavailableAfter(status)), []);
  useEffect(() => {
    const start = () => {
      startMapDownloads();
      setMapStarted(true);
    };
    if (!isFastConnection(navigator.connection)) return afterFirstContentfulPaint(start);
    start();
    return undefined;
  }, []);
  return { mapStarted, mapUnavailable, handleMapStatus };
}
