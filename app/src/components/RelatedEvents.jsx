import { useRef, useState } from "react";
import EventLink from "./EventLink.jsx";
import { formatEventDate } from "../lib/eventDate.js";
import { NEARBY_KM, RELATED_SHOWN } from "../lib/related.js";
import { compassLayout, compassPoint, compassScale, formatKm, stripLayout } from "../lib/relatedViz.js";

// Other events in this dataset by a shared Wikidata parent, place or date
// (lib/related.js), one tab per group that has any, in this fixed order. Nearby
// and same-time events also get a small diagram (lib/relatedViz.js) whose
// numbered dots match the numbered list; the list is the accessible version, so
// the diagrams are images to assistive technology and their dots are not tab stops.
const RELATED_TABS = [
  { key: "shared_parent", name: "Same wider events", title: "Also part of the same wider events" },
  { key: "nearby", name: "Nearby", title: `Within ${NEARBY_KM} km` },
  { key: "same_time", name: "Same time", title: "Within six months" },
];

const DOT_R = 9;

// A numbered dot in a diagram: clicking it opens the event, hovering it marks its list row.
function Dot({ x, y, n, item, hot, onHot, onSelectEvent, label }) {
  return (
    <g
      className={`rel-dot${hot ? " rel-dot--hot" : ""}`}
      transform={`translate(${x} ${y})`}
      onClick={() => onSelectEvent?.(item.id)}
      onMouseEnter={() => onHot(item.id)}
      onMouseLeave={() => onHot(null)}
    >
      <title>{`${item.title}: ${label}`}</title>
      <circle r={DOT_R} />
      <text dy="0.35em">{n}</text>
    </g>
  );
}

// Drawn as a compass face, not a target: one softly filled disc (its size is in
// the caption), the four directions outside its edge, no cross lines or inner
// rings, and a diamond for this event.
const FACE = [
  ["N", 0],
  ["E", 90],
  ["S", 180],
  ["W", 270],
];

