// Our own reading of how the Wikipedia summary is framed (data/framing-review.json,
// docs/framing-review.md). Shown for every event, including those rated 0, and
// always boxed off from the Wikipedia text it describes.

const REPO = "https://github.com/kei-nan/atlas-wiki";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;

function contestUrl(event, review) {
  const title = `Framing review: ${event.title}`;
  const body = [
    `Event: ${event.title} (${event.id})`,
    `Current rating: ${review.rating_label}${review.leans ? ` (${review.leans})` : ""}`,
    "",
    "What is wrong with this rating, and what source shows it?",
    "",
  ].join("\n");
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=framing-review`;
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Short notice above the Wikipedia text for every flagged summary, so nobody reads a
// flagged text without knowing. The full explanation stays in the box below the text.
export function FramingPointer({ review }) {
  if (!review || review.rating === 0) return null;
  const marked = review.highlights?.length > 0;
  let lead;
  if (review.rating === 3) lead = "Our framing review found that this summary states a contested conclusion as fact.";
  else if (review.rating === 2) lead = "Our framing review found that this summary leans to one side.";
  else lead = "Our framing review found a minor lean in this summary.";
  const where = marked
    ? "The words in question are highlighted; the review below the text explains why."
    : "The issue is what it leaves out or how it frames the event as a whole; the review below the text explains.";
  return (
    <p className={`framing-pointer framing-pointer--${review.rating}`} role="note">
      {lead} {where}
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
      <p className="framing-review-verdict">
        <span className={`framing-review-rating framing-review-rating--${review.rating}`}>{review.rating_label}</span>
        {review.leans && <span className="framing-review-leans">Leans {lowerFirst(review.leans)}</span>}
      </p>
      {!(review.rating === 0 && review.reason.startsWith("No one-sided framing found")) && (
        <p id="framing-review-reason">{review.reason}</p>
      )}
      {review.stale && (
        <p className="framing-review-stale">
          Wikipedia&apos;s text has changed since this review ({review.reviewed_on}), so the rating may no longer
          apply.
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
        This is our opinion of how the summary is framed, not a fact-check; the text above is shown unchanged.{" "}
        <a href={METHOD_URL} target="_blank" rel="noreferrer" title="Opens in a new tab">
          How we review
        </a>{" "}
        ·{" "}
        <a href={contestUrl(event, review)} target="_blank" rel="noreferrer" title="Opens in a new tab">
          Disagree with this rating?
        </a>
      </p>
    </aside>
  );
}
