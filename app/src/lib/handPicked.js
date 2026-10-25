// The note on the hand-picked seed events (data/seed-events.json; scripts/split-data.mjs
// publishes `hand_picked` on every event without a discovery sitelinks count, the same test
// as scripts/build-selection-funnel.js). Their dates and countries were typed by hand, so
// "copied from Wikidata" does not hold for them (docs/DATA_POLICY.md).
export const HAND_PICKED_NOTE =
  "Hand-picked event: it is on this project’s own list of events, and its dates and countries were typed by hand for that list, so they can differ from Wikidata’s.";
