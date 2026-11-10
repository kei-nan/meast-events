import { useEffect, useRef, useState } from "react";
import { clampSheet, sheetDetents, snapSheet, stepSheet } from "../lib/sheetSnap.js";

// Below this much movement a press on the bar is a tap (it toggles), not a drag.
const DRAG_START_PX = 6;
// A finger held still this long before it lets go has stopped: no flick.
export const FLICK_IDLE_MS = 100;
// Space under the search box at peek (SidePanel.css, .side-panel[data-sheet="peek"] .sp-scroll).
const PEEK_PAD_PX = 10; // keep in sync with SidePanel.css

/**
 * The sheet's height at peek: its top border, the bar and, without an event
 * open, the search input (its label hides at peek), plus the space under it.
 * Measured from those parts, so it is right before the sheet has ever been at
 * peek (a link that opens an event at full height).
 */
function peekHeight(el) {
  const bar = el.querySelector(".sp-sheet-toggle")?.offsetHeight ?? 0;
  const input = el.querySelector(".sp-inputwrap")?.offsetHeight ?? 0; // 0 while hidden
  return el.clientTop + bar + input + PEEK_PAD_PX;
}

/**
 * The phone results sheet's position: "peek" (the bar and search box), "half"
 * or "full" (lib/sheetSnap.js), and its bar as a handle. Drag the bar to any
 * height and let go: it rests at the nearest height, or a flick carries it to
 * the next one. A tap toggles peek and open (`openTo`); Arrow Up / Down step one height.
 * Only the bar drags, so scrolling the list or an article never moves the sheet.
 *
 * With `history` (the list is showing: no event or place open, which have
 * entries of their own), the reader raising the sheet from its bar (a tap, a
 * drag, a key, or `moveSheet` from the search box) adds a history entry, so
 * the browser's Back lowers it again instead of leaving the site; Forward
 * raises it again. The entry has the same URL, marked {sheet: <height>} in
 * history.state (hooks/useUrlState.js carries the mark into the entries pushed
 * from it). Lowered in the app with nothing else changed, the entry is gone
 * back over, so a later Back does nothing unseen; otherwise it stays and the
 * next raise reuses it. Only while the bar is shown (phones): the desktop
 * panel has no sheet.
 *
 * Returns {sheet, setSheet, moveSheet (setSheet as the reader's own move, with
 * the history above), dragHeight (px while dragging, else null), barProps
 * (spread on the bar's button)}.
 *
 * @param {"peek"|"half"|"full"} initial
 * @param {import("react").RefObject<HTMLElement>} sheetRef  the sheet (inside the map area, .app-body)
 * @param {"half"|"full"} [openTo]  where a tap on the lowered bar opens it
 * @param {{history?: boolean}} [opts]
 */
export default function useSheetDrag(initial, sheetRef, openTo = "full", { history = false } = {}) {
  const [sheet, setSheet] = useState(initial);
  const [dragHeight, setDragHeight] = useState(null);
  const dragRef = useRef(null); // {y, h, last, lastT, v, moved}
  const swallowClickRef = useRef(false);
  // The URL of the entry that stands for the raised sheet, while it is raised.
  const sheetEntryRef = useRef(null);
  const sheetNowRef = useRef(sheet); // for popstate
  useEffect(() => {
    sheetNowRef.current = sheet;
  });

  const barShown = () => Boolean(sheetRef.current?.querySelector(".sp-sheet-toggle")?.getClientRects?.().length);
  const hereUrl = () => window.location.href;

  // The reader moved the sheet: its history (above), then the move.
  function moveSheet(next) {
    const was = sheet;
    setSheet(next);
    if (typeof window === "undefined" || !barShown()) return;
    const h = window.history;
    if (was === "peek" && next !== "peek") {
      if (!history) return;
      // This entry already stands for the raised sheet (lowered in the app since): reused.
      if (!h.state?.sheet) h.pushState({ sheet: next }, "", hereUrl());
      sheetEntryRef.current = hereUrl();
    } else if (was !== "peek" && next === "peek" && sheetEntryRef.current) {
      const at = sheetEntryRef.current;
      sheetEntryRef.current = null;
      if (h.state?.sheet && hereUrl() === at) h.back();
    }
  }

  // Back onto an entry from before the raise lowers the sheet; Forward onto its
  // entry raises it again (the entry's mark says how far).
  useEffect(() => {
    // No window (node tests), or a render test's stand-in without events.
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
    const onPop = () => {
      if (!barShown()) return;
      const mark = window.history.state?.sheet;
      const now = sheetNowRef.current;
      if (mark && now === "peek") {
        sheetEntryRef.current = hereUrl();
        setSheet(mark);
      } else if (!mark && now !== "peek" && sheetEntryRef.current) {
        sheetEntryRef.current = null;
        setSheet("peek");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detents = () => {
    const el = sheetRef.current;
    return sheetDetents(el?.parentElement?.clientHeight ?? 0, el ? peekHeight(el) : 0);
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

  function endDrag(e) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    swallowClickRef.current = true; // the click that follows a drag is not a tap
    // The velocity is that of the last moves: after a pause it is stale, and
    // a fast drag that stopped before letting go rests at the nearest height.
    const v = e.timeStamp - d.lastT > FLICK_IDLE_MS ? 0 : d.v;
    moveSheet(snapSheet(d.last, v, d.ds));
    setDragHeight(null);
  }

  function onClick() {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      return;
    }
    moveSheet(sheet === "peek" ? openTo : "peek");
  }

  function onKeyDown(e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    moveSheet(stepSheet(sheet, e.key === "ArrowUp" ? 1 : -1, detents()));
  }

  return {
    sheet,
    setSheet,
    moveSheet,
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
