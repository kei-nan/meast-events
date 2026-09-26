import { useEffect, useRef, useState } from "react";

function historyUrl(wikipediaUrl) {
  return wikipediaUrl + (wikipediaUrl.includes("?") ? "&" : "?") + "action=history";
}

/**
 * Selected-event view. Wikipedia's title/extract are rendered as-is.
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

  const approximate =
    event.location_quality === "approximate" ||
    event.coordinate_source?.startsWith("country-fallback");

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
        <span className="event-detail-category">Wikidata class: {event.category}</span>
      )}
      <h2 id="event-detail-title" ref={headingRef} tabIndex={-1}>
        {event.title}
      </h2>
      <p className="event-detail-meta">
        {yearRange} · {(event.countries ?? []).join(", ")}
      </p>
      <p className="event-detail-extract">{event.extract ?? "No summary available."}</p>
      {approximate && (
        <p className="event-detail-note">
          Approximate location: this event isn&apos;t tied to a single known site, so its
          marker is placed at a national capital. It is left out of drawn-area searches.
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
        . Extracts may be shortened from the original article.
      </p>
    </article>
  );
}
