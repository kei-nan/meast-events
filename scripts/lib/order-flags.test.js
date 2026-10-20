import test from "node:test";
import assert from "node:assert/strict";
import { refreshOrderFlags } from "./order-flags.js";

// Passover massacre (Q2660905): P585 2002-03-27, P582 "2002" (year precision).
const passover = (over = {}) => ({
  id: "passover-massacre",
  wikidata_qid: "Q2660905",
  date_start: "2002-03-27",
  date_end: "2002-01-01",
  extract: "The Passover massacre was a suicide bombing carried out by Hamas at the Park Hotel in Netanya, Israel on 27 March 2002.",
  date_flags: [
    "date_order_invalid: Wikidata start (2002-03-27) is after end (2002-01-01); shown as Wikidata gives them",
    "wikipedia_dates_note: Wikipedia lead mentions 27 March 2002; Wikidata gives 2002-03-27 to 2002-01-01",
  ],
  wikipedia_lead_dates: ["2002-03-27"],
  review_reasons: ["part_of: Second Intifada"],
  needs_review: true,
  ...over,
});
const COARSE =
  "date_end_precision_coarse: Wikidata end time 2002-01-01 has only year precision (the year runs to 2002-12-31), so it is not before the start (2002-03-27); stored as Wikidata gives it";

test("refreshOrderFlags: the re-derived order flags replace the old ones; lead dates go with date_order_invalid", () => {
  const kept = passover();
  const fresh = passover({ date_flags: [COARSE], wikipedia_lead_dates: undefined });
  assert.equal(refreshOrderFlags(kept, fresh), true);
  assert.deepEqual(kept.date_flags, [COARSE]);
  assert.equal("wikipedia_lead_dates" in kept, false);
  assert.equal(kept.needs_review, true, "still has a review reason");
  assert.deepEqual(Object.keys(kept), Object.keys(passover()).filter((k) => k !== "wikipedia_lead_dates"), "key order kept");
  assert.equal(refreshOrderFlags(kept, fresh), false, "idempotent");
});

test("refreshOrderFlags: other date flags of the kept record stay, in front", () => {
  const adjusted = "date_source_adjusted: Wikidata P585 equals the item's end time (P582); used P580";
  const kept = passover({ date_flags: [adjusted, ...passover().date_flags] });
  refreshOrderFlags(kept, passover({ date_flags: ["date_start_year_not_in_lead: x", COARSE] }));
  assert.deepEqual(kept.date_flags, [adjusted, COARSE], "a fresh non-order flag is not copied");
});

test("refreshOrderFlags: nothing changes unless dates and extract are the same", () => {
  const fresh = passover({ date_flags: [COARSE] });
  for (const over of [{ date_start: "2002-03-28" }, { date_end: null }, { extract: "Another lead." }]) {
    const kept = passover(over);
    const before = JSON.stringify(kept);
    assert.equal(refreshOrderFlags(kept, fresh), false);
    assert.equal(JSON.stringify(kept), before);
  }
  assert.equal(refreshOrderFlags(passover(), null), false);
});

test("refreshOrderFlags: no flags left means no date_flags key and needs_review from the review reasons", () => {
  const kept = passover({ review_reasons: [] });
  assert.equal(refreshOrderFlags(kept, passover({ date_flags: [], wikipedia_lead_dates: [] })), true);
  assert.equal("date_flags" in kept, false);
  assert.equal(kept.needs_review, false);
});
