import { memo, useEffect, useRef, useState } from "react";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";
import { playRestart, playStep } from "../lib/playback";
import "../Timeline.css";

const PLAY_INTERVAL_MS = 350;

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

const PLAY_MODES = [
  { id: "accumulate", label: "Accumulate", help: "Play keeps the start year and advances the end year" },
  { id: "slide", label: "Slide", help: "Play moves the whole period forward, keeping its length" },
];

const countText = (n) => `${n.toLocaleString("en-US")} ${n === 1 ? "event" : "events"}`;

// Memoized (export below): hovering a list row re-renders App, which must not
// redraw ~130 density bars. `playing` lives in App so the side panel can hold
// its live announcements while Play runs. `borderYear` (non-null while an open
// event's year drives the map borders) adjusts the help text.
function Timeline({
  startYear,
  endYear,
  onChangeRange,
  eventCountsByYear,
  borderYear = null,
  playing,
  onPlayingChange: setPlaying,
}) {
  const maxCount = Math.max(1, ...Object.values(eventCountsByYear));
  const [playMode, setPlayMode] = useState("accumulate");
  const [active, setActive] = useState(null); // "start" | "end" while dragged/focused
  const latest = useRef({ startYear, endYear, onChangeRange });
  useEffect(() => {
    latest.current = { startYear, endYear, onChangeRange };
  });

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
  }, [playing, endYear, playMode, setPlaying]);

  function handleStartChange(value) {
    setPlaying(false);
    onChangeRange(Math.min(Number(value), endYear), endYear);
  }

  function handleEndChange(value) {
    setPlaying(false);
    onChangeRange(startYear, Math.max(Number(value), startYear));
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (endYear >= MAX_YEAR) onChangeRange(...playRestart(startYear, endYear, playMode));
    setPlaying(true);
  }

  // Density bars: a click jumps to that single year (pointer-only; the
  // sliders and presets cover keyboard use).
  function handleDensityClick(e) {
    const y = Number(e.target.closest("[data-year]")?.dataset.year);
    if (!Number.isFinite(y)) return;
    setPlaying(false);
    onChangeRange(y, y);
  }

  function applyPreset(p) {
    setPlaying(false);
    onChangeRange(p.start, p.end);
  }

  const rangeText = startYear === endYear ? `${startYear}` : `${startYear} – ${endYear}`;
  // When both handles sit at the right edge the start thumb must be on top, or it can't be grabbed.
  const startOnTop = startYear >= endYear && startYear > (MIN_YEAR + MAX_YEAR) / 2;
  // While an event is open the map shows that event's year (App borderYear).
  const bordersText =
    borderYear != null ? `Borders show ${borderYear}, the open event's year` : "Borders show the end year";
  // The histogram is pointer-only (aria-hidden), so the sliders carry its counts.
  const countAt = (y) => countText(eventCountsByYear[y] ?? 0);

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
                title={m.help}
                onClick={() => setPlayMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="timeline-year">{rangeText}</span>
        </div>
        <p className="timeline-help" id="timeline-help">
          {bordersText}.
        </p>
        <div className="timeline-presets" role="group" aria-label="Jump to a year or period">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="timeline-preset"
              aria-pressed={p.start === startYear && p.end === endYear}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-strip">
        <span className="timeline-bound">{MIN_YEAR}</span>
        {/* One strip: the density bars sit behind the two range inputs, so the
            handles are on the histogram. The inputs only catch pointer events on
            their thumbs, so a click elsewhere reaches the bars. Each bar is
            centred on its year's slider position. */}
        <div className="timeline-range">
          <div className="timeline-track" />
          <div className="timeline-density" aria-hidden="true" onClick={handleDensityClick}>
            {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i).map((y) => {
              const n = eventCountsByYear[y] ?? 0;
              return (
                <div
                  key={y}
                  data-year={y}
                  className={
                    "timeline-tick" + (y >= startYear && y <= endYear ? " timeline-tick--active" : "")
                  }
                  title={`${y}: ${countText(n)} starting`}
                >
                  <span className="timeline-tick-bar" style={{ height: `${10 + 80 * (n / maxCount)}%` }} />
                </div>
              );
            })}
          </div>
          {active && (
            <span
              className={`timeline-bubble timeline-bubble--${active}`}
              aria-hidden="true"
              style={{ "--tl-pos": active === "start" ? "var(--tl-start)" : "var(--tl-end)" }}
            >
              {active === "start" ? `Start ${startYear}` : `End ${endYear}`}
            </span>
          )}
          <input
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={startYear}
            onChange={(e) => handleStartChange(e.target.value)}
            onFocus={() => setActive("start")}
            onBlur={() => setActive(null)}
            onPointerDown={() => setActive("start")}
            aria-label="Start year"
            aria-valuetext={`Start year ${startYear}, ${countAt(startYear)} starting that year`}
            aria-describedby="timeline-help"
            title={`Drag to choose the start year; ${bordersText.toLowerCase()}.`}
            className={"timeline-slider timeline-slider--start" + (startOnTop ? " timeline-slider--top" : "")}
          />
          <input
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={endYear}
            onChange={(e) => handleEndChange(e.target.value)}
            onFocus={() => setActive("end")}
            onBlur={() => setActive(null)}
            onPointerDown={() => setActive("end")}
            aria-label="End year"
            aria-valuetext={`End year ${endYear}, ${countAt(endYear)} starting that year`}
            aria-describedby="timeline-help"
            title={`Drag to choose the end year; ${bordersText.toLowerCase()}.`}
            className="timeline-slider timeline-slider--end"
          />
        </div>
        <span className="timeline-bound">{MAX_YEAR}</span>
      </div>
    </section>
  );
}
export default memo(Timeline);
