import { useEffect, useRef, useState } from "react";
import FramingReview, { FramingPointer } from "./FramingReview.jsx";
import { showReview } from "../lib/showReview.js";
import { markSegments } from "../lib/highlights.js";
import { REVIEW_TABS, defaultReviewTab } from "../lib/reviewTabs.js";
import { countryShading, eventBorderYear } from "../lib/eventCountries.js";
import { MAX_YEAR, MIN_YEAR } from "../lib/years.js";
import { categoryLabel } from "../lib/categoryLabels.js";
import { formatEventDate } from "../lib/eventDate.js";
import { wikidataUrl } from "../lib/partOf.js";

// Children shown before "Show all N".
const INCLUDES_SHOWN = 8;

const eventHref = (id) => `${import.meta.env.BASE_URL}?e=${encodeURIComponent(id)}`;

// A link to another event in the app: a real link (new tab, copy link work), but a
// plain click or Enter opens it in place through the app's own selection.
function EventLink({ id, onSelectEvent, children }) {
  return (
    <a
      href={eventHref(id)}
      onClick={(e) => {
        if (!onSelectEvent || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelectEvent(id);
      }}
    >
      {children}
    </a>
  );
}

// Wikidata's "part of" (P361), as Wikidata gives it (lib/partOf.js): its labels,
// unchanged. A parent that is one of our events links to it; any other parent
// is plain text with a small link to its Wikidata item.
function PartOf({ parents, onSelectEvent }) {
  if (!parents?.length) return null;
  return (
    <p className="event-detail-partof">
      Part of:{" "}
      {parents.map((p, i) => {
        const wd = !p.id && wikidataUrl(p.qid);
        return (
          <span key={p.qid}>
            {i > 0 && ", "}
            {p.id ? (
              <EventLink id={p.id} onSelectEvent={onSelectEvent}>
                {p.label}
              </EventLink>
            ) : (
              <>
                {p.label}
                {wd && (
                  <>
                    {" "}
                    <a className="event-detail-wd" href={wd} target="_blank" rel="noreferrer">
                      Wikidata<span aria-hidden="true"> ↗</span>
                      <span className="sp-sr-status"> item for {p.label} (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </>
            )}
          </span>
        );
      })}
    </p>
  );
}

// The events in this dataset that Wikidata lists as part of this one, oldest first.
function Includes({ event, onSelectEvent, showAll, onShowAll }) {
  const list = event.includes;
  if (!list?.length) return null;
  const clamps = list.length > INCLUDES_SHOWN;
  const shown = clamps && !showAll ? list.slice(0, INCLUDES_SHOWN) : list;
  const listId = "event-detail-includes";
  return (
    <section className="event-detail-includes" aria-labelledby={`${listId}-title`}>
      <h3 id={`${listId}-title`}>
        Includes {list.length === 1 ? "1 event" : `${list.length} events`} in this dataset
      </h3>
      <ul id={listId}>
        {shown.map((c) => (
          <li key={c.id}>
            <EventLink id={c.id} onSelectEvent={onSelectEvent}>
              {c.title}
            </EventLink>
            {c.date_start && <span className="event-detail-includes-year"> {String(c.date_start).slice(0, 4)}</span>}
          </li>
        ))}
      </ul>
      {clamps && (
        <button type="button" className="sp-btn" aria-expanded={showAll} aria-controls={listId} onClick={onShowAll}>
          {showAll ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

// What the map shades for an event without a precise location (see
// countryHighlight.js): its listed countries, with the borders of its year.
function ShadingNote({ event }) {
  const year = eventBorderYear(event, MIN_YEAR, MAX_YEAR);
  const { shaded, unshaded } = countryShading(event.countries, year);
  if (!shaded.length) {
    return <> None of its listed countries has a border shape for {year} in our data, so nothing is shaded.</>;
  }
  return (
    <>
      {" "}The shaded area on the map is the event&apos;s listed countries ({shaded.join(", ")}) as of {year}, not a
      precise location.
      {unshaded.length > 0 && <> Not shaded: {unshaded.join(", ")} (no matching border shape for {year}).</>}
    </>
  );
}

// Paragraphs of the lead shown before "Show full text".
const LEAD_PARAGRAPHS = 2;

function historyUrl(wikipediaUrl) {
  return wikipediaUrl + (wikipediaUrl.includes("?") ? "&" : "?") + "action=history";
}

/**
 * Selected-event view. Wikipedia's title/lead and Wikidata's class labels are
 * rendered as-is. `event.leadStatus` is "loading"/"error" while only the
 * snippet is available (the full lead is fetched lazily by the app).
 * `onBack` returns to the results list (the panel restores focus to the row).
 * `onShowOnMap` (optional) collapses the mobile sheet so the map is visible;
 * its button is shown on narrow screens only (SidePanel.css).
 * `onSelectEvent(id)` opens another event (the "Part of" and "Includes" links).
 */
export default function EventDetail({ event, onBack, onShowOnMap, onSelectEvent }) {
  const headingRef = useRef(null);
  // The chosen review tab, remembered per event; otherwise the first tab whose review found something.
  const [chosenTab, setChosenTab] = useState(null);
  // The event whose full lead is open, so the next event starts collapsed.
  const [expandedId, setExpandedId] = useState(null);
  // The event whose "Includes" list is shown in full.
  const [allIncludesId, setAllIncludesId] = useState(null);
  // Set when "Read the review" opened the text, to scroll to the review once it has grown.
  const reviewAfterExpand = useRef(false);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [event.id]);

  const quality =
    event.location_quality ??
    (event.coordinate_source?.startsWith("country-fallback") ? "approximate" : "precise");
  const classes = (event.wikidata_classes ?? []).filter(Boolean);
  // Shown only when they say more than the category does.
  const showClasses = classes.some((c) => c.toLowerCase() !== (event.category ?? "").toLowerCase());
  const flags = (event.date_flags ?? []).filter(Boolean);
  // Unverified dates show only their years. date_precision comes with the full lead,
  // so the year alone shows until it arrives.
  const dateText = formatEventDate(event.date_start, event.date_end, {
    precision: event.date_precision,
    yearOnly: flags.length > 0,
  });
  const review = event.framing_review;
  // Each paragraph as plain and highlighted pieces. Paragraphs past the first
  // LEAD_PARAGRAPHS are hidden or shown whole, never cut or rewritten.
  const paragraphs = (event.extract ?? "")
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) => markSegments(p, review?.highlights));
  const clamps = paragraphs.length > LEAD_PARAGRAPHS;
  const expanded = expandedId === event.id;
  const hiddenFlagged = clamps && paragraphs.slice(LEAD_PARAGRAPHS).some((segs) => segs.some((s) => s.flagged));
  const reviewTab = chosenTab?.id === event.id ? chosenTab.tab : defaultReviewTab(review);
  const openTab = (tab) => setChosenTab({ id: event.id, tab });
  // A highlight opens the tab of the review that flagged it (the fairness tab if both did).
  const showFinding = (kinds) => {
    openTab(REVIEW_TABS.find((t) => kinds.includes(t)) ?? reviewTab);
    showReview();
  };
  useEffect(() => {
    if (!expanded || !reviewAfterExpand.current) return;
    reviewAfterExpand.current = false;
    showReview();
  }, [expanded]);
  const openForReview = () => {
    if (expanded) return;
    reviewAfterExpand.current = true;
    setExpandedId(event.id);
  };
  const retrieved = event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null;

  const renderParagraph = (segs, i) => (
    <p key={i}>
      {segs.map((s, j) =>
        s.flagged ? (
          <mark
            key={j}
            className={`framing-mark ${s.kinds.map((k) => `framing-mark--${k}`).join(" ")}`}
            tabIndex={0}
            role="button"
            title="Flagged by our framing review. Select to read why."
            onClick={() => showFinding(s.kinds)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                showFinding(s.kinds);
              }
            }}
            aria-label={`Flagged by the ${s.kinds.map((k) => (k === "fairness" ? "overall fairness review" : "wording check")).join(" and the ")}: ${s.text}`}
          >
            {s.text}
          </mark>
        ) : (
          s.text
        )
      )}
    </p>
  );

  return (
    <article className="event-detail" aria-labelledby="event-detail-title">
      <div className="event-detail-actions">
        <button type="button" className="sp-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to results
        </button>
        {onShowOnMap && quality !== "none" && (
          <button type="button" className="sp-btn event-detail-showmap" onClick={onShowOnMap}>
            Show on map
          </button>
        )}
        {event.wikipedia_url && (
          <a className="sp-btn event-detail-wiki" href={event.wikipedia_url} target="_blank" rel="noreferrer">
            {/* "Read on" is for screen readers only, to keep the action row short. */}
            <span className="sp-sr-status">Read on </span>Wikipedia <span aria-hidden="true">↗</span>
            <span className="sp-sr-status"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      {event.category && (
        <span className="event-detail-category">Category (our grouping): {categoryLabel(event.category)}</span>
      )}
      <h2 id="event-detail-title" ref={headingRef} tabIndex={-1}>
        {event.title}
      </h2>
      <p className="event-detail-meta">
        {dateText} · {(event.countries ?? []).join(", ")}
      </p>
      <PartOf parents={event.part_of} onSelectEvent={onSelectEvent} />
      {showClasses && (
        <p className="event-detail-classes">Wikidata classes: {classes.join(", ")}</p>
      )}
      {flags.length > 0 && (
        <p className="event-detail-note" role="note">
          Date unverified: {flags.join("; ")}. Dates are shown as Wikidata gives them.
        </p>
      )}
      {/* Going to the review opens the full text, so every highlight it refers to is on the page. */}
      <div onClickCapture={hiddenFlagged ? openForReview : undefined}>
        <FramingPointer review={event.framing_review} />
      </div>
      <div className="event-detail-extract">
        {paragraphs.length ? (
          <>
            {paragraphs.slice(0, LEAD_PARAGRAPHS).map(renderParagraph)}
            {clamps && (
              <div id="event-detail-more" hidden={!expanded}>
                {paragraphs.slice(LEAD_PARAGRAPHS).map((segs, i) => renderParagraph(segs, i + LEAD_PARAGRAPHS))}
              </div>
            )}
          </>
        ) : (
          <p>No summary available.</p>
        )}
      </div>
      {clamps && (
        <div className="event-detail-more">
          <button
            type="button"
            className="sp-btn"
            aria-expanded={expanded}
            aria-controls="event-detail-more"
            onClick={() => setExpandedId(expanded ? null : event.id)}
          >
            {expanded ? "Show less" : "Show full text"}
          </button>
          {hiddenFlagged && !expanded && (
            <span className="event-detail-more-note">Includes highlighted wording</span>
          )}
        </div>
      )}
      {event.leadStatus === "loading" && (
        <p className="event-detail-note" role="status">
          Loading the full text…
        </p>
      )}
      {event.leadStatus === "error" && (
        <p className="event-detail-note" role="status">
          The full text could not be loaded; only the opening is shown. Read the whole article on Wikipedia.
        </p>
      )}
      {retrieved && (
        <p className="event-detail-asof">Text retrieved {retrieved} from Wikipedia.</p>
      )}
      <FramingReview event={event} tab={reviewTab} onTab={openTab} />
      <Includes
        event={event}
        onSelectEvent={onSelectEvent}
        showAll={allIncludesId === event.id}
        onShowAll={() => setAllIncludesId(allIncludesId === event.id ? null : event.id)}
      />
      {quality === "approximate" && (
        <p className="event-detail-note">
          Approximate location: this event isn&apos;t tied to a single known site, so its
          marker is placed at a national capital. It is left out of drawn-area searches.
          <ShadingNote event={event} />
        </p>
      )}
      {quality === "none" && (
        <p className="event-detail-note">
          No map location: Wikipedia and Wikidata give no coordinates for this event, so it has no
          marker on the map and is left out of drawn-area searches.
          <ShadingNote event={event} />
        </p>
      )}
      <p className="event-detail-attribution">
        Text from Wikipedia, licensed{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 4.0
        </a>
        {event.wikipedia_url ? (
          <>
            {" "}
            by{" "}
            <a href={historyUrl(event.wikipedia_url)} target="_blank" rel="noreferrer">
              Wikipedia contributors
            </a>
          </>
        ) : (
          " by Wikipedia contributors"
        )}
        .{showClasses && <> Classes are Wikidata&apos;s labels (CC0).</>}
        {event.part_of?.length > 0 && <> &ldquo;Part of&rdquo; is Wikidata&apos;s statement, in its labels (CC0).</>}
      </p>
    </article>
  );
}
