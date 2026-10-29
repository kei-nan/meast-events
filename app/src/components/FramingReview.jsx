// Our framing review of the Wikipedia summary (data/framing-review.json, docs/framing-review.md).
// Two review types, kept separate as two tabs below the text: "Overall fairness" (our
// judgement of emphasis, balance and omissions) and "Wording check" (against Wikipedia's own
// guidelines). A tab is coloured when its review found something and grey when it found
// nothing. Always boxed off from the Wikipedia text it describes.

import { useEffect, useRef, useState } from "react";
import { REVIEW_TABS, TAB_NAMES, tabStatus } from "../lib/reviewTabs.js";
import { safeUrl } from "../lib/safeUrl.js";
import { categoryNoteOutdated, categoryShortLabel } from "../lib/categoryLabels.js";

// The Popover API (Safari 17+, Chrome 114+, Firefox 125+). Where it is missing, the
// popover attribute does nothing (the note would show all the time) and
// matches(":popover-open") throws, so the note is a plain toggle instead.
const HAS_POPOVER = typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

const REPO = "https://github.com/kei-nan/meast-events";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;

// x.url opens the guideline as it read when the review was made (app/scripts/split-data.mjs).
const guidelineTitle = (x) => `${x.shortcut}, the version current when this review was made (opens in a new tab)`;

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
              {/* The guideline link comes from the data: http(s) only (lib/safeUrl.js). */}
              {safeUrl(x.url) ? (
                <a href={safeUrl(x.url)} target="_blank" rel="noreferrer" title={guidelineTitle(x)} className="framing-obs-guideline">
                  {x.guideline_name}
                </a>
              ) : (
                x.guideline_name
              )}
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
  const aboutRef = useRef(null);
  const aboutBtnRef = useRef(null);

  // "Reviewed by AI" opens a short note in the browser's popover (tap, click or
  // Enter; Esc or a click elsewhere closes it). It floats above the panel, under its
  // button or above it when there is no room below, and closes when the panel
  // scrolls or the window resizes rather than drifting away from the button.
  // Without the Popover API the button shows and hides the note in the page flow,
  // below the links (.fr-ai-note--inline); Escape closes it there too.
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    const p = aboutRef.current;
    if (!p) return;
    if (!HAS_POPOVER) {
      if (!noteOpen) return;
      const onEscapeInline = (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        setNoteOpen(false);
      };
      document.addEventListener("keydown", onEscapeInline, true);
      return () => document.removeEventListener("keydown", onEscapeInline, true);
    }
    // Never throws, even on an engine with showPopover but not the pseudo-class.
    const isOpen = () => {
      try {
        return p.matches(":popover-open");
      } catch {
        return false;
      }
    };
    const place = (e) => {
      if (e.newState !== "open") return;
      const b = aboutBtnRef.current.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 16);
      p.style.width = `${w}px`;
      p.style.left = `${Math.max(8, Math.min(b.left, window.innerWidth - w - 8))}px`;
      const h = p.offsetHeight;
      p.style.top = `${b.bottom + 6 + h <= window.innerHeight - 8 ? b.bottom + 6 : Math.max(8, b.top - 6 - h)}px`;
    };
    const close = () => isOpen() && p.hidePopover();
    // One Escape does one thing (lib/escapeKey.js): with the note open it closes only
    // the note, and is marked handled before the panel's Escape (Back) sees it.
    const onEscape = (e) => {
      if (e.key !== "Escape" || !isOpen()) return;
      e.preventDefault();
      p.hidePopover();
    };
    const scroller = p.closest(".sp-scroll");
    p.addEventListener("toggle", place);
    scroller?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      p.removeEventListener("toggle", place);
      scroller?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [review, noteOpen]);

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
  // A section, not an aside: it sits inside the side panel, which is already a
  // complementary landmark, and landmarks of that kind must not nest.
  return (
    <section id="framing-review" className="framing-review" aria-labelledby="framing-review-title" tabIndex={-1}>
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
          {/* Written about a group the grouping rule no longer gives (docs/DATA_POLICY.md): kept, and dated by what it describes. */}
          {categoryNoteOutdated(review.category_note, event.category) &&
            ` (Written when this entry was grouped as “${categoryShortLabel(
              categoryNoteOutdated(review.category_note, event.category)
            )}”; the grouping rule now gives “${categoryShortLabel(event.category)}”.)`}
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
      {/* Short on purpose: "AI" stays on every review, and what that means is one tap away. */}
      <p className="framing-review-meta">
        <button
          ref={aboutBtnRef}
          type="button"
          className="fr-ai-btn"
          {...(HAS_POPOVER
            ? { popoverTarget: "fr-ai-note" }
            : { "aria-expanded": noteOpen, "aria-controls": "fr-ai-note", onClick: () => setNoteOpen((o) => !o) })}
          aria-label="Reviewed by AI: what this means"
        >
          Reviewed by AI
        </button>{" "}
        ·{" "}
        <a href={METHOD_URL} target="_blank" rel="noreferrer" title="Opens in a new tab">
          How we review
        </a>{" "}
        ·{" "}
        <a href={contestUrl(event, review)} target="_blank" rel="noreferrer" title="Opens in a new tab">
          Disagree with this review?
        </a>
      </p>
      <div
        id="fr-ai-note"
        ref={aboutRef}
        {...(HAS_POPOVER ? { popover: "auto" } : { hidden: !noteOpen })}
        className={HAS_POPOVER ? "fr-ai-note" : "fr-ai-note fr-ai-note--inline"}
      >
        This review was made by Claude, an AI model made by Anthropic, and not checked line by line by a person. It
        looks at how the summary is written, not whether the events happened, and it does not change the Wikipedia
        text (the article&apos;s lead section as plain text, references removed).
      </div>
    </section>
  );
}