function Compass({ items, hotId, onHot, onSelectEvent }) {
  const R = 84; // the farthest dot centre
  const disc = R + DOT_R + 4;
  const c = disc + 18;
  const size = 2 * c;
  const { outer } = compassScale(Math.max(0, ...items.map((i) => i.km)));
  const pts = compassLayout(items, { radius: R, gap: 2 * DOT_R + 2, inner: DOT_R + 8 });
  const at = (deg, r) => [c + r * Math.sin((deg * Math.PI) / 180), c - r * Math.cos((deg * Math.PI) / 180)];
  return (
    <svg
      className="rel-compass"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Compass: the direction and distance of each nearby event from this one, north up, out to ${outer} km. The same events are listed below.`}
    >
      <circle className="rel-face" cx={c} cy={c} r={disc} />
      {FACE.map(([label, deg]) => {
        const [x1, y1] = at(deg, disc - 5);
        const [x2, y2] = at(deg, disc);
        const [tx, ty] = at(deg, disc + 10);
        return (
          <g key={label}>
            <line className="rel-tick" x1={x1} y1={y1} x2={x2} y2={y2} />
            <text className={label === "N" ? "rel-north" : "rel-ring-label"} x={tx} y={ty} dy="0.35em" textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
      <rect className="rel-here" x={c - 4.5} y={c - 4.5} width={9} height={9} transform={`rotate(45 ${c} ${c})`} />
      {items.map((it, i) => (
        <Dot
          key={it.id}
          x={c + pts[i].x}
          y={c + pts[i].y}
          n={i + 1}
          item={it}
          hot={hotId === it.id}
          onHot={onHot}
          onSelectEvent={onSelectEvent}
          label={`${formatKm(it.km)} ${compassPoint(it.bearing)}`}
        />
      ))}
    </svg>
  );
}

function TimeStrip({ items, center, hotId, onHot, onSelectEvent }) {
  const W = 300;
  const pad = DOT_R + 4;
  const lane = 2 * DOT_R + 4;
  const layout = stripLayout(items, center, { width: W, gap: 2 * DOT_R + 2 });
  if (!layout) return null;
  const axisY = 8 + layout.lanes * lane;
  const h = axisY + 34;
  return (
    <svg
      className="rel-strip"
      viewBox={`${-pad} 0 ${W + 2 * pad} ${h}`}
      role="img"
      aria-label="Timeline: when each event listed below happened, six months before and after this one, which is in the middle."
    >
      <line className="rel-axis" x1={0} y1={axisY} x2={W} y2={axisY} />
      {layout.ticks.map((t) => (
        <g key={t.x}>
          <line className="rel-tick" x1={t.x} y1={axisY} x2={t.x} y2={axisY + (t.label ? 6 : 3)} />
          {t.label && (
            <text className="rel-ring-label" x={t.x} y={axisY + 17} textAnchor="middle">
              {t.label}
            </text>
          )}
        </g>
      ))}
      <line className="rel-here-line" x1={W / 2} y1={4} x2={W / 2} y2={axisY + 4} />
      <text className="rel-here-label" x={W / 2} y={axisY + 30} textAnchor="middle">
        this event
      </text>
      {items.map((it, i) => (
        <Dot
          key={it.id}
          x={layout.dots[i].x}
          y={axisY - DOT_R - 2 - layout.dots[i].lane * lane}
          n={i + 1}
          item={it}
          hot={hotId === it.id}
          onHot={onHot}
          onSelectEvent={onSelectEvent}
          label={formatEventDate(it.date_start, null, { precision: "day" })}
        />
      ))}
    </svg>
  );
}

function when(key, r) {
  if (key === "same_time") return formatEventDate(r.date_start, null, { precision: "day" });
  const year = r.date_start ? String(r.date_start).slice(0, 4) : "";
  if (key !== "nearby") return year;
  return [year, `${formatKm(r.km)} ${compassPoint(r.bearing)}`].filter(Boolean).join(" · ");
}

/**
 * `related` is the event's related groups (lib/related.js); `date` its date_start
 * (the middle of the time strip). `tab` is the chosen tab key, kept by the caller
 * across events; a group this event lacks falls back to its first group.
 */
export default function RelatedEvents({ related, date, tab, onTab, onSelectEvent }) {
  const [hotId, setHotId] = useState(null);
  const tabRefs = useRef({});
  const tabs = RELATED_TABS.filter((t) => related?.[t.key]?.length);
  if (!tabs.length) return null;
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const list = related[current.key];
  const single = tabs.length === 1;

  // Arrow keys step from the tab that has focus.
  function onKeyDown(e, from) {
    const i = tabs.indexOf(from);
    let next = null;
    if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs.at(-1);
    if (!next) return;
    e.preventDefault();
    onTab(next.key);
    tabRefs.current[next.key]?.focus();
  }

  const panel = (
    <>
      {current.key === "nearby" && (
        <>
          <Compass items={list} hotId={hotId} onHot={setHotId} onSelectEvent={onSelectEvent} />
          <p className="rel-caption">
            North up · edge of the circle: {compassScale(Math.max(...list.map((i) => i.km))).outer} km
          </p>
        </>
      )}
      {current.key === "same_time" && (
        <TimeStrip items={list} center={date} hotId={hotId} onHot={setHotId} onSelectEvent={onSelectEvent} />
      )}
      <ol className="rel-list">
        {list.map((r) => (
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
            <span className="event-detail-includes-year rel-when">{when(current.key, r)}</span>
          </li>
        ))}
      </ol>
    </>
  );

  return (
    <section className="event-detail-section event-detail-related" aria-labelledby="event-detail-related-title">
      <h3 id="event-detail-related-title">Related events in this dataset</h3>
      {single ? (
        <>
          <h4>{current.title}</h4>
          {panel}
        </>
      ) : (
        <>
          <div className="rel-tabs" role="tablist" aria-labelledby="event-detail-related-title">
            {tabs.map((t) => (
              <button
                key={t.key}
                ref={(el) => (tabRefs.current[t.key] = el)}
                type="button"
                role="tab"
                id={`rel-tab-${t.key}`}
                aria-selected={t === current}
                aria-controls="rel-panel"
                tabIndex={t === current ? 0 : -1}
                className="rel-tab"
                onClick={() => onTab(t.key)}
                onKeyDown={(e) => onKeyDown(e, t)}
              >
                <span className="rel-tab-name">{t.name}</span>
                <span className="rel-tab-count">{related[t.key].length}</span>
              </button>
            ))}
          </div>
          <div id="rel-panel" role="tabpanel" aria-labelledby={`rel-tab-${current.key}`}>
            <p className="rel-panel-title">{current.title}</p>
            {panel}
          </div>
        </>
      )}
      <p className="event-detail-related-note">
        Chosen only by Wikidata&apos;s &ldquo;part of&rdquo;, distance and date, closest first; up to {RELATED_SHOWN} each.
        Places count only when both locations are precise.
      </p>
    </section>
  );
}
