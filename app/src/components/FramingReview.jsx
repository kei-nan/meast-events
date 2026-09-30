// Where the Wikipedia summary departs from Wikipedia's own wording guidelines, plus a
// separately labelled reviewer's note (data/framing-review.json, docs/framing-review.md).
// Shown for every event and always boxed off from the Wikipedia text it describes.

import { showReview } from "../lib/showReview.js";

const REPO = "https://github.com/kei-nan/atlas-wiki";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;

function contestUrl(event, review) {
  const title = `Framing review: ${event.title}`;
  const found = review.observations.map((o) => `- ${o.guideline_name}: "${o.phrase}"`);
  const body = [
    `Event: ${event.title} (${event.id})`,
    found.length ? `Current observations:\n${found.join("\n")}` : "Current observations: none",
    review.reviewer_note ? `Reviewer's note: ${review.reviewer_note}` : "",
    "",
    "What is wrong with this review, and what shows it?",
    "",
  ].join("\n");
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=framing-review`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Short notice above the Wikipedia text, so nobody reads a flagged summary without knowing.
// It says what was found, never how "biased" the summary is or toward whom.
export function FramingPointer({ review }) {
  if (!review) return null;
  const n = review.observations.length;
  if (n === 0 && !review.reviewer_note) return null;
  const parts = [];
  if (n > 0) {
    parts.push(
      `Our framing review found ${plural(n, "wording point", "wording points")} in this summary that Wikipedia's own guidelines advise against.`
    );
    if (review.highlights.length) parts.push(n === 1 ? "It is highlighted." : "They are highlighted.");
  }
  if (review.reviewer_note) {
    parts.push(n > 0 ? "It also has a reviewer's note." : "Our framing review has a reviewer's note on how this summary tells the event.");
  }
  return (
    <p className="framing-pointer" role="note">
      {parts.join(" ")}{" "}
      <button type="button" className="framing-pointer-link" onClick={showReview}>
        Read the review
      </button>
    </p>
  );
}

export default function FramingReview({ event }) {
  const review = event.framing_review;
  if (!review) return null;
  return (
    <aside id="framing-review" className="framing-review" aria-labelledby="framing-review-title" tabIndex={-1}>
      <h3 id="framing-review-title">
        Framing review <span className="framing-review-owner">our reading, not Wikipedia&apos;s</span>
      </h3>
      {review.observations.length > 0 ? (
        <>
          <p>Wording that Wikipedia&apos;s own guidelines advise against:</p>
          <ul id="framing-review-observations" className="framing-obs">
            {review.observations.map((o, i) => (
              <li key={i}>
                <a href={o.url} target="_blank" rel="noreferrer" title={`${o.shortcut} (opens in a new tab)`} className="framing-obs-guideline">
                  {o.guideline_name}
                </a>
                : <q>{o.phrase}</q>. {o.note}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No wording found that Wikipedia&apos;s own neutrality and wording guidelines advise against.</p>
      )}
      {review.reviewer_note && (
        <p className="framing-review-note">
          <strong>Reviewer&apos;s note</strong> (a judgement, not a guideline): {review.reviewer_note}
        </p>
      )}
      {review.second_look && (
        <p className="framing-review-flag">
          An earlier review of this summary reached a different conclusion, so it is marked for a second look by a
          person.
        </p>
      )}
      {review.stale && (
        <p className="framing-review-flag">
          Wikipedia&apos;s text has changed since this review ({review.reviewed_on}), so it may no longer apply.
        </p>
      )}
      {review.category_note && (
        <p>
          <strong>Category note:</strong> {review.category_note}
        </p>
      )}
      {review.data_note && (
        <p>
          <strong>Data note:</strong> {review.data_note}
        </p>
      )}
      {review.disclosure && (
        <p>
          <strong>Disclosure:</strong> {review.disclosure}
        </p>
      )}
      <p className="framing-review-meta">
        Reviewed {review.reviewed_on} by Claude, an AI model made by Anthropic, not checked line by line by a person.
        It looks at wording only: it does not judge whether the events happened, and legal descriptions such as
        &ldquo;occupied&rdquo; or &ldquo;illegal&rdquo; are not assessed. The text above is shown unchanged.{" "}
        <a href={METHOD_URL} target="_blank" rel="noreferrer" title="Opens in a new tab">
          How we review
        </a>{" "}
        ·{" "}
        <a href={contestUrl(event, review)} target="_blank" rel="noreferrer" title="Opens in a new tab">
          Disagree with this review?
        </a>
      </p>
    </aside>
  );
}
