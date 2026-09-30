// The two framing reviews, in tab order (see components/FramingReview.jsx).
export const REVIEW_TABS = ["wording", "fairness"];

// The tab to open first: the first review that found something, else the wording check.
export function defaultReviewTab(review) {
  return REVIEW_TABS.find((t) => review?.[t]?.found) ?? "wording";
}
