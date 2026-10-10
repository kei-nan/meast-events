import { Fragment, memo, useId, useState } from "react";
import { eventYears, highlight, inRange } from "./resultsUtil.jsx";
import { categoryLabel } from "../lib/categoryLabels.js";
import { startedBefore } from "../lib/browseOrder.js";

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
  const describedBy = [ev.snippet && `${id}-snippet`, hasTags && `${id}-tags`].filter(Boolean).join(" ");
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
          {ev.countries?.length ? ` · ${ev.countries.join(", ")}` : ""}
          {ev.category ? ` · ${categoryLabel(ev.category)}` : ""}
        </span>
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

/**
 * Results as a list of buttons. With `browse` (the idle list, ordered by
 * lib/browseOrder.js) events that began before the selected years follow a
 * subheading and carry an "ongoing since" tag. Arrow keys move between rows (roving tabindex);
 * ArrowUp on the first row and Escape return to `onFocusInput`.
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
}) {
  const [shown, setShown] = useState(PAGE);
  const [active, setActive] = useState(0);
  const visible = results.slice(0, shown);
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
      <ul className="sp-list" onKeyDown={onKeyDown} aria-busy={busy || undefined}>
        {visible.map((ev, idx) => {
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
