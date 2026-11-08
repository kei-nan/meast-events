import { useLayoutEffect } from "react";
import { claimClearance, clearancePx, measureStuck } from "../lib/stickyClear.js";

/**
 * While `active`, the panel's scroller (.sp-scroll) keeps the sticky bar in
 * `ref` clear of keyboard focus (lib/stickyClear.js). Measured, and again when
 * the bar resizes (it wraps to two lines on a narrow phone, or is hidden with
 * the list while an event is open) and when the window does (the bar's offset
 * and the scroller's padding differ on phones, SidePanel.css).
 */
export function useStickyClearance(ref, active = true) {
  useLayoutEffect(() => {
    const bar = ref.current;
    const scroller = bar?.closest(".sp-scroll");
    if (!active || !bar || !scroller) return undefined;
    const key = {};
    const update = () => claimClearance(scroller, key, clearancePx(measureStuck(bar, scroller)));
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      claimClearance(scroller, key, null);
    };
  }, [ref, active]);
}
