import { useEffect, useState } from "react";

// Delays reflecting `value` until it's stopped changing for `delayMs`. Used to
// stop dragging the timeline's range slider from firing a fetch per intermediate
// value - only the value it settles on (however briefly) triggers a request.
export default function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
