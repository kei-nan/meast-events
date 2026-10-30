import { useEffect, useMemo, useRef, useState } from "react";
import EventLink from "./EventLink.jsx";
import ShareButton from "./ShareButton.jsx";
import { Compass } from "./RelatedEvents.jsx";
import { BoundaryNote, BoundarySource } from "./BoundaryText.jsx";
import { NO_STATUS_LABEL, humaniseStatus, isDashedStatus } from "./mapBorders.js";
import { loadBoundaryHistory, loadDeferredGeometry } from "../lib/dataClient.js";
import { eventsNear, historyAt, pendingRefsAt, periodLabel } from "../lib/placeHistory.js";
import { placeLabel } from "../lib/placeParam.js";
import { NEARBY_KM, RELATED_SHOWN } from "../lib/related.js";
import { compassPoint, compassScale, formatKm } from "../lib/relatedViz.js";
import { MAX_YEAR, MIN_YEAR } from "../lib/years.js";
import "./PlaceHistory.css";

// Where the data policy says which places have no shape in which years.
const NO_SHAPE_DOC =
  "https://github.com/kei-nan/meast-events/blob/main/docs/DATA_POLICY.md#map-borders-where-there-is-no-shape";

// Every boundary feature once (history.tbin), plus, for a point inside one of
// them, the deferred West Bank areas' full geometry (the file the map loads when
// zoomed in over them), then every year's shapes at the point (lib/placeHistory.js).
async function lookUp(lon, lat) {
  const fc = await loadBoundaryHistory();
  let features = fc.features;
  const refs = pendingRefsAt(features, lon, lat);
  if (refs.length) {
    const geometries = new Map(await Promise.all(refs.map(async (r) => [r, await loadDeferredGeometry(r)])));
    features = features.map((f) => (geometries.has(f.geometry_ref) ? { ...f, geometry: geometries.get(f.geometry_ref) } : f));
  }
  return historyAt(features, lon, lat, { minYear: MIN_YEAR, maxYear: MAX_YEAR });
}

const yearsText = (start, end) => periodLabel({ start, end }, MAX_YEAR);

