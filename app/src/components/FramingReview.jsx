// Our framing review of the Wikipedia summary (data/framing-review.json, docs/framing-review.md):
// one list of findings. "Wording" findings cite Wikipedia's own guidelines; "fairness"
// findings are the reviewer's judgement of emphasis, balance and omissions. Shown for every
// event and always boxed off from the Wikipedia text it describes.

import { showReview } from "../lib/showReview.js";

const REPO = "https://github.com/kei-nan/atlas-wiki";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;

function contestUrl(event, review) {
  const title = `Framing review: ${event.title}`;
  const found = review.findings.map((x) =>
    x.kind === "wording" ? `- Wording (${x.guideline_name}): "${x.phrase}"` : `- Fairness: ${x.note}`
  );
  const body = [
    `Event: ${event.title} (${event.id})`,
    found.length ? `Current findings:\n${found.join("\n")}` : "Current findings: none",
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
  const n = review?.findings.length ?? 0;
  if (n === 0) return null;
  return (
    <p className="framing-pointer" role="note">
      Our framing review found {plural(n, "issue", "issues")} in this summary.
      {review.highlights.length > 0 && " The words in question are highlighted."}{" "}
      <button type="button" className="framing-pointer-link" onClick={showReview}>
        Read the review
      </button>
    </p>
  );
}

function Finding({ x }) {
  if (x.kind === "wording") {
    return (
      <li className="fr-finding fr-finding--wording">
        <span className="fr-kind">Wording</span>{" "}
        <a href={x.url} target="_blank" rel="noreferrer" title={`${x.shortcut} (opens in a new tab)`} className="framing-obs-guideline">
          {x.guideline_name}
        </a>
        : <q>{x.phrase}</q>. {x.note}
      </li>
    );
  }
  return (
    <li className="fr-finding fr-finding--fairness">
      <span className="fr-kind">Fairness</span> {x.note}
    </li>
  );
}

export default function FramingReview({ event }) {
  const review = event.framing_review;
  if (!review) return null;
  const n = review.findings.length;
  return (
    <aside
      id="framing-review"
      className={`framing-review${n ? " framing-review--found" : ""}`}
      aria-labelledby="framing-review-title"
      tabIndex={-1}
    >
      <h3 id="framing-review-title">
        Framing review <span className="framing-review-owner">our reading, not Wikipedia&apos;s</span>
      </h3>
      <p className="fr-summary">{n ? `${plural(n, "issue", "issues")} found` : "Nothing found"}</p>
      {n > 0 ? (
        <ul id="framing-review-findings" className="framing-obs">
          {review.findings.map((x, i) => (
            <Finding key={i} x={x} />
          ))}
        </ul>
      ) : (
        <p className="fr-nothing">
          No one-sided framing found, and no wording that Wikipedia&apos;s own guidelines advise against.
        </p>
      )}
      <p className="fr-legend">
        <strong>Wording</strong> findings cite one of Wikipedia&apos;s own neutrality and wording guidelines.{" "}
        <strong>Fairness</strong> findings are our judgement of emphasis, balance and what the summary leaves out.
      </p>
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
        It does not judge whether the events happened, and legal descriptions such as &ldquo;occupied&rdquo; or
        &ldquo;illegal&rdquo; are not assessed. The text above is shown unchanged.{" "}
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
