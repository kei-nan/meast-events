import { useEffect, useState } from "react";
import { fetchEvents } from "../lib/dataClient";
import useDebouncedValue from "./useDebouncedValue";

const BBOX_SETTLE_MS = 400;

function inBounds(e, [w, s, east, n]) {
  return e.coordinates && e.coordinates.lon >= w && e.coordinates.lon <= east &&
    e.coordinates.lat >= s && e.coordinates.lat <= n;
}

// Count of events in the map's current viewport and year range (events without
// coordinates never count: they are not on the map). Live mode asks the server
// (bbox query - something static files can't answer); otherwise it is counted
// client-side from `rangeEvents`. The bbox is debounced so the map settling
// after load / a pan issues one request, not one per intermediate view.
export default function useViewportCount({ bbox, startYear, endYear, live, rangeEvents, onOutage }) {
  const [liveCount, setLiveCount] = useState(null);
  // A new array is created per render upstream; key on its contents.
  const bboxKey = bbox ? bbox.join(",") : "";
  const settledKey = useDebouncedValue(bboxKey, BBOX_SETTLE_MS);

  useEffect(() => {
    if (!live || !settledKey) return;
    let cancelled = false;
    const settled = settledKey.split(",").map(Number);
    fetchEvents({ start: startYear, end: endYear, bbox: settled, limit: 1, fields: "lite" })
      .then(({ total }) => {
        if (!cancelled) setLiveCount(total);
      })
      .catch((err) => {
        if (err.outage) onOutage();
      });
    return () => {
      cancelled = true;
    };
  }, [live, settledKey, startYear, endYear, onOutage]);

  if (!bbox) return null;
  return live ? liveCount : rangeEvents.filter((e) => inBounds(e, bbox)).length;
}
