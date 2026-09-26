import { useState } from "react";
import { eventYears, highlight, inRange } from "./resultsUtil.jsx";

const PAGE = 50;

function yearLabel(e) {
  const [s, en] = eventYears(e);
  return en !== s ? `${s}–${en}` : `${s}`;
}

/**
 * Results as a list of buttons. Arrow keys move between rows (roving tabindex);
 * ArrowUp on the first row and Escape return to `onFocusInput`.
 * Remount (change `key`) to reset pagination when the result set changes.
 */
export default function ResultsList({
  results,
  query,
  range,
  selectedId,
  onSelect,
  onHover,
  onFocusInput,
  busy,
}) {
  const [shown, setShown] = useState(PAGE);
  const [active, setActive] = useState(0);
  const visible = results.slice(0, shown);

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
          return (
            <li key={ev.id}>
              <button
                type="button"
                className={"sp-row" + (ev.id === selectedId ? " sp-row--selected" : "")}
                data-id={ev.id}
                tabIndex={idx === active ? 0 : -1}
                onFocus={() => setActive(idx)}
                onClick={() => onSelect?.(ev.id)}
                onMouseEnter={() => onHover?.(ev.id)}
                onMouseLeave={() => onHover?.(null)}
              >
                <span className="sp-row-title">{highlight(ev.title, query)}</span>
                <span className="sp-row-meta">
                  {yearLabel(ev)}
                  {ev.countries?.length ? ` · ${ev.countries.join(", ")}` : ""}
                  {ev.category ? ` · ${ev.category}` : ""}
                </span>
                {ev.snippet && (
                  <span className="sp-row-snippet">{highlight(ev.snippet, query)}</span>
                )}
                {(outside || ev.location_quality === "approximate" || ev.location_quality === "none") && (
                  <span className="sp-tags">
                    {outside && <span className="sp-tag">outside selected years</span>}
                    {ev.location_quality === "none" && (
                      <span className="sp-tag sp-tag--nomap">No map location</span>
                    )}
                    {ev.location_quality === "approximate" && (
                      <span className="sp-tag">approximate location</span>
                    )}
                  </span>
                )}
              </button>
            </li>
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
