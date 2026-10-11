import test from "node:test";
import assert from "node:assert/strict";
import { dateOrderNote } from "./dateOrderNote.js";

const passover = {
  date_start: "2002-03-27",
  date_end: "2002-01-01",
  date_precision: "day",
  date_flags: [
    "date_order_invalid: Wikidata start (2002-03-27) is after end (2002-01-01); shown as Wikidata gives them",
    "wikipedia_dates_note: Wikipedia lead mentions 27 March 2002; Wikidata gives 2002-03-27 to 2002-01-01",
  ],
  wikipedia_lead_dates: ["2002-03-27"],
};

test("dateOrderNote: plain language, no flag codes, one Wikipedia date", () => {
  assert.equal(
    dateOrderNote(passover),
    "Wikidata gives this event’s end (1 January 2002) as before its start (27 March 2002); Wikipedia gives 27 March 2002."
  );
});

test("dateOrderNote: several lead dates, or only years, are listed", () => {
  assert.equal(
    dateOrderNote({ ...passover, wikipedia_lead_dates: ["1990-08-02", "1990-08-04", "1991-01-15"] }),
    "Wikidata gives this event’s end (1 January 2002) as before its start (27 March 2002); Wikipedia’s summary mentions 2 August 1990, 4 August 1990 and 15 January 1991."
  );
  assert.equal(
    dateOrderNote({ ...passover, wikipedia_lead_dates: ["1952", "1979"] }),
    "Wikidata gives this event’s end (1 January 2002) as before its start (27 March 2002); Wikipedia’s summary mentions the years 1952 and 1979."
  );
  assert.equal(
    dateOrderNote({ ...passover, wikipedia_lead_dates: undefined }),
    "Wikidata gives this event’s end (1 January 2002) as before its start (27 March 2002)."
  );
});

test("dateOrderNote: null for the other date flags, and for dates in order", () => {
  assert.equal(
    dateOrderNote({
      date_start: "1930-01-01",
      date_flags: ["date_start_year_not_in_lead: start year 1930 (1930-01-01) is not within 1 year of any year in the Wikipedia lead [1932]"],
    }),
    null
  );
  assert.equal(dateOrderNote({ date_start: "1914-07-28", date_end: "1918-11-11", date_flags: ["date_source_adjusted: x"] }), null);
  assert.equal(dateOrderNote({ ...passover, date_end: "2002-04-01" }), null, "a stale flag with dates in order");
  assert.equal(dateOrderNote({ ...passover, date_flags: [] }), null);
  assert.equal(dateOrderNote(null), null);
});
