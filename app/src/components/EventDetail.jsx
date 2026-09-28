import { useEffect, useRef, useState } from "react";
import FramingReview, { FramingPointer } from "./FramingReview.jsx";
import { markSegments } from "../lib/highlights.js";

function showReview() {
  const box = document.getElementById("framing-review");
  if (!box) return;
  const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  box.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
  box.focus({ preventScroll: true });
}

function historyUrl(wikipediaUrl) {
  return wikipediaUrl + (wikipediaUrl.includes("?") ? "&" : "?") + "action=history";
}

/**
 * Selected-event view. Wikipedia's title/lead and Wikidata's class labels are
 * rendered as-is. `event.leadStatus` is "loading"/"error" while only the
 * snippet is available (the full lead is fetched lazily by the app).
 * `onBack` returns to the results list (the panel restores focus to the row).
 */
export default function EventDetail({ event, onBack }) {
  const headingRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [event.id]);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const yearRange =
    event.date_end && event.date_end.slice(0, 4) !== event.date_start.slice(0, 4)
      ? `${event.date_start.slice(0, 4)}–${event.date_end.slice(0, 4)}`
      : event.date_start.slice(0, 4);

  const quality =
    event.location_quality ??
    (event.coordinate_source?.startsWith("country-fallback") ? "approximate" : "precise");
  const classes = (event.wikidata_classes ?? []).filter(Boolean);
  const flags = (event.date_flags ?? []).filter(Boolean);
  const paragraphs = (event.extract ?? "").split(/\n+/).filter((p) => p.trim());
  const retrieved = event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  }

  return (
    <article className="event-detail" aria-labelledby="event-detail-title">
      <div className="event-detail-actions">
        <button type="button" className="sp-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to results
        </button>
        <button type="button" className="sp-btn" onClick={copyLink}>
          Copy link
        </button>
        <span className="sp-sr-status" role="status">
          {copied ? "Link copied" : ""}
        </span>
        {copied && <span className="event-detail-copied" aria-hidden="true">Link copied</span>}
      </div>
      {event.category && (
        <span className="event-detail-category">Category (our grouping): {event.category}</span>
      )}
      <h2 id="event-detail-title" ref={headingRef} tabIndex={-1}>
        {event.title}
      </h2>
      <p className="event-detail-meta">
        {yearRange} · {(event.countries ?? []).join(", ")}
      </p>
      {classes.length > 0 && (
        <p className="event-detail-classes">Wikidata classes: {classes.join(", ")}</p>
      )}
      {flags.length > 0 && (
        <p className="event-detail-note" role="note">
          Date unverified: {flags.join("; ")}. Dates are shown as Wikidata gives them.
        </p>
      )}
      <FramingPointer review={event.framing_review} />
      <div className="event-detail-extract">
        {paragraphs.length ? (
          paragraphs.map((p, i) => (
            <p key={i}>
              {markSegments(p, event.framing_review?.highlights).map((s, j) =>
                s.flagged ? (
                  <mark
                    key={j}
                    className={`framing-mark framing-mark--${event.framing_review.rating}`}
                    tabIndex={0}
                    role="button"
                    aria-describedby="framing-review-reason"
                    title="Flagged by our framing review. Select to read why."
                    onClick={showReview}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        showReview();
                      }
                    }}
                  >
                    {s.text}
                  </mark>
                ) : (
                  s.text
                )
              )}
            </p>
          ))
        ) : (
          <p>No summary available.</p>
        )}
      </div>
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
      <FramingReview event={event} />
      {quality === "approximate" && (
        <p className="event-detail-note">
          Approximate location: this event isn&apos;t tied to a single known site, so its
          marker is placed at a national capital. It is left out of drawn-area searches.
        </p>
      )}
      {quality === "none" && (
        <p className="event-detail-note">
          No map location: Wikipedia and Wikidata give no coordinates for this event, so it has no
          marker on the map and is left out of drawn-area searches.
        </p>
      )}
      {event.wikipedia_url && (
        <a href={event.wikipedia_url} target="_blank" rel="noreferrer">
          Read more on Wikipedia →
        </a>
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
        . Classes are Wikidata&apos;s labels (CC0).
      </p>
    </article>
  );
}
