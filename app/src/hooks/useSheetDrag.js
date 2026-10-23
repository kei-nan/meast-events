import { useLayoutEffect, useRef, useState } from "react";
import { clampSheet, sheetDetents, snapSheet, stepSheet } from "../lib/sheetSnap.js";

// Below this much movement a press on the bar is a tap (it toggles), not a drag.
const DRAG_START_PX = 6;
// The peek bar's height before it has been measured.
const PEEK_FALLBACK_PX = 120;

/**
 * The phone results sheet's position: "peek" (the bar and search box), "half"
 * or "full" (lib/sheetSnap.js), and its bar as a handle. Drag the bar to any
 * height and let go: it rests at the nearest height, or a flick carries it to
 * the next one. A tap toggles peek and open; Arrow Up / Down step one height.
 * Only the bar drags, so scrolling the list or an article never moves the sheet.
 *
 * Returns {sheet, setSheet, dragHeight (px while dragging, else null), barProps
 * (spread on the bar's button)}.
 *
 * @param {"peek"|"half"|"full"} initial
 * @param {import("react").RefObject<HTMLElement>} sheetRef  the sheet (inside the map area, .app-body)
 */
export default function useSheetDrag(initial, sheetRef) {
  const [sheet, setSheet] = useState(initial);
  const [dragHeight, setDragHeight] = useState(null);
  const dragRef = useRef(null); // {y, h, last, lastT, v, moved}
  const peekRef = useRef(PEEK_FALLBACK_PX);
  const swallowClickRef = useRef(false);

  // The peek height is whatever the bar and search box take; measured whenever it shows.
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (sheet === "peek" && dragHeight === null && el?.offsetHeight) peekRef.current = el.offsetHeight;
  });

  const detents = () => {
    const area = sheetRef.current?.parentElement?.clientHeight ?? 0;
    return sheetDetents(area, peekRef.current);
  };

  function onPointerDown(e) {
    // A drag on a touch screen is often not followed by a click: a new press starts clean.
    swallowClickRef.current = false;
    if (e.button !== 0 || !sheetRef.current) return;
    const h = sheetRef.current.getBoundingClientRect().height;
    dragRef.current = { y: e.clientY, h, last: h, lastT: e.timeStamp, v: 0, moved: false, ds: detents() };
    // Captured from the press: a fast mouse leaves the 44px bar in its first
    // move, and its moves would then go to whatever is under it. (A touch stays
    // with its first element anyway.) A tap still ends in a click on the bar.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.y - e.clientY; // up = taller
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_START_PX) return;
      d.moved = true;
    }
    const h = clampSheet(d.h + dy, d.ds);
    const dt = e.timeStamp - d.lastT;
    // Velocity of the last moves (px/ms), smoothed so one jittery event does not decide a flick.
    if (dt > 0) d.v = 0.6 * ((h - d.last) / dt) + 0.4 * d.v;
    d.last = h;
    d.lastT = e.timeStamp;
    setDragHeight(h);
  }

  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    swallowClickRef.current = true; // the click that follows a drag is not a tap
    setSheet(snapSheet(d.last, d.v, d.ds));
    setDragHeight(null);
  }

  function onClick() {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      return;
    }
    setSheet(sheet === "peek" ? "full" : "peek");
  }

  function onKeyDown(e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    setSheet(stepSheet(sheet, e.key === "ArrowUp" ? 1 : -1, detents()));
  }

  return {
    sheet,
    setSheet,
    dragHeight,
    barProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClick,
      onKeyDown,
    },
  };
}
