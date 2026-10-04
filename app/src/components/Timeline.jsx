import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";
import { playRestart, playStep } from "../lib/playback";
import { checkTypedYear, handleForDirection, keyTarget, moveHandle, pickHandle } from "../lib/rangeSlider";
import "../Timeline.css";

const PLAY_INTERVAL_MS = 350;
// Pixels a press on overlapping thumbs must move before its direction picks one.
const DIRECTION_SLOP_PX = 3;

// Labelled year ranges only; the names carry no claims beyond the years shown.
// Where a name could be contested the label is just the years. The slider's
// own ends need no preset.
const PRESETS = [
  { label: "WWI 1914–18", start: 1914, end: 1918 },
  { label: "1948–49", start: 1948, end: 1949 },
  { label: "1956", start: 1956, end: 1956 },
  { label: "1967", start: 1967, end: 1967 },
  { label: "1973", start: 1973, end: 1973 },
  { label: "1979", start: 1979, end: 1979 },
  { label: "1980–88", start: 1980, end: 1988 },
  { label: "1990–91", start: 1990, end: 1991 },
  { label: "2003", start: 2003, end: 2003 },
  { label: "2011", start: 2011, end: 2011 },
  { label: "All years", start: MIN_YEAR, end: MAX_YEAR },
];

const frac = (y) => (y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);

// Ids stay "accumulate"/"slide" (lib/playback.js); the labels say what Play does
// in plain words, and the help is visible to screen readers too, not only as a
// tooltip that phones never show.
const PLAY_MODES = [
  { id: "accumulate", label: "Grow", help: "Play keeps the start year and advances the end year." },
  { id: "slide", label: "Move", help: "Play moves the whole period forward, keeping its length." },
];

const HANDLE_NAME = { start: "Start year", end: "End year" };

