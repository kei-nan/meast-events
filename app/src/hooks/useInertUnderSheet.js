import { useEffect } from "react";
import { sheetCover } from "../lib/mapInsets.js";

// What a keyboard can reach.
const FOCUSABLE = "a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex='-1'])";
// Set on the controls this hook made inert, so it only ever lifts its own.
const MARK = "data-under-sheet";

/**
 * True when a control at `box` (a DOMRect, page px) lies wholly under the
 * phone sheet, whose top is at `coverTop`: displayed (some size) and starting
 * at or below that line. A control the sheet covers only in part is left as it
 * is: it is still in sight. Pure.
 */
export function isUnderSheet(box, coverTop) {
  return box.width > 0 && box.height > 0 && box.top >= coverTop - 0.5;
}

/**
 * On phones the results sheet lies over the bottom of the map: as far as the
 * reader pulls it up, and with a large text size the map's own controls
 * ("Move map", the attribution's links) can end up wholly under it, still in
 * the tab order but out of sight (WCAG 2.4.11). Those controls are made
 * `inert` while the sheet covers them, measured where it comes to rest
 * (lib/mapInsets.js sheetCover), and given back when it moves off them; the
 * control that has focus is left alone. Measured again when the sheet moves,
 * the map's controls change, and the window resizes.
 *
 * @param {import("react").RefObject<HTMLElement>} containerRef  an element inside .map-view
 */
export default function useInertUnderSheet(containerRef) {
  useEffect(() => {
    const view = containerRef.current?.closest(".map-view");
    const area = view?.parentElement;
    if (!view || !area || typeof MutationObserver === "undefined") return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const coverTop = view.getBoundingClientRect().bottom - sheetCover(view);
      for (const el of view.querySelectorAll(FOCUSABLE)) {
        const ours = el.hasAttribute(MARK);
        if (el.inert && !ours) continue; // inert for some other reason
        if (el.contains(document.activeElement)) continue;
        const under = isUnderSheet(el.getBoundingClientRect(), coverTop);
        if (under && !ours) {
          el.inert = true;
          el.setAttribute(MARK, "");
        } else if (!under && ours) {
          el.inert = false;
          el.removeAttribute(MARK);
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // The sheet's resting height (data-sheet) and controls that come and go
    // (the pan pad, a popup, MapLibre's attribution) anywhere in the map area.
    const mo = new MutationObserver(schedule);
    mo.observe(area, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-sheet", "open"] });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef]);
}
