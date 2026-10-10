// The short notice above a reviewed Wikipedia summary. Kept apart from
// FramingReview.jsx so it renders with the event while the review's own code
// loads on its own (EventDetail lazy-loads it).

import { REVIEW_TABS, TAB_NAMES, tabStatus } from "../lib/reviewTabs.js";
import { showReview } from "../lib/showReview.js";

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
