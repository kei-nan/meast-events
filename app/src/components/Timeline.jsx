import { useEffect, useRef, useState } from "react";
import { MAX_YEAR, MIN_YEAR } from "../lib/years";
import { playRestart, playStep } from "../lib/playback";
import "../Timeline.css";

const PLAY_INTERVAL_MS = 350;

// Labelled year ranges only; the names carry no claims beyond the years shown.
const PRESETS = [
  { label: "1900", start: 1900, end: 1900 },
  { label: "WWI 1914–18", start: 1914, end: 1918 },
  { label: "1948", start: 1948, end: 1948 },
  { label: "1967", start: 1967, end: 1967 },
  { label: "1990", start: 1990, end: 1990 },
  { label: "2011", start: 2011, end: 2011 },
  { label: String(MAX_YEAR), start: MAX_YEAR, end: MAX_YEAR },
  { label: "All years", start: MIN_YEAR, end: MAX_YEAR },
];

const frac = (y) => (y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);

const PLAY_MODES = [
  { id: "accumulate", label: "Accumulate", help: "Play keeps the start year and advances the end year" },
  { id: "slide", label: "Slide", help: "Play moves the whole period forward, keeping its length" },
];

export default function Timeline({ startYear, endYear, onChangeRange, eventCountsByYear }) {
  const maxCount = Math.max(1, ...Object.values(eventCountsByYear));
  const [playing, setPlaying] = useState(false);
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
  }, [playing, endYear, playMode]);

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

  return (
    <section
      className="timeline"
      aria-label="Time range"
      style={{ "--tl-start": frac(startYear), "--tl-end": frac(endYear) }}
    >
      <div className="timeline-top">
      <div className="timeline-header">
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
          <span aria-hidden="true">{playing ? "❚❚ Pause" : "▶ Play"}</span>
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
        <div className="timeline-title">
          <span className="timeline-year">{rangeText}</span>
          <p className="timeline-help" id="timeline-help">
            Drag the handles to choose a period; borders show the end year.
          </p>
        </div>
      </div>
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
              title={`${y}: ${n.toLocaleString("en-US")} ${n === 1 ? "event" : "events"} starting`}
            >
              <span className="timeline-tick-bar" style={{ height: `${4 + 16 * (n / maxCount)}px` }} />
            </div>
          );
        })}
      </div>
      <div className="timeline-range">
        <div className="timeline-track" />
        <div className="timeline-track-fill" />
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
          aria-valuetext={`Start year ${startYear}`}
          aria-describedby="timeline-help"
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
          aria-valuetext={`End year ${endYear}`}
          aria-describedby="timeline-help"
          className="timeline-slider timeline-slider--end"
        />
      </div>
      <div className="timeline-bounds">
        <span>{MIN_YEAR}</span>
        <span>Events shown cover the whole range.</span>
        <span>{MAX_YEAR}</span>
      </div>
    </section>
  );
}

