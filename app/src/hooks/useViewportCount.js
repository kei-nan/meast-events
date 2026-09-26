import { useEffect, useState } from "react";
import { fetchEvents } from "../lib/dataClient";

function inBounds(e, [w, s, east, n]) {
  return e.coordinates && e.coordinates.lon >= w && e.coordinates.lon <= east &&
    e.coordinates.lat >= s && e.coordinates.lat <= n;
}

// Count of events in the map's current viewport and year range. Live mode asks
// the server (bbox query - something static files can't answer); otherwise it
// is counted client-side from `rangeEvents`.
export default function useViewportCount({ bbox, startYear, endYear, live, rangeEvents, onOutage }) {
  const [liveCount, setLiveCount] = useState(null);

  useEffect(() => {
    if (!live || !bbox) return;
    let cancelled = false;
    fetchEvents({ start: startYear, end: endYear, bbox })
      .then(({ total }) => {
        if (!cancelled) setLiveCount(total);
      })
      .catch((err) => {
        if (err.outage) onOutage();
      });
    return () => {
      cancelled = true;
    };
  }, [live, bbox, startYear, endYear, onOutage]);

  if (!bbox) return null;
  return live ? liveCount : rangeEvents.filter((e) => inBounds(e, bbox)).length;
}
