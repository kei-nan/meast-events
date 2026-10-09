// Our framing review of the Wikipedia summary (data/framing-review.json, docs/framing-review.md).
// Two review types, kept separate as two tabs below the text: "Overall fairness" (our
// judgement of emphasis, balance and omissions) and "Wording check" (against Wikipedia's own
// guidelines). A tab is coloured when its review found something and grey when it found
// nothing. Always boxed off from the Wikipedia text it describes.

import { useRef } from "react";
import { REVIEW_TABS } from "../lib/reviewTabs.js";
import { showReview } from "../lib/showReview.js";

const REPO = "https://github.com/kei-nan/meast-events";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;

const TAB_NAMES = { fairness: "Overall fairness", wording: "Wording check" };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// x.url opens the guideline as it read when the review was made (app/scripts/split-data.mjs).
const guidelineTitle = (x) => `${x.shortcut}, the version current when this review was made (opens in a new tab)`;

function tabStatus(tab, r) {
  if (!r.found) return "Nothing found";
  return tab === "wording" ? plural(r.findings.length, "wording point", "wording points") : "Issue found";
}

function contestUrl(event, review) {
  const title = `Framing review: ${event.title}`;
  const w = review.wording.findings;
  const body = [
    `Event: ${event.title} (${event.id})`,
    "",
    `Overall fairness: ${review.fairness.found ? review.fairness.note : "nothing found"}`,
    "",
    "Wording check:",
    ...(w.length ? w.map((x) => `- ${x.guideline_name}: "${x.phrase}"`) : ["- nothing found"]),
    "",
    "What is wrong with this review, and what shows it?",
    "",
  ].join("\n");
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=framing-review`;
}

// Short notice above the Wikipedia text, so nobody reads a flagged summary without knowing.
// It says what was found, never how "biased" the summary is or toward whom.
export function FramingPointer({ review }) {
  if (!review || (!review.fairness.found && !review.wording.found)) return null;
  const parts = REVIEW_TABS.filter((t) => review[t].found).map((t) => `${TAB_NAMES[t].toLowerCase()} (${tabStatus(t, review[t]).toLowerCase()})`);
  return (
    <p className="framing-pointer" role="note">
      Our framing review found something in this summary: {parts.join(" and ")}.
      {review.highlights.length > 0 && " The words in question are highlighted."}{" "}
      <button type="button" className="framing-pointer-link" onClick={showReview}>
        Read the review
      </button>
    </p>
  );
}

function FairnessPanel({ r }) {
  return (
    <>
      <p className="fr-method">
        Our judgement of the summary&apos;s overall fairness: emphasis, balance, what it leaves out, and contested
        claims stated as fact.
      </p>
      {r.found ? <p>{r.note}</p> : <p className="fr-nothing">No one-sided framing found.</p>}
    </>
  );
}

function WordingPanel({ r }) {
  return (
    <>
      <p className="fr-method">Checks the wording against Wikipedia&apos;s own neutrality and wording guidelines.</p>
      {r.found ? (
        <ul className="framing-obs">
          {r.findings.map((x, i) => (
            <li key={i}>
              <a href={x.url} target="_blank" rel="noreferrer" title={guidelineTitle(x)} className="framing-obs-guideline">
                {x.guideline_name}
              </a>
              : <q>{x.phrase}</q>. {x.note}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fr-nothing">No wording found that Wikipedia&apos;s guidelines advise against.</p>
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
        Framing review <span className="framing-review-owner">our reading, not Wikipedia&apos;s</span>
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
        {tab === "fairness" ? <FairnessPanel r={r} /> : <WordingPanel r={r} />}
      </div>
      {review.stale && (
        <p className="framing-review-flag">
          Wikipedia&apos;s text has changed since this review, so it may no longer apply.
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
        Reviewed by Claude, an AI model made by Anthropic, and not checked line by line by a person. It does not judge
        whether the events happened, and the Wikipedia text above is shown unchanged.{" "}
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
