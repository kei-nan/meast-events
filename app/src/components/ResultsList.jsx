import { Fragment, memo, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { eventYears, highlight, inRange } from "./resultsUtil.jsx";
import { categoryLabel } from "../lib/categoryLabels.js";
import { listedYear, startedBefore } from "../lib/browseOrder.js";
import { countryLabel } from "../lib/eventCountries.js";
import { matchedAlias } from "../lib/ranking.js";
import {
  axisTicks,
  barGeometry,
  decadeLabel,
  jumpIndex,
  rangeBand,
  startDecade,
  timelineAxis,
  timelineOrder,
  yearAtAxis,
  yearMark,
} from "../lib/timelineView.js";
import { warmEvent } from "../lib/warmEvent.js";
import { measureStuck, stuckBottom } from "../lib/stickyClear.js";
import { useStickyClearance } from "../hooks/useStickyClearance.js";
import useTopRowYear from "../hooks/useTopRowYear.js";
import { eventYearsText, ongoingSignal } from "../lib/eventYears.js";
import { MAX_YEAR, MIN_YEAR } from "../lib/years.js";

const PAGE = 50;

// "1956", "1956–1957", or "2014–ongoing" for an event a source says is still going on
// (lib/eventYears.js); "" without a start year (its old fallback printed "0").
function yearLabel(e) {
  return eventYearsText(e);
}

// One result row. Its accessible name is the title and the year/place line;
// the snippet and tags are its description, so a screen reader reads the
// short name first. Pointing at, focusing or pressing a row starts what opening
// its event downloads (lib/warmEvent.js). Memoized: only rows whose props change re-render.
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
        onFocus={() => {
          onFocusRow(idx);
          warmEvent(ev.id);
        }}
        onPointerEnter={() => warmEvent(ev.id)}
        onPointerDown={() => warmEvent(ev.id)}
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
// its years are in the margin and the line under it.
const TimelineRow = memo(function TimelineRow({
  ev,
  idx,
  listed,
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
  const [start, end] = eventYears(ev);
  const marginYear = Number.isFinite(start) && start > 0 ? start : null;
  // A single year is already in the margin, so the line under the bar shows
  // only a span of years; screen readers (the margin is hidden from them)
  // still hear the year as part of the row's name.
  const yearInMargin = marginYear != null && end === start && !ongoingSignal(ev);
  const place = [ev.countries?.length ? timelineCountries(ev.countries) : "", ev.category ? categoryLabel(ev.category) : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <button
        type="button"
        className={"sp-row sp-trow" + (selected ? " sp-row--selected" : "")}
        data-id={ev.id}
        data-year={listed ?? undefined}
        tabIndex={tabbable ? 0 : -1}
        aria-labelledby={`${id}-title ${id}-meta`}
        aria-describedby={hasTags ? `${id}-tags` : undefined}
        aria-current={selected ? "true" : undefined}
        onFocus={() => {
          onFocusRow(idx);
          warmEvent(ev.id);
        }}
        onPointerEnter={() => warmEvent(ev.id)}
        onPointerDown={() => warmEvent(ev.id)}
        onClick={() => onSelect?.(ev.id)}
        onMouseEnter={() => onHover?.(ev.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <span className="sp-trow-year" aria-hidden="true">
          {marginYear ?? ""}
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
            {yearInMargin ? (
              <>
                <span className="sp-sr">
                  {yearLabel(ev)}
                  {place ? ", " : ""}
                </span>
                {place}
              </>
            ) : (
              <>
                {yearLabel(ev)}
                {place ? ` · ${place}` : ""}
              </>
            )}
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
// the axis's first and last year and a few round years between. It stays in
// view (sticky) and works like a menu's section bar: a click anywhere on it
// jumps the list to that year, its years are buttons for the keyboard, and a
// notch marks the year of the row now at the top of the list.
function TimelineAxis({ axis, band, current, onJump, axisRef }) {
  const [a0, a1] = axis;
  const mark = yearMark(current, axis);
  const yearBtn = (year, className, style) => (
    <button
      key={year}
      type="button"
      className={className}
      style={style}
      aria-label={`Jump to ${year}`}
      onClick={(e) => {
        e.stopPropagation(); // not the scale's click as well
        onJump(year);
      }}
    >
      {year}
    </button>
  );
  return (
    <div className="sp-taxis" ref={axisRef} role="group" aria-label="Jump to a year in the list">
      {/* The click between the years is for the pointer only; the keyboard
          has the year buttons. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
      <div
        className="sp-taxis-scale"
        title="Click a year to jump to it in the list"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (r.width > 0) onJump(yearAtAxis((e.clientX - r.left) / r.width, axis));
        }}
      >
        {band && <span className="sp-track-band" style={at(band)} aria-hidden="true" />}
        {mark != null && <span className="sp-taxis-mark" style={{ left: `${mark}%` }} aria-hidden="true" />}
        {yearBtn(a0, "sp-taxis-end sp-taxis-end--start")}
        {axisTicks(axis).map((t) => yearBtn(t.year, "sp-taxis-tick", { left: `${t.at}%` }))}
        {a1 !== a0 && yearBtn(a1, "sp-taxis-end sp-taxis-end--end")}
      </div>
    </div>
  );
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
 * Remount (change `key`) to reset pagination when the result set changes; a
 * new `query` resets it without a remount.
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
  // A new search text starts at the first page and row, as a remount would,
  // but rows still listed keep their nodes (SearchPanel keys this list on the
  // filters, area and view only, so typing does not rebuild every row).
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setShown(PAGE);
    setActive(0);
  }
  const timeline = layout === "timeline";
  const rangeStart = browse && range ? range[0] : null;
  const axis = useMemo(
    () => (timeline ? timelineAxis(results, range, { fit: fitAxis, minYear: MIN_YEAR, maxYear: MAX_YEAR }) : null),
    [timeline, results, range, fitAxis]
  );
  // Each row placed (order, decade) at the year its bar sits on the axis.
  const ordered = useMemo(
    () => (timeline ? timelineOrder(results, rangeStart, axis) : results),
    [timeline, results, rangeStart, axis]
  );
  const band = axis && fitAxis ? rangeBand(range, axis) : null;
  const visible = ordered.slice(0, shown);
  // The list can shrink under a remembered row (the timeline narrowed): the last
  // row then takes the tab stop, so the list always has one.
  const tabStop = Math.min(active, visible.length - 1);
  const listRef = useRef(null);
  const axisRef = useRef(null);
  // The sticky axis covers the top of the panel's scroller, so a row focus
  // moves up to (ArrowUp, Shift+Tab) would be scrolled under it: the scroller
  // keeps the axis's height clear while it is shown.
  useStickyClearance(axisRef, timeline);

  // Each row's year on the axis (the one it is grouped and ordered by), null
  // for an undated row or one in the ongoing group: the axis does not place them.
  const ongoingOf = (e) => Boolean(browse && range && startedBefore(e, range[0]));
  const rowYears = useMemo(() => {
    if (!timeline) return null;
    return ordered.map((e) => {
      if (browse && range && startedBefore(e, range[0])) return null;
      const y = listedYear(e, axis);
      return Number.isFinite(y) && y > 0 ? y : null;
    });
  }, [timeline, ordered, browse, range, axis]);

  // The year of the row at the top of the list, just under the sticky axis,
  // as the panel (.sp-scroll) scrolls: the axis marks it (hooks/useTopRowYear.js).
  const topYear = useTopRowYear(listRef, axisRef, timeline, shown, rowYears);

  // A year picked on the axis: the list scrolls so that year's first row (or
  // its decade heading, when the row starts a decade) sits just under the
  // axis, showing more rows first if it is not shown yet; focus moves to it.
  function jumpToYear(year) {
    const i = jumpIndex(rowYears ?? [], year);
    if (i < 0) return;
    // A page of rows after it too, so the list can scroll it to the top.
    if (i + PAGE > shown) flushSync(() => setShown(i + PAGE));
    const list = listRef.current;
    const scroller = list?.closest(".sp-scroll");
    const row = list?.querySelectorAll("button.sp-row")[i];
    if (!scroller || !row) return;
    const li = row.closest("li");
    const heading = li && !li.previousElementSibling ? li.parentElement.previousElementSibling : null;
    const target = heading?.tagName === "H2" ? heading : row;
    // Where the axis's bottom is once it sticks, wherever it is now (the same
    // line the scroller keeps clear for focus, lib/stickyClear.js).
    const axisEl = axisRef.current;
    const line = scroller.getBoundingClientRect().top + (axisEl ? stuckBottom(measureStuck(axisEl, scroller)) : 0);
    scroller.scrollBy({ top: target.getBoundingClientRect().top - line, behavior: reducedMotion() ? "auto" : "smooth" });
    setActive(i);
    row.focus({ preventScroll: true });
  }

  // The last "Show more" goes away with its click, and focus with it (to the
  // page): focus the first of the rows it showed instead.
  function showMore() {
    const first = shown;
    const last = results.length <= shown + PAGE;
    if (!last) return setShown(shown + PAGE);
    flushSync(() => {
      setShown(shown + PAGE);
      setActive(first);
    });
    listRef.current?.querySelectorAll("button.sp-row")[first]?.focus();
  }

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

  // The rows in groups, each its own list under its heading (an h2, the
  // panel's top level like the event title, so screen reader users can jump
  // between groups): in the Timeline view by decade, with the browse list's
  // events that began before the selected years last (timelineOrder) under one
  // heading; in the list only that "ongoing" group has a heading. Rows keep
  // their index in `visible` (roving tab stop, "Show more" focus).
  const groupOf = timeline ? (e) => (ongoingOf(e) ? "ongoing" : startDecade(e, axis)) : (e) => (ongoingOf(e) ? "ongoing" : "");
  const groups = [];
  visible.forEach((ev, idx) => {
    const g = groupOf(ev);
    const last = groups[groups.length - 1];
    if (last && last.key === g) last.rows.push({ ev, idx });
    else groups.push({ key: g, rows: [{ ev, idx }] });
  });

  return (
    // While a search is running the rows shown are real and usable (the
    // title/summary matches while full-text search loads, or the last
    // results), so they stay at full contrast and are not marked busy: a thin
    // moving line above them (SidePanel.css) and the status line say it is
    // running. Only an empty list that is still loading is busy.
    <div className={"sp-results" + (busy ? " sp-results--busy" : "")}>
      {timeline && <TimelineAxis axis={axis} band={band} current={topYear} onJump={jumpToYear} axisRef={axisRef} />}
      <div ref={listRef} onKeyDown={onKeyDown} aria-busy={(busy && results.length === 0) || undefined}>
        {groups.map(({ key, rows }, gi) => (
          <Fragment key={`${gi}:${key}`}>
            {key !== "" && (
              <h2 className={"sp-list-heading" + (key === "ongoing" ? "" : " sp-list-heading--decade")}>
                {key === "ongoing" ? `Ongoing, started before ${range[0]}` : decadeLabel(key)}
              </h2>
            )}
            <ul className="sp-list">
              {rows.map(({ ev, idx }) =>
                timeline ? (
                  <TimelineRow
                    key={ev.id}
                    ev={ev}
                    idx={idx}
                    listed={rowYears[idx]}
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
                ) : (
                  <ResultRow
                    key={ev.id}
                    ev={ev}
                    idx={idx}
                    query={query}
                    outside={!inRange(ev, range)}
                    ongoing={key === "ongoing"}
                    selected={ev.id === selectedId}
                    tabbable={idx === tabStop}
                    onFocusRow={setActive}
                    onSelect={onSelect}
                    onHover={onHover}
                  />
                )
              )}
            </ul>
          </Fragment>
        ))}
      </div>
      {results.length > shown && (
        <button type="button" className="sp-more" onClick={showMore}>
          Show more ({results.length - shown} remaining)
        </button>
      )}
    </div>
  );
}

export default memo(ResultsList);
