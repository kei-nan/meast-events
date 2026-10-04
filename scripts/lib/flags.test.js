import test from "node:test";
import assert from "node:assert/strict";
import { firstSentence, exactDaysIn, monthPrecisionDayFlag, MONTH_DAY_FLAG, pruneDuplicateHints } from "./flags.js";

const OCT7 =
  "On October 7, 2023, a series of coordinated armed incursions from the blockaded Gaza Strip into the Gaza envelope of " +
  "southern Israel were carried out by Hamas. In response, Israel launched a major military operation in Gaza on 8 October 2023.";

test("firstSentence / exactDaysIn: both date styles, ranges, first sentence only", () => {
  assert.match(firstSentence(OCT7), /^On October 7, 2023, .* Hamas\.$/);
  assert.deepEqual(exactDaysIn(firstSentence(OCT7)), ["2023-10-07"]);
  assert.deepEqual(exactDaysIn("fought 13–26 May 2015 and from October 7–8, 2023"), ["2015-05-13", "2023-10-07"]);
  assert.deepEqual(exactDaysIn("in May 2015, in 1948"), []);
  assert.equal(firstSentence("First para.\n\nSecond para."), "First para.");
});

test("monthPrecisionDayFlag: month-precision date with an exact day of that month in the first sentence", () => {
  const f = monthPrecisionDayFlag({ date_start: "2023-10-01", date_precision: "month", extract: OCT7 });
  assert.ok(f.startsWith(`${MONTH_DAY_FLAG}: date_start 2023-10-01`));
  assert.match(f, /names 2023-10-07/);
  // day precision, another month, a day only after the first sentence, or no extract: no flag
  assert.equal(monthPrecisionDayFlag({ date_start: "2023-10-07", date_precision: "day", extract: OCT7 }), null);
  assert.equal(monthPrecisionDayFlag({ date_start: "2023-11-01", date_precision: "month", extract: OCT7 }), null);
  assert.equal(
    monthPrecisionDayFlag({ date_start: "2023-10-01", date_precision: "month", extract: "The war began in October 2023. It escalated on 8 October 2023." }),
    null
  );
  assert.equal(monthPrecisionDayFlag({ date_start: "2023-10-01", date_precision: "month", extract: null }), null);
});

test("pruneDuplicateHints: drops hints (and their review notes) to ids that are not published", () => {
  const ev = {
    id: "october-7-attacks",
    possible_duplicates: [
      { id: "ein-hashlosha-massacre", title: "Ein HaShlosha massacre", reason: "same Wikidata item (QID / resolved QID)" },
      { id: "gaza-war", title: "Gaza war", reason: "similar title" },
    ],
    review_reasons: [
      "part_of: x",
      'possible_duplicate: possible duplicate of "Ein HaShlosha massacre" (ein-hashlosha-massacre) - same Wikidata item (QID / resolved QID)',
      'possible_duplicate: possible duplicate of "Gaza war" (gaza-war) - similar title',
    ],
  };
  assert.deepEqual(pruneDuplicateHints(ev, new Set(["october-7-attacks", "gaza-war"])), ["ein-hashlosha-massacre"]);
  assert.deepEqual(ev.possible_duplicates.map((h) => h.id), ["gaza-war"]);
  assert.deepEqual(ev.review_reasons, ["part_of: x", 'possible_duplicate: possible duplicate of "Gaza war" (gaza-war) - similar title']);
  // nothing dangling: untouched; another reasons key (enrich-candidates keeps them in `_review`)
  const before = JSON.stringify(ev);
  assert.deepEqual(pruneDuplicateHints(ev, new Set(["gaza-war"])), []);
  assert.equal(JSON.stringify(ev), before);
  const r = { possible_duplicates: [{ id: "a" }], _review: ['possible_duplicate: possible duplicate of "A" (a) - x'] };
  pruneDuplicateHints(r, new Set(), "_review");
  assert.deepEqual(r, { possible_duplicates: [], _review: [] });
});
