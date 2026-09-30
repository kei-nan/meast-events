// Our two reviews of the Wikipedia summary (data/framing-review.json, docs/framing-review.md),
// shown as two tabs above the text: the current wording check against Wikipedia's own
// guidelines, and the first review's overall-fairness judgement. A tab is coloured when its
// review found something and grey when it found nothing. Always boxed off from the text.

import { useRef } from "react";
import { REVIEW_TABS } from "../lib/reviewTabs.js";

const REPO = "https://github.com/kei-nan/atlas-wiki";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;

function contestUrl(event, review) {
  const title = `Framing review: ${event.title}`;
  const w = review.wording;
  const body = [
    `Event: ${event.title} (${event.id})`,
    "",
    "Wording check:",
    ...(w.observations.length ? w.observations.map((o) => `- ${o.guideline_name}: "${o.phrase}"`) : ["- nothing found"]),
    w.reviewer_note ? `- Reviewer's note: ${w.reviewer_note}` : "",
    "",
    `Overall fairness (first review): ${review.fairness.found ? review.fairness.note : "nothing found"}`,
    "",
    "Which review is wrong, and what shows it?",
    "",
  ].join("\n");
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=framing-review`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function tabStatus(tab, r) {
  if (!r.found) return "Nothing found";
  if (tab === "wording") {
    const n = r.observations.length;
    if (n === 0) return "Reviewer's note";
    return plural(n, "wording point", "wording points") + (r.reviewer_note ? " + note" : "");
  }
  return "Issue found";
}

const TAB_NAMES = { wording: "Wording check", fairness: "Overall fairness" };

function WordingPanel({ r }) {
  return (
    <>
      <p className="fr-method">
        Checks the wording against Wikipedia&apos;s own neutrality and wording guidelines. Reviewed {r.reviewed_on}.
      </p>
      {r.observations.length > 0 ? (
        <ul className="framing-obs">
          {r.observations.map((o, i) => (
            <li key={i}>
              <a href={o.url} target="_blank" rel="noreferrer" title={`${o.shortcut} (opens in a new tab)`} className="framing-obs-guideline">
                {o.guideline_name}
              </a>
              : <q>{o.phrase}</q>. {o.note}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fr-nothing">No wording found that Wikipedia&apos;s guidelines advise against.</p>
      )}
      {r.reviewer_note && (
        <p className="framing-review-note">
          <strong>Reviewer&apos;s note</strong> (a judgement, not a guideline): {r.reviewer_note}
        </p>
      )}
    </>
  );
}

function FairnessPanel({ r }) {
  return (
    <>
      <p className="fr-method">
        Judges the summary&apos;s overall fairness (emphasis, balance, omissions and contested claims), using the
        reviewer&apos;s general knowledge. This was our first review, on {r.reviewed_on}.
      </p>
      {r.found ? (
        <p>
          {r.note}
          {r.highlights.length > 0 && " The words in question are highlighted."}
        </p>
      ) : (
        <p className="fr-nothing">
          No one-sided framing found.
          {r.note ? ` ${r.note}` : ""}
        </p>
      )}
    </>
  );
}

export default function FramingReview({ event, tab, onTab }) {
  const review = event.framing_review;
  const tabRefs = useRef({});
  if (!review) return null;

  function onKeyDown(e) {
    const i = REVIEW_TABS.indexOf(tab);
    let next = null;
    if (e.key === "ArrowRight") next = REVIEW_TABS[(i + 1) % REVIEW_TABS.length];
    else if (e.key === "ArrowLeft") next = REVIEW_TABS[(i - 1 + REVIEW_TABS.length) % REVIEW_TABS.length];
    else if (e.key === "Home") next = REVIEW_TABS[0];
    else if (e.key === "End") next = REVIEW_TABS.at(-1);
    if (!next) return;
    e.preventDefault();
    onTab(next);
    tabRefs.current[next]?.focus();
  }

  const r = review[tab];
  return (
    <aside id="framing-review" className="framing-review" aria-labelledby="framing-review-title" tabIndex={-1}>
      <h3 id="framing-review-title">
        Framing review <span className="framing-review-owner">two reviews by us, not Wikipedia</span>
      </h3>
      <div className="fr-tabs" role="tablist" aria-labelledby="framing-review-title" onKeyDown={onKeyDown}>
        {REVIEW_TABS.map((t) => (
          <button
            key={t}
            ref={(el) => (tabRefs.current[t] = el)}
            type="button"
            role="tab"
            id={`fr-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="fr-panel"
            tabIndex={tab === t ? 0 : -1}
            className={`fr-tab fr-tab--${t}${review[t].found ? " fr-tab--found" : ""}`}
            onClick={() => onTab(t)}
          >
            <span className="fr-tab-name">{TAB_NAMES[t]}</span>
            <span className="fr-tab-status">{tabStatus(t, review[t])}</span>
          </button>
        ))}
      </div>
      <div
        id="fr-panel"
        role="tabpanel"
        aria-labelledby={`fr-tab-${tab}`}
        className={`fr-panel fr-panel--${tab}${r.found ? " fr-panel--found" : ""}`}
      >
        {tab === "wording" ? <WordingPanel r={r} /> : <FairnessPanel r={r} />}
      </div>
      {review.second_look && (
        <p className="framing-review-flag">
          The two reviews reached different conclusions on this summary, so it is marked for a second look by a
          person.
        </p>
      )}
      {review.stale && (
        <p className="framing-review-flag">
          Wikipedia&apos;s text has changed since these reviews, so they may no longer apply.
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
        Both reviews were made by Claude, an AI model made by Anthropic, and not checked line by line by a person.
        Neither judges whether the events happened, and the Wikipedia text below is shown unchanged.{" "}
        <a href={METHOD_URL} target="_blank" rel="noreferrer" title="Opens in a new tab">
          How we review
        </a>{" "}
        ·{" "}
        <a href={contestUrl(event, review)} target="_blank" rel="noreferrer" title="Opens in a new tab">
          Disagree with a review?
        </a>
      </p>
    </aside>
  );
}
