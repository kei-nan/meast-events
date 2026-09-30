// The two framing reviews, in tab order (see components/FramingReview.jsx).
export const REVIEW_TABS = ["fairness", "wording"];

// The tab to open first: the first tab whose review found something, else the first tab.
export function defaultReviewTab(review) {
  return REVIEW_TABS.find((t) => review?.[t]?.found) ?? REVIEW_TABS[0];
}
