// The two framing review types, in tab order (see components/FramingReview.jsx).
export const REVIEW_TABS = ["fairness", "wording"];

// The tab to open first: the first review type that found something, else the first tab.
export function defaultReviewTab(review) {
  return REVIEW_TABS.find((t) => review?.[t]?.found) ?? REVIEW_TABS[0];
}

export const TAB_NAMES = { fairness: "Overall fairness", wording: "Wording check" };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What a tab says its review found (the notice above the text and the tab itself).
export function tabStatus(tab, r) {
  if (!r.found) return "Nothing found";
  return tab === "wording" ? plural(r.findings.length, "wording point", "wording points") : "Issue found";
}
