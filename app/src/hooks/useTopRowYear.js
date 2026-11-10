import { useEffect, useState } from "react";

// The first row whose bottom is below `line` (rows top to bottom, so their
// rects are in order: a binary search, one rect read per step).
function firstRowBelow(rows, line) {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].getBoundingClientRect().bottom > line + 1) hi = mid;
    else lo = mid + 1;
  }
  return rows[lo] ?? null;
}

/**
 * The year of the row at the top of the Timeline list (ResultsList), just under
 * its sticky axis, as the panel (.sp-scroll) scrolls: the axis marks it. Null
 * while there is none (or `active` is false).
 *
 * Measured when the list scrolls, when the window resizes, and when the list
 * itself changes size: a list that mounts hidden (an event open over it, as on
 * /event/<id>?view=timeline) has no size to measure until it is shown, and
 * showing it fires no scroll event (Back to the list), so without the last the
 * axis would have no mark until the reader scrolled.
 *
 * @param {import("react").RefObject<HTMLElement>} listRef  the list (its rows are button.sp-row with data-year)
 * @param {import("react").RefObject<HTMLElement>} axisRef  the sticky axis
 * @param {boolean} active  the Timeline view is shown
 * @param {number} shown  rows rendered (re-measured when it changes)
 * @param {unknown} rowYears  the rows' years (likewise)
 */
export default function useTopRowYear(listRef, axisRef, active, shown, rowYears) {
  const [topYear, setTopYear] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    const list = listRef.current;
    const scroller = list?.closest(".sp-scroll");
    if (!scroller) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = axisRef.current?.getBoundingClientRect().bottom ?? scroller.getBoundingClientRect().top;
      const row = firstRowBelow(list.querySelectorAll("button.sp-row"), line);
      setTopYear(row?.dataset.year ? Number(row.dataset.year) : null);
    };
    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onChange);
    ro?.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      scroller.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [listRef, axisRef, active, shown, rowYears]);
  return topYear;
}
