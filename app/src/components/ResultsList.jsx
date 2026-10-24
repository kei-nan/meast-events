import { Fragment, memo, useId, useMemo, useState } from "react";
import { eventYears, highlight, inRange } from "./resultsUtil.jsx";
import { categoryLabel } from "../lib/categoryLabels.js";
import { startedBefore } from "../lib/browseOrder.js";
import { countryLabel } from "../lib/eventCountries.js";
import { matchedAlias } from "../lib/ranking.js";
import {
  axisTicks,
  barGeometry,
  decadeLabel,
  rangeBand,
  startDecade,
  timelineAxis,
  timelineOrder,
} from "../lib/timelineView.js";
import { MAX_YEAR, MIN_YEAR } from "../lib/years.js";

const PAGE = 50;

function yearLabel(e) {
  const [s, en] = eventYears(e);
  return en !== s ? `${s}–${en}` : `${s}`;
}

// One result row. Its accessible name is the title and the year/place line;
// the snippet and tags are its description, so a screen reader reads the
// short name first. Memoized: only rows whose props change re-render.
const ResultRow = memo(function ResultRow({
  ev,
  idx,
  query,
  outside,
  ongoing,
  selected,
  tabbable,
  onFocusRow,
  onSelect,
  onHover,
}) {
  const id = useId();
  const nomap = ev.location_quality === "none";
  const approximate = ev.location_quality === "approximate";
  const hasTags = outside || ongoing || nomap || approximate;
  // The Wikidata alias the query matched, when the title does not match it.
  const alias = query ? matchedAlias(ev, query) : null;
  const describedBy = [alias && `${id}-alias`, ev.snippet && `${id}-snippet`, hasTags && `${id}-tags`]
    .filter(Boolean)
    .join(" ");
  return (
    <li>
      <button
        type="button"
        className={"sp-row" + (selected ? " sp-row--selected" : "")}
        data-id={ev.id}
        tabIndex={tabbable ? 0 : -1}
        aria-labelledby={`${id}-title ${id}-meta`}
        aria-describedby={describedBy || undefined}
        aria-current={selected ? "true" : undefined}
        onFocus={() => onFocusRow(idx)}
        onClick={() => onSelect?.(ev.id)}
        onMouseEnter={() => onHover?.(ev.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <span className="sp-row-title" id={`${id}-title`}>
          {highlight(ev.title, query)}
        </span>
        <span className="sp-row-meta" id={`${id}-meta`}>
          {yearLabel(ev)}
          {ev.countries?.length ? ` · ${ev.countries.map(countryLabel).join(", ")}` : ""}
          {ev.category ? ` · ${categoryLabel(ev.category)}` : ""}
        </span>
        {alias && (
          <span className="sp-row-alias" id={`${id}-alias`}>
            matched: {alias}
          </span>
        )}
        {ev.snippet && (
          <span className="sp-row-snippet" id={`${id}-snippet`}>
            {highlight(ev.snippet, query)}
          </span>
        )}
        {hasTags && (
          <span className="sp-tags" id={`${id}-tags`}>
            {outside && <span className="sp-tag">Outside selected years</span>}
            {ongoing && <span className="sp-tag">Ongoing since {eventYears(ev)[0]}</span>}
            {nomap && <span className="sp-tag sp-tag--nomap">No map location</span>}
            {approximate && <span className="sp-tag">Approximate location</span>}
          </span>
        )}
      </button>
    </li>
  );
});

// The Timeline view's countries: up to three by name, more as a count (the
// event panel lists them all), so a row stays one line.
const MAX_TIMELINE_COUNTRIES = 3;

function timelineCountries(countries) {
  if (!countries?.length) return "";
  return countries.length > MAX_TIMELINE_COUNTRIES ? `${countries.length} countries` : countries.map(countryLabel).join(", ");
}

const at = (g) => ({ left: `${g.left}%`, width: `${g.width}%` });

// One row of the Timeline view: the start year in the margin, then the title,
// a bar for the years on the shared axis, the year/place line and the tags.
// Named like a list row (title and year/place line); the bar is decoration,
// its years are in the line under it.
const TimelineRow = memo(function TimelineRow({
  ev,
  idx,
  query,
  axis,
  band,
  outside,
  selected,
  tabbable,
  onFocusRow,
  onSelect,
  onHover,
}) {
  const id = useId();
  const bar = barGeometry(ev, axis);
  const nomap = ev.location_quality === "none";
  const approximate = ev.location_quality === "approximate";
  const reversed = bar?.reversed ?? false;
  const hasTags = outside || nomap || approximate || reversed;
  const [start] = eventYears(ev);
  return (
    <li>
      <button
        type="button"
        className={"sp-row sp-trow" + (selected ? " sp-row--selected" : "")}
        data-id={ev.id}
        tabIndex={tabbable ? 0 : -1}
        aria-labelledby={`${id}-title ${id}-meta`}
        aria-describedby={hasTags ? `${id}-tags` : undefined}
        aria-current={selected ? "true" : undefined}
        onFocus={() => onFocusRow(idx)}
        onClick={() => onSelect?.(ev.id)}
        onMouseEnter={() => onHover?.(ev.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <span className="sp-trow-year" aria-hidden="true">
          {Number.isFinite(start) && start > 0 ? start : ""}
        </span>
        <span className="sp-trow-body">
          <span className="sp-row-title" id={`${id}-title`}>
            {highlight(ev.title, query)}
          </span>
          <span className="sp-track" aria-hidden="true">
            {band && <span className="sp-track-band" style={at(band)} />}
            {bar && (
              <span
                className={
                  "sp-bar" +
                  (bar.point ? " sp-bar--point" : "") +
                  (bar.before ? " sp-bar--before" : "") +
                  (bar.after ? " sp-bar--after" : "")
                }
                style={at(bar)}
              />
            )}
          </span>
          <span className="sp-row-meta" id={`${id}-meta`}>
            {yearLabel(ev)}
            {ev.countries?.length ? ` · ${timelineCountries(ev.countries)}` : ""}
            {ev.category ? ` · ${categoryLabel(ev.category)}` : ""}
          </span>
          {hasTags && (
            <span className="sp-tags" id={`${id}-tags`}>
              {outside && <span className="sp-tag">Outside selected years</span>}
              {reversed && <span className="sp-tag">End date before start</span>}
              {nomap && <span className="sp-tag sp-tag--nomap">No map location</span>}
              {approximate && <span className="sp-tag">Approximate location</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
});

// The Timeline view's year scale, above the rows and aligned with their bars:
// the axis's first and last year and a few round years between.
function TimelineAxis({ axis, band }) {
  const [a0, a1] = axis;
  return (
    <div className="sp-taxis" aria-hidden="true">
      <div className="sp-taxis-scale">
        {band && <span className="sp-track-band" style={at(band)} />}
        <span className="sp-taxis-end sp-taxis-end--start">{a0}</span>
        {axisTicks(axis).map((t) => (
          <span key={t.year} className="sp-taxis-tick" style={{ left: `${t.at}%` }}>
            {t.year}
          </span>
        ))}
        {a1 !== a0 && <span className="sp-taxis-end sp-taxis-end--end">{a1}</span>}
      </div>
    </div>
  );
}

/**
 * Results as a list of buttons. With `browse` (the idle list, ordered by
 * lib/browseOrder.js) events that began before the selected years follow a
 * subheading and carry an "ongoing since" tag. Arrow keys move between rows (roving tabindex);
 * ArrowUp on the first row and Escape return to `onFocusInput`.
 * With `layout="timeline"` the same results are shown oldest first under
 * decade headings (with `browse`, the ongoing ones after the rest, under their
 * subheading), each with a bar on a shared year axis (lib/timelineView.js):
 * the selected years, or with `fitAxis` (a search over the whole timeline) the
 * results' own span, with the selected years shaded.
 * Remount (change `key`) to reset pagination when the result set changes.
 * Memoized: hovering a row re-renders App, not this list (keep props stable).
 */
function ResultsList({
  results,
  query,
  range,
  selectedId,
  onSelect,
  onHover,
  onFocusInput,
  busy,
  browse = false,
  layout = "list",
  fitAxis = false,
}) {
  const [shown, setShown] = useState(PAGE);
  const [active, setActive] = useState(0);
  const timeline = layout === "timeline";
  const rangeStart = browse && range ? range[0] : null;
  const ordered = useMemo(
    () => (timeline ? timelineOrder(results, rangeStart) : results),
    [timeline, results, rangeStart]
  );
  const axis = useMemo(
    () => (timeline ? timelineAxis(results, range, { fit: fitAxis, minYear: MIN_YEAR, maxYear: MAX_YEAR }) : null),
    [timeline, results, range, fitAxis]
  );
  const band = axis && fitAxis ? rangeBand(range, axis) : null;
  const visible = ordered.slice(0, shown);
  // The list can shrink under a remembered row (the timeline narrowed): the last
  // row then takes the tab stop, so the list always has one.
  const tabStop = Math.min(active, visible.length - 1);

  function onKeyDown(e) {
    const btns = [...e.currentTarget.querySelectorAll("button.sp-row")];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    let next = null;
    if (e.key === "ArrowDown") next = Math.min(i + 1, btns.length - 1);
    else if (e.key === "ArrowUp") {
      if (i === 0) {
        e.preventDefault();
        onFocusInput?.();
        return;
      }
      next = i - 1;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = btns.length - 1;
    else if (e.key === "Escape") {
      e.preventDefault();
      onFocusInput?.();
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      btns[next].focus();
    }
  }

  return (
    <div className={"sp-results" + (busy ? " sp-results--busy" : "")}>
      {timeline && <TimelineAxis axis={axis} band={band} />}
      <ul className="sp-list" onKeyDown={onKeyDown} aria-busy={busy || undefined}>
        {timeline && visible.map((ev, idx) => {
          // Headings by decade; in the browse list the events that began
          // before the selected years come last (timelineOrder), under one heading.
          const group = (e) => (browse && range && startedBefore(e, range[0]) ? "ongoing" : startDecade(e));
          const g = group(ev);
          const first = idx === 0 || group(visible[idx - 1]) !== g;
          return (
            <Fragment key={ev.id}>
              {first && (
                <li
                  className={"sp-list-heading" + (g === "ongoing" ? "" : " sp-list-heading--decade")}
                  role="presentation"
                >
                  <h2>{g === "ongoing" ? `Ongoing, started before ${range[0]}` : decadeLabel(g)}</h2>
                </li>
              )}
              <TimelineRow
                ev={ev}
                idx={idx}
                query={query}
                axis={axis}
                band={band}
                outside={!inRange(ev, range)}
                selected={ev.id === selectedId}
                tabbable={idx === tabStop}
                onFocusRow={setActive}
                onSelect={onSelect}
                onHover={onHover}
              />
            </Fragment>
          );
        })}
        {!timeline && visible.map((ev, idx) => {
          const outside = !inRange(ev, range);
          const ongoing = browse && range && startedBefore(ev, range[0]);
          const firstOngoing = ongoing && (idx === 0 || !startedBefore(visible[idx - 1], range[0]));
          return (
            <Fragment key={ev.id}>
              {firstOngoing && (
                // A heading (h2: the panel's top level, like the event title)
                // so screen reader users can jump to the ongoing events.
                <li className="sp-list-heading" role="presentation">
                  <h2>Ongoing, started before {range[0]}</h2>
                </li>
              )}
              <ResultRow
                ev={ev}
                idx={idx}
                query={query}
                outside={outside}
                ongoing={ongoing}
                selected={ev.id === selectedId}
                tabbable={idx === tabStop}
                onFocusRow={setActive}
                onSelect={onSelect}
                onHover={onHover}
              />
            </Fragment>
          );
        })}
      </ul>
      {results.length > shown && (
        <button type="button" className="sp-more" onClick={() => setShown(shown + PAGE)}>
          Show more ({results.length - shown} remaining)
        </button>
      )}
    </div>
  );
}

export default memo(ResultsList);
