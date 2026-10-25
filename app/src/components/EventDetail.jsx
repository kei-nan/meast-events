import { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FramingPointer } from "./FramingPointer.jsx";
import { FramingReviewFailed } from "./LoadFailed.jsx";
import ShareButton from "./ShareButton.jsx";
import { CitationPrint } from "./Citation.jsx";
import { rtlRuns, splitBidi } from "../lib/bidi.js";
import { otherArticleNote } from "../lib/otherArticle.js";
import { roundedLocationNote } from "../lib/coordPrecision.js";
import { dataFixUrl } from "../lib/dataFixes.js";
import { safeUrl } from "../lib/safeUrl.js";
import { showReview } from "../lib/showReview.js";
import { markSegments } from "../lib/highlights.js";
import { REVIEW_TABS, defaultReviewTab } from "../lib/reviewTabs.js";
import { countryLabel, countryShading, eventBorderYear } from "../lib/eventCountries.js";
import { MAX_YEAR, MIN_YEAR } from "../lib/years.js";
import { categoryWithBasis } from "../lib/categoryLabels.js";
import { formatEventDate } from "../lib/eventDate.js";
import { dateOrderNote } from "../lib/dateOrderNote.js";
import { wikidataUrl } from "../lib/partOf.js";
import { shownClasses } from "../lib/eventClasses.js";
import { fallbackLocationNote } from "../lib/fallbackPoint.js";
import { HAND_PICKED_NOTE } from "../lib/handPicked.js";
import { importOr } from "../lib/importOr.js";
import EventLink from "./EventLink.jsx";
import RelatedEvents from "./RelatedEvents.jsx";

// The review below the text loads with the first opened event, not with the page.
// If its code cannot be downloaded (retried once, then the page reloads once), a
// note says so in its place (lib/importOr.js).
const FramingReview = lazy(() => importOr(() => import("./FramingReview.jsx"), FramingReviewFailed));

// Children shown before "Show all N".
const INCLUDES_SHOWN = 8;