export default function Timeline({ startYear, endYear, onChangeRange, eventCountsByYear, eventYear = null }) {
  const maxCount = Math.max(1, ...Object.values(eventCountsByYear));
  const [playing, setPlaying] = useState(false);
  const [playMode, setPlayMode] = useState("accumulate");
  const [active, setActive] = useState(null); // "start" | "end" while dragged/focused
  const [editing, setEditing] = useState(false);
  const latest = useRef({ startYear, endYear, onChangeRange });
  useEffect(() => {
    latest.current = { startYear, endYear, onChangeRange };
  });
  const rangeRef = useRef(null);
  const handleRefs = { start: useRef(null), end: useRef(null) };
  const drag = useRef(null);
  const yearBtnRef = useRef(null);

  // Back to the years button once the editor is gone (on phones the button is
  // hidden while editing, so it can take focus only after the re-render).
  function closeEditor() {
    setEditing(false);
    setTimeout(() => yearBtnRef.current?.focus(), 0);
  }

  // Play advances one year per step (see playStep) and stops at MAX_YEAR.
  useEffect(() => {
    if (!playing || endYear >= MAX_YEAR) return undefined;
    const id = setTimeout(() => {
      const cur = latest.current;
      const next = playStep(cur.startYear, cur.endYear, playMode);
      if (!next) {
        setPlaying(false);
        return;
      }
      cur.onChangeRange(next[0], next[1]);
      if (next[1] >= MAX_YEAR) setPlaying(false);
    }, PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, endYear, playMode]);

  function setHandle(handle, year) {
    const cur = latest.current;
    const [s, e] = moveHandle(handle, year, cur.startYear, cur.endYear);
    if (s !== cur.startYear || e !== cur.endYear) cur.onChangeRange(s, e);
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (endYear >= MAX_YEAR) onChangeRange(...playRestart(startYear, endYear, playMode));
    setPlaying(true);
  }

  function applyPreset(p) {
    setPlaying(false);
    onChangeRange(p.start, p.end);
  }

  // The strip is one pointer target for both handles, so it decides which
  // handle a press moves (lib/rangeSlider.js pickHandle): the thumb under the
  // pointer, or the nearest one for a press on the bars. Where the two thumbs
  // overlap, the first move decides (left start, right end), so a single year
  // or a short range can be widened either way and a drag never collapses it.
  function geometry() {
    const rect = rangeRef.current.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(rangeRef.current).getPropertyValue("--tl-thumb")) || 28;
    const pxPerYear = Math.max(1e-6, rect.width - thumb) / (MAX_YEAR - MIN_YEAR);
    return { left: rect.left + thumb / 2, pxPerYear, slop: thumb / 2 / pxPerYear };
  }

  const posAt = (g, clientX) => MIN_YEAR + (clientX - g.left) / g.pxPerYear;

  function grab(d, handle, pos) {
    const cur = latest.current;
    d.handle = handle;
    d.offset = pos - (handle === "start" ? cur.startYear : cur.endYear);
    handleRefs[handle].current?.focus({ preventScroll: true });
    setActive(handle);
  }

  function handlePointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault(); // no text selection or touch scrolling while dragging
    setPlaying(false);
    const g = geometry();
    const pos = posAt(g, e.clientX);
    const cur = latest.current;
    const handle = pickHandle(cur.startYear, cur.endYear, pos, g.slop);
    const d = { id: e.pointerId, g, x0: e.clientX, pos0: pos, handle: null, offset: 0 };
    drag.current = d;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!handle) return;
    const value = handle === "start" ? cur.startYear : cur.endYear;
    if (Math.abs(pos - value) <= g.slop) {
      grab(d, handle, pos); // on the thumb: it follows the pointer without jumping
    } else {
      setHandle(handle, pos); // on the bars: the nearest handle jumps there
      grab(d, handle, Math.round(Math.min(MAX_YEAR, Math.max(MIN_YEAR, pos))));
      d.offset = 0;
    }
  }

  function handlePointerMove(e) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.handle) {
      const dx = e.clientX - d.x0;
      if (Math.abs(dx) < DIRECTION_SLOP_PX) return;
      grab(d, handleForDirection(dx), d.pos0);
    }
    setHandle(d.handle, posAt(d.g, e.clientX) - d.offset);
  }

  function handlePointerUp(e) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  // A double-click on the bars selects just that year (the presets do the
  // same for the main years); a single click only moves the nearest handle,
  // so missing a thumb never throws the selected range away.
  function handleDoubleClick(e) {
    const g = geometry();
    const y = Math.round(posAt(g, e.clientX));
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    setPlaying(false);
    onChangeRange(y, y);
  }

  function handleKeyDown(handle, e) {
    const value = handle === "start" ? startYear : endYear;
    const target = keyTarget(e.key, value);
    if (target == null) return;
    e.preventDefault();
    setPlaying(false);
    setHandle(handle, target);
  }

  // The live value while dragging is shown in the range text, highlighted,
  // and in a small label beside the thumb inside the strip, so nothing pops up
  // over the presets or other controls.
  const yearSpan = (handle, year) => (
    <span className={"timeline-year-part" + (handle && active === handle ? " timeline-year-part--active" : "")}>{year}</span>
  );

  const showEventMarker = eventYear != null && eventYear >= MIN_YEAR && eventYear <= MAX_YEAR;

  return (
    <section
      className="timeline"
      aria-label="Time range"
      style={{ "--tl-start": frac(startYear), "--tl-end": frac(endYear), "--tl-years": MAX_YEAR - MIN_YEAR }}
    >
      <div className="timeline-top">
        <div className="timeline-controls">
          <button
            type="button"
            className="timeline-play"
            onClick={togglePlay}
            aria-pressed={playing && endYear < MAX_YEAR}
            aria-label={
              playMode === "slide"
                ? playing
                  ? "Pause: stop moving the period"
                  : "Play: move the period forward"
                : playing
                  ? "Pause: stop advancing the end year"
                  : "Play: advance the end year"
            }
          >
            <span aria-hidden="true">
              {playing ? "❚❚" : "▶"}
              <span className="timeline-play-word"> {playing ? "Pause" : "Play"}</span>
            </span>
          </button>
          <div className="timeline-mode" role="group" aria-label="Play mode">
            {PLAY_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="timeline-mode-btn"
                aria-pressed={playMode === m.id}
                aria-describedby={`timeline-mode-help-${m.id}`}
                title={m.help}
                onClick={() => setPlayMode(m.id)}
              >
                {m.label}
              </button>
            ))}
            {PLAY_MODES.map((m) => (
              <span key={m.id} hidden id={`timeline-mode-help-${m.id}`}>
                {m.help}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="timeline-year"
            ref={yearBtnRef}
            aria-expanded={editing}
            aria-controls="timeline-years-edit"
            aria-label={`${startYear === endYear ? startYear : `${startYear} to ${endYear}`}: type exact years`}
            title="Type exact years"
            onClick={() => setEditing((v) => !v)}
          >
            {startYear === endYear && !active ? (
              yearSpan(null, startYear)
            ) : (
              <>
                {yearSpan("start", startYear)}
                {" – "}
                {yearSpan("end", endYear)}
              </>
            )}
            <span className="timeline-year-caret" aria-hidden="true">
              {editing ? "▴" : "▾"}
            </span>
          </button>
        </div>
        <p className="timeline-help" id="timeline-help">
          Borders show the end year.
        </p>
        {editing ? (
          <YearEditor
            startYear={startYear}
            endYear={endYear}
            onChangeRange={(s, e) => {
              setPlaying(false);
              onChangeRange(s, e);
            }}
            onClose={closeEditor}
          />
        ) : (
          <Presets startYear={startYear} endYear={endYear} onPick={applyPreset} />
        )}
      </div>
      <div className="timeline-strip">
        <span className="timeline-bound">{MIN_YEAR}</span>
        {/* One strip: the density bars sit behind the two handles, so the
            handles are on the histogram. Each bar is centred on its year's
            handle position. The whole strip takes the pointer (see
            handlePointerDown); the handles themselves take the keyboard. */}
        <div
          className="timeline-range"
          ref={rangeRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          <div className="timeline-track" />
          <div className="timeline-density" aria-hidden="true">
            {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i).map((y) => {
              const n = eventCountsByYear[y] ?? 0;
              return (
                <div
                  key={y}
                  className={
                    "timeline-tick" + (y >= startYear && y <= endYear ? " timeline-tick--active" : "")
                  }
                  title={`${y}: ${n.toLocaleString("en-US")} ${n === 1 ? "event" : "events"} starting. Click to move the nearest handle here, double-click to show only ${y}.`}
                >
                  <span className="timeline-tick-bar" style={{ height: `${10 + 80 * (n / maxCount)}%` }} />
                </div>
              );
            })}
          </div>
          {showEventMarker && (
            <span
              className="timeline-event-marker"
              aria-hidden="true"
              style={{ "--tl-pos": frac(eventYear) }}
            />
          )}
          {active && (
            <span
              className={
                `timeline-bubble timeline-bubble--${active}` +
                // Flip to the inner side near the ends, where the outer side has no room.
                ((active === "start" ? frac(startYear) < 0.08 : frac(endYear) > 0.92) ? " timeline-bubble--flip" : "")
              }
              aria-hidden="true"
              style={{ "--tl-pos": active === "start" ? "var(--tl-start)" : "var(--tl-end)" }}
            >
              {active === "start" ? startYear : endYear}
            </span>
          )}
          {["start", "end"].map((h) => {
            const value = h === "start" ? startYear : endYear;
            return (
              <div
                key={h}
                ref={handleRefs[h]}
                role="slider"
                tabIndex={0}
                aria-label={HANDLE_NAME[h]}
                aria-valuemin={MIN_YEAR}
                aria-valuemax={MAX_YEAR}
                aria-valuenow={value}
                aria-valuetext={`${HANDLE_NAME[h]} ${value}`}
                aria-orientation="horizontal"
                aria-describedby="timeline-help"
                title={`Drag to choose the ${h} year; borders show the end year.`}
                className={`timeline-handle timeline-handle--${h}` + (active === h ? " timeline-handle--active" : "")}
                style={{ "--tl-pos": h === "start" ? "var(--tl-start)" : "var(--tl-end)" }}
                onKeyDown={(e) => handleKeyDown(h, e)}
                onFocus={() => setActive(h)}
                onBlur={() => setActive(null)}
              />
            );
          })}
        </div>
        <span className="timeline-bound">{MAX_YEAR}</span>
      </div>
      {showEventMarker && <p className="timeline-sr">The open event&apos;s year, {eventYear}, is marked on the timeline.</p>}
    </section>
  );
}

// The presets scroll sideways when they don't fit. A fade on the clipped side
// shows there is more, and the mouse wheel scrolls them sideways too.
function Presets({ startYear, endYear, onPick }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    // A vertical wheel turn scrolls the row sideways when it overflows.
    const wheel = (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="timeline-presets"
      role="group"
      aria-label="Jump to a year or period"
      data-fade-left={edges.left || undefined}
      data-fade-right={edges.right || undefined}
    >
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          className="timeline-preset"
          aria-pressed={p.start === startYear && p.end === endYear}
          onClick={() => onPick(p)}
          // Keyboard users tabbing into a clipped preset see it whole.
          onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Exact years, for when dragging is too coarse (a phone has about two pixels
// per year). Each field applies as soon as it holds a valid year; steppers move
// one year at a time.
function YearEditor({ startYear, endYear, onChangeRange, onClose }) {
  const ref = useRef(null);
  // Focus the start field, except on touch screens, where that would pop up
  // the keyboard over the map when the steppers may be all that's wanted.
  useEffect(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    (coarse ? ref.current : ref.current?.querySelector("input"))?.focus({ preventScroll: true });
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    // Escape anywhere in the editor closes it and returns to the years button.
    <div className="timeline-edit" id="timeline-years-edit" role="group" aria-label="Exact years" tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <YearField handle="start" startYear={startYear} endYear={endYear} onChangeRange={onChangeRange} />
      <YearField handle="end" startYear={startYear} endYear={endYear} onChangeRange={onChangeRange} />
      <button type="button" className="timeline-edit-done" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

function YearField({ handle, startYear, endYear, onChangeRange }) {
  const value = handle === "start" ? startYear : endYear;
  const [draft, setDraft] = useState(null); // text while typing, null when showing the value
  const id = `timeline-edit-${handle}`;
  const check = draft == null ? null : checkTypedYear(handle, draft, startYear, endYear);
  const error = check?.error && draft.length >= 4 ? check.error : null;

  function type(text) {
    const t = text.replace(/\D/g, "").slice(0, 4);
    setDraft(t);
    const c = checkTypedYear(handle, t, startYear, endYear);
    if (c.year != null) onChangeRange(...moveHandle(handle, c.year, startYear, endYear));
  }

  function step(d) {
    setDraft(null);
    onChangeRange(...moveHandle(handle, value + d, startYear, endYear));
  }

  const min = handle === "start" ? MIN_YEAR : startYear;
  const max = handle === "start" ? endYear : MAX_YEAR;
  const name = handle === "start" ? "Start" : "End";

  return (
    <div className="timeline-edit-field">
      <label htmlFor={id}>{name}</label>
      <button
        type="button"
        className="timeline-edit-step"
        aria-label={`${name} year one earlier`}
        disabled={value <= min}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={4}
        value={draft ?? String(value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          } else if (e.key === "Enter") {
            setDraft(null);
          }
        }}
      />
      <button
        type="button"
        className="timeline-edit-step"
        aria-label={`${name} year one later`}
        disabled={value >= max}
        onClick={() => step(1)}
      >
        +
      </button>
      {error && (
        <span className="timeline-edit-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
