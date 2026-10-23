import { useEffect, useRef, useState } from "react";
import useMediaQuery from "../hooks/useMediaQuery";
import { PANEL_MIN, clampPanelWidth, maxPanelWidth, widthForKey } from "../lib/panelWidth.js";

/**
 * The side panel's left edge as a handle (the WAI-ARIA window splitter): drag it
 * to change the panel's width, or focus it and use the arrow keys (Left wider,
 * Right narrower; Shift or Page Up/Down for bigger steps, Home/End for the
 * limits). Double-click or Enter returns to the default width. Not on phones,
 * where the panel is a bottom sheet. The map follows by itself (MapLibre
 * watches its container's size).
 *
 * @param {object} props
 * @param {import("react").RefObject<HTMLElement>} props.panelRef  the panel it resizes
 * @param {string} props.panelId                    the panel's id (aria-controls)
 * @param {(w:number)=>void} props.onDrag           a new width while dragging
 * @param {(w:number)=>void} props.onCommit         the width a drag ended at, or a key set
 * @param {()=>void} props.onReset                  back to the default width
 */
export default function PanelResizer({ panelRef, panelId, onDrag, onCommit, onReset }) {
  const phone = useMediaQuery("(max-width: 768px)");
  // The panel's width as drawn (the CSS may hold it below the set width) and
  // the widest it may be, for the separator's value and the keys.
  const [size, setSize] = useState({ shown: null, max: null });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null); // {right: the panel's right edge, last: the last width sent}

  useEffect(() => {
    const el = panelRef.current;
    if (phone || !el) return undefined;
    const update = () =>
      setSize({ shown: Math.round(el.getBoundingClientRect().width), max: maxPanelWidth(window.innerWidth) });
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [panelRef, phone]);

  // While dragging, the resize cursor everywhere and no text selection.
  useEffect(() => {
    if (!dragging) return undefined;
    document.documentElement.classList.add("is-resizing-panel");
    return () => document.documentElement.classList.remove("is-resizing-panel");
  }, [dragging]);

  if (phone) return null;

  function onPointerDown(e) {
    if (e.button !== 0 || !panelRef.current) return;
    e.preventDefault();
    dragRef.current = { right: panelRef.current.getBoundingClientRect().right, last: null };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const w = clampPanelWidth(d.right - e.clientX, window.innerWidth);
    if (w === d.last) return;
    d.last = w;
    onDrag(w);
  }

  function endDrag() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragging(false);
    if (d.last !== null) onCommit(d.last);
  }

  function onKeyDown(e) {
    const current = size.shown ?? panelRef.current?.getBoundingClientRect().width;
    if (!current) return;
    const next = widthForKey(e.key, e.shiftKey, Math.round(current), window.innerWidth);
    if (next === null) return;
    e.preventDefault();
    if (next === "reset") onReset();
    else onCommit(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-controls={panelId}
      aria-label="Panel width"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={size.max ?? undefined}
      aria-valuenow={size.shown ?? undefined}
      aria-valuetext={size.shown ? `${size.shown} pixels` : undefined}
      tabIndex={0}
      title="Drag to resize the panel; double-click to reset"
      className={"sp-resizer" + (dragging ? " sp-resizer--dragging" : "")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <span className="sp-resizer-grip" aria-hidden="true" />
    </div>
  );
}