// Wikidata's "part of" (P361), as Wikidata gives it (lib/partOf.js): its labels,
// unchanged. A parent that is one of our events links to it; any other parent
// is plain text with a small link to its Wikidata item. Inline, in the line under the date.
function PartOf({ parents, onSelectEvent }) {
  if (!parents?.length) return null;
  return (
    <span className="event-detail-partof">
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
    </span>
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
    <section className="event-detail-section event-detail-includes" aria-labelledby={`${listId}-title`}>
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
// countryHighlight.js): its listed countries, with the borders of the year the
// map draws (`year`: the event's, or the range end when that is chosen under
// "Borders as of"), so the note never names a year the map is not showing.
function ShadingNote({ event, year: shownYear }) {
  const year = shownYear ?? eventBorderYear(event, MIN_YEAR, MAX_YEAR);
  const { shaded, unshaded } = countryShading(event.countries, year);
  if (!shaded.length) {
    return <> None of its listed countries has a border shape for {year} in our data, so nothing is shaded.</>;
  }
  return (
    <>
      {" "}The shaded area on the map is the event&apos;s listed countries ({shaded.join(", ")}) as of {year}, not a
      precise location.
      {unshaded.length > 0 && <> Not shaded: {unshaded.map(countryLabel).join(", ")} (no matching border shape for {year}).</>}
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
 * `onSelectEvent(id)` opens another event (the "Part of", "Includes" and related links).
 * `borderYear` is the year whose borders the map draws (for the shading note).
 */
export default function EventDetail({ event, borderYear = null, onBack, onShowOnMap, onSelectEvent }) {
  const headingRef = useRef(null);
  // The chosen review tab, remembered per event; otherwise the first tab whose review found something.
  const [chosenTab, setChosenTab] = useState(null);
  // The event whose full lead is open, so the next event starts collapsed.
  const [expandedId, setExpandedId] = useState(null);
  // The event whose "Includes" list is shown in full.
  const [allIncludesId, setAllIncludesId] = useState(null);
  // The related-events tab, kept while moving between events (a missing group falls back).
  const [relatedTab, setRelatedTab] = useState(null);
  // Set when "Read the review" opened the text, to scroll to the review once it has grown.
  const reviewAfterExpand = useRef(false);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [event.id]);

  // The sticky action row covers the top of the panel's scroller, so focus
  // moving up the article (Shift+Tab) would land under it: the scroller keeps
  // that much clear (scroll-padding-top), measured, since the row wraps to two
  // lines on a narrow phone. The row sticks at its `top` from the scroller's
  // content edge (inside its padding), plus a little air.
  const actionsRef = useRef(null);
  useLayoutEffect(() => {
    const row = actionsRef.current;
    const scroller = row?.closest(".sp-scroll");
    if (!row || !scroller) return;
    const update = () => {
      const top = parseFloat(getComputedStyle(row).top) || 0;
      const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      scroller.style.scrollPaddingTop = `${Math.max(0, Math.ceil(pad + top + row.offsetHeight + 8))}px`;
    };
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(row);
    window.addEventListener("resize", update); // the offset differs on phones (SidePanel.css)
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      scroller.style.scrollPaddingTop = "";
    };
  }, []);

  const quality = event.location_quality; // always set by lib/dataClient.js normalizeEvent
  // Only the classes on the event-class list, and only when they say more than the category does (lib/eventClasses.js).
  const classes = shownClasses(event);
  const showClasses = classes.length > 0;
  const itemUrl = wikidataUrl(event.wikidata_qid);
  const flags = (event.date_flags ?? []).filter(Boolean);
  // Unverified dates show only their years. date_precision comes with the full lead,
  // so the year alone shows until it arrives.
  const dateText = formatEventDate(event.date_start, event.date_end, {
    precision: event.date_precision,
    yearOnly: flags.length > 0,
  });
  // Only an end before the start gets a note; the other date flags are not shown.
  const dateNote = dateOrderNote(event);
  const review = event.framing_review;
  // Each paragraph as plain and highlighted pieces, with its right-to-left runs
  // (lib/bidi.js). Paragraphs past the first LEAD_PARAGRAPHS are hidden or
  // shown whole, never cut or rewritten.
  const paragraphs = (event.extract ?? "")
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) => ({ segs: markSegments(p, review?.highlights), runs: rtlRuns(p) }));
  const clamps = paragraphs.length > LEAD_PARAGRAPHS;
  const expanded = expandedId === event.id;
  const hiddenFlagged = clamps && paragraphs.slice(LEAD_PARAGRAPHS).some(({ segs }) => segs.some((s) => s.flagged));
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
  // Linked only when it is a plain web address (lib/safeUrl.js).
  const wikiUrl = safeUrl(event.wikipedia_url);
  const retrieved = event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null;

  // Names in Arabic, Hebrew or Persian script are isolated as right-to-left
  // (<bdi>), so the punctuation around them stays in place; the text is
  // unchanged. `at` is where the piece starts in its paragraph.
  const bidi = (text, runs, at) =>
    runs.length
      ? splitBidi(text, runs, at).map((piece, k) =>
          piece.rtl ? (
            <bdi key={k} dir="rtl" lang={piece.lang ?? undefined}>
              {piece.text}
            </bdi>
          ) : (
            piece.text
          )
        )
      : text;

  const renderParagraph = ({ segs, runs }, i) => (
    <p key={i}>
      {segs.map((s, j) => {
        const at = segs.slice(0, j).reduce((n, x) => n + x.text.length, 0);
        return s.flagged ? (
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
            {bidi(s.text, runs, at)}
          </mark>
        ) : (
          <Fragment key={j}>{bidi(s.text, runs, at)}</Fragment>
        );
      })}
    </p>
  );

  return (
    <article className="event-detail" aria-labelledby="event-detail-title">
      <div className="event-detail-actions" ref={actionsRef}>
        <button type="button" className="sp-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> Back<span className="event-detail-back-more"> to results</span>
        </button>
        {onShowOnMap && quality !== "none" && (
          <button type="button" className="sp-btn event-detail-showmap" onClick={onShowOnMap}>
            Show on map
          </button>
        )}
        {/* "Cite" once the full record (retrieval date, revision) is in. */}
        <ShareButton title={event.title} cite={event.leadStatus ? null : event} />
        {wikiUrl && (
          <a className="sp-btn event-detail-wiki" href={wikiUrl} target="_blank" rel="noreferrer">
            {/* "Read on" is for screen readers only, to keep the action row short. */}
            <span className="sp-sr-status">Read on </span>Wikipedia <span aria-hidden="true">↗</span>
            <span className="sp-sr-status"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      {/* Our category above the title, the title, then when and where and Wikidata's
          "part of". Where an entry's data comes from is in "About this entry" at the end. */}
      <header className="event-detail-head">
        {event.category && (
          <p className="event-detail-category">Category (our grouping): {categoryWithBasis(event)}</p>
        )}
        <h2 id="event-detail-title" ref={headingRef} tabIndex={-1}>
          {event.title}
        </h2>
        <p className="event-detail-meta">
          {dateText} · {(event.countries ?? []).map(countryLabel).join(", ")}
        </p>
        {event.part_of?.length > 0 && (
          <p className="event-detail-facts">
            <PartOf parents={event.part_of} onSelectEvent={onSelectEvent} />
          </p>
        )}
      </header>
      {dateNote && (
        <p className="event-detail-note" role="note">
          {dateNote}
        </p>
      )}
      {event.text_from_article && (
        <p className="event-detail-note" role="note">
          {otherArticleNote(event.text_from_article)}
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
      {/* One live region for the full text's state, in the page while the
          event is open, so a failure that comes later is announced. */}
      <div role="status">
        {event.leadStatus === "loading" && <p className="event-detail-note">Loading the full text…</p>}
        {event.leadStatus === "error" && (
          <p className="event-detail-note">
            The full text could not be loaded; only the opening is shown. Read the whole article on Wikipedia.
          </p>
        )}
      </div>
      {event.framing_review && (
        <Suspense fallback={null}>
          <FramingReview event={event} tab={reviewTab} onTab={openTab} />
        </Suspense>
      )}
      <Includes
        event={event}
        onSelectEvent={onSelectEvent}
        showAll={allIncludesId === event.id}
        onShowAll={() => setAllIncludesId(allIncludesId === event.id ? null : event.id)}
      />
      {/* Only with the full record: until it arrives, an empty tab's reason could be wrong. */}
      {!event.leadStatus && (
        <RelatedEvents event={event} tab={relatedTab} onTab={setRelatedTab} onSelectEvent={onSelectEvent} />
      )}
      <CitationPrint event={event} />
      <section className="event-detail-section event-detail-about" aria-labelledby="event-detail-about-title">
        <h3 id="event-detail-about-title">About this entry</h3>
        {quality === "approximate" && event.approximate_reason === "rounded" && (
          <p className="event-detail-note">
            {roundedLocationNote(event)} It is left out of drawn-area searches.
            <ShadingNote event={event} year={borderYear} />
          </p>
        )}
        {quality === "approximate" && event.approximate_reason !== "rounded" && (
          <p className="event-detail-note">
            {fallbackLocationNote(event)} It is left out of drawn-area searches.
            <ShadingNote event={event} year={borderYear} />
          </p>
        )}
        {quality === "none" && (
          <p className="event-detail-note">
            No map location: Wikipedia and Wikidata give no coordinates for this event, so it has no
            marker on the map and is left out of drawn-area searches.
            <ShadingNote event={event} year={borderYear} />
          </p>
        )}
        {event.hand_picked && <p className="event-detail-note">{HAND_PICKED_NOTE}</p>}
        {event.data_fixes?.length > 0 && (
          <p className="event-detail-fixes">
            Corrected by this project (
            {event.data_fixes.map((f, i) => (
              <Fragment key={f.ref}>
                {i > 0 && ", "}
                <a href={dataFixUrl(f)} target="_blank" rel="noreferrer">
                  {f.ref}
                  <span className="sp-sr-status"> (opens in a new tab)</span>
                </a>
              </Fragment>
            ))}{" "}
            in our log of data fixes).
          </p>
        )}
        {showClasses && (
          <p className="event-detail-classes">
            Wikidata classes on our event-class list: {classes.join(", ")}
            {itemUrl && (
              <>
                {" "}
                (all its classes:{" "}
                <a className="event-detail-wd" href={itemUrl} target="_blank" rel="noreferrer">
                  Wikidata<span aria-hidden="true"> ↗</span>
                  <span className="sp-sr-status"> item (opens in a new tab)</span>
                </a>
                )
              </>
            )}
          </p>
        )}
        {retrieved && <p className="event-detail-asof">Text retrieved {retrieved} from Wikipedia.</p>}
        <p className="event-detail-attribution">
          Text from Wikipedia, licensed{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 4.0
          </a>
          {wikiUrl ? (
            <>
              {" "}
              by{" "}
              <a href={historyUrl(wikiUrl)} target="_blank" rel="noreferrer">
                Wikipedia contributors
              </a>
            </>
          ) : (
            " by Wikipedia contributors"
          )}
          .{showClasses && <> Classes are Wikidata&apos;s labels (CC0).</>}
          {event.part_of?.length > 0 && <> &ldquo;Part of&rdquo; is Wikidata&apos;s statement, in its labels (CC0).</>}
        </p>
      </section>
    </article>
  );
}