// One shape of a period: its name, its status in the border details' words, and
// (behind a disclosure) each of its records' note and source, as the data has them.
function Shape({ item }) {
  const status = humaniseStatus(item.status);
  const hasNote = item.records.some((r) => r.note);
  const several = item.records.length > 1;
  return (
    <div className="ph-shape">
      <p className="ph-name">{item.name}</p>
      <p className="ph-status">
        <span className={`ph-swatch ${isDashedStatus(item.status) ? "is-flagged" : "is-solid"}`} aria-hidden="true" />
        {status ?? NO_STATUS_LABEL}
      </p>
      {item.records.some((r) => r.note || r.source) && (
        <details className="ph-more">
          <summary>
            {hasNote ? "Note and source" : "Source"}
            <span className="ph-sr"> for {item.name}</span>
          </summary>
          {item.records.map((r) => (
            <div key={r.start} className="ph-record">
              {several && <p className="ph-record-years">{yearsText(r.start, r.end)}</p>}
              <BoundaryNote note={r.note} className="ph-note" />
              <BoundarySource source={r.source} className="ph-source" />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/**
 * "What was this place?": the map's border shapes at one point (`place`,
 * {lon, lat}) in every year from MIN_YEAR, collapsed into periods, then the
 * events near it. Nothing here is our wording about a place: names, statuses,
 * notes and sources are the map's own (lib/placeHistory.js).
 * `mapYear`: the year whose borders the map draws (its period is marked).
 * `onChooseYears(start, end)`: show a period's years on the timeline and map.
 * `onListNearby()`: list every nearby event in the results (a circle area).
 */
export default function PlaceHistory({ place, events, eventsLoading, mapYear, onBack, onShowOnMap, onChooseYears, onSelectEvent, onListNearby }) {
  const { lon, lat } = place;
  const key = `${lon},${lat}`;
  const headingRef = useRef(null);
  const [answer, setAnswer] = useState(null); // {key, periods} | {key, error}
  const [attempt, setAttempt] = useState(0);
  const [hotId, setHotId] = useState(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    lookUp(lon, lat).then(
      (periods) => !cancelled && setAnswer({ key, periods }),
      () => !cancelled && setAnswer({ key, error: true })
    );
    return () => {
      cancelled = true;
    };
  }, [lon, lat, key, attempt]);

  const current = answer?.key === key ? answer : null;
  const periods = current?.periods ?? null;
  const allBlank = periods?.every((p) => p.items.length === 0);
  const someBlank = periods?.some((p) => p.items.length === 0);

  const near = useMemo(() => (events ? eventsNear(events, lon, lat, NEARBY_KM) : []), [events, lon, lat]);
  const shown = near.slice(0, RELATED_SHOWN);
  const label = placeLabel(place);

  return (
    <article className="event-detail place-history" aria-labelledby="place-history-title">
      <div className="event-detail-actions">
        <button type="button" className="sp-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> Back<span className="event-detail-back-more"> to results</span>
        </button>
        {onShowOnMap && (
          <button type="button" className="sp-btn" onClick={onShowOnMap}>
            Find on map
          </button>
        )}
        <ShareButton title={`History of this place (${label})`} />
      </div>
      <header className="event-detail-head">
        <p className="ph-kicker">History of this place</p>
        <h2 id="place-history-title" ref={headingRef} tabIndex={-1}>
          {label}
        </h2>
        <p className="event-detail-meta">
          The map&apos;s border shapes at this point in each year, {MIN_YEAR} to the present, with the names,
          statuses, notes and sources of the border details. Choose a period&apos;s years to show its borders on the map.
        </p>
      </header>

      <div role="status" className="ph-state">
        {!current && <p className="ph-loading">Loading the borders of every year…</p>}
        {current?.error && (
          <p className="event-detail-note">
            The borders could not be loaded.{" "}
            <button type="button" className="sp-btn" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </p>
        )}
      </div>

      {periods && allBlank && (
        <p className="event-detail-note">
          No shape in the map&apos;s border data covers this point in any year from {MIN_YEAR} to the present: it is
          sea, or land the border data does not draw (
          <a href={NO_SHAPE_DOC} target="_blank" rel="noreferrer">
            where there is no shape
            <span className="sp-sr-status"> (opens in a new tab)</span>
          </a>
          ).
        </p>
      )}

      {periods && !allBlank && (
        <ol className="ph-periods" aria-label={`Border shapes at ${label}, by period`}>
          {periods.map((p) => {
            const text = periodLabel(p, MAX_YEAR);
            const onMap = p.start <= mapYear && mapYear <= p.end;
            return (
              <li key={p.start} className={`ph-period${onMap ? " is-on-map" : ""}`}>
                <div className="ph-period-head">
                  <button
                    type="button"
                    className="sp-btn ph-years"
                    onClick={() => onChooseYears(p.start, Math.min(p.end, MAX_YEAR))}
                    aria-label={`${text}: show these years on the map`}
                  >
                    {text}
                  </button>
                  {onMap && <span className="ph-tag">on the map now</span>}
                </div>
                {p.items.length === 0 ? (
                  <p className="ph-blank">No shape in the map&apos;s border data (blank on the map)</p>
                ) : (
                  p.items.map((item) => <Shape key={`${item.name}|${item.status}`} item={item} />)
                )}
              </li>
            );
          })}
        </ol>
      )}
      {periods && someBlank && !allBlank && (
        <p className="ph-foot">
          Blank years: the border data has no shape for this point then (
          <a href={NO_SHAPE_DOC} target="_blank" rel="noreferrer">
            where there is no shape
            <span className="sp-sr-status"> (opens in a new tab)</span>
          </a>
          ).
        </p>
      )}

      <section className="event-detail-section event-detail-related ph-nearby" aria-labelledby="ph-nearby-title">
        <h3 id="ph-nearby-title">Events near this point</h3>
        <p className="rel-panel-title">Within {NEARBY_KM} km</p>
        {eventsLoading && !near.length ? (
          <p className="rel-empty">Loading events…</p>
        ) : !near.length ? (
          <p className="rel-empty">No event with a precise location is within {NEARBY_KM} km.</p>
        ) : (
          <div className="rel-body rel-body--side">
            <div className="rel-figure">
              <Compass
                items={shown}
                hotId={hotId}
                onHot={setHotId}
                onSelectEvent={onSelectEvent}
                label={(outer) =>
                  `Compass: the direction and distance of each nearby event from this point, north up, out to ${outer} km. The same events are listed below.`
                }
              />
              <p className="rel-caption">
                North up · edge of the circle: {compassScale(Math.max(...shown.map((i) => i.km))).outer} km
              </p>
            </div>
            <ol className="rel-list">
              {shown.map((r) => (
                <li key={r.id} className={hotId === r.id ? "rel-row--hot" : undefined}>
                  <EventLink
                    id={r.id}
                    onSelectEvent={onSelectEvent}
                    onMouseEnter={() => setHotId(r.id)}
                    onMouseLeave={() => setHotId(null)}
                    onFocus={() => setHotId(r.id)}
                    onBlur={() => setHotId(null)}
                  >
                    {r.title}
                  </EventLink>{" "}
                  <span className="event-detail-includes-year rel-when">
                    {[r.date_start ? String(r.date_start).slice(0, 4) : "", `${formatKm(r.km)} ${compassPoint(r.bearing)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {near.length > shown.length && (
          <p className="ph-all">
            <button type="button" className="sp-btn" onClick={onListNearby}>
              List all {near.length} in the results
            </button>
          </p>
        )}
        <p className="event-detail-related-note">
          Chosen only by distance, closest first; up to {RELATED_SHOWN} shown here. Only events with a precise location
          count.
        </p>
      </section>
    </article>
  );
}
