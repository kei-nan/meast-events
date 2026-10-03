import { useEffect, useState } from "react";

// True while a CSS media query matches; re-renders when that changes (rotation,
// window resize). Used by the map to compact its controls on phones.
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => !!window.matchMedia?.(query).matches);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}
