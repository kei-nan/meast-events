// Test fixture: the Iraqi invasion of Kuwait as data/events.json and data/framing-review.json stored it before F16
// (commit d3a4574^, 2026-11-07): the fields the validator and the drift report read, copied as they were (the extract
// is its first paragraph only; retrieved_at, part_of, the revision ids and similar are left out). Wikidata's P580 was
// 2009-08-02 then; it was corrected there to 1990-08-02 while the site kept the old date and a note blaming Wikidata.
// Used by validate.test.js (stale date notes) and drift.test.js (the report's top section).
export const KUWAIT_PRE_F16 = Object.freeze({
  id: "iraqi-invasion-of-kuwait",
  title: "Iraqi invasion of Kuwait",
  date_start: "2009-08-02",
  date_end: "1990-08-04",
  countries: ["Kuwait"],
  category: "war",
  category_group: "war",
  wikidata_classes: ["battle", "invasion"],
  sitelinks: 45,
  wikidata_qid: "Q856650",
  resolved_qid: "Q856650",
  wikipedia_url: "https://en.wikipedia.org/wiki/Iraqi_invasion_of_Kuwait",
  extract:
    "The Iraqi invasion of Kuwait, codenamed Project 17, began on 2 August 1990 and marked the beginning of the Gulf War. After defeating the State of Kuwait on 4 August 1990, Iraq went on to militarily occupy the country for the next seven months. The invasion was condemned internationally, and the United Nations Security Council (UNSC) adopted numerous resolutions urging Iraq to withdraw from Kuwaiti territory. The Iraqi military, however, continued to occupy Kuwait and defied all orders by the UNSC. After initially establishing the \"Republic of Kuwait\" as a puppet state, Iraq annexed the entire country on 28 August 1990; northern Kuwait became the Saddamiyat al-Mitla' District and was merged into the existing Basra Governorate, while southern Kuwait was carved out as the all-new Kuwait Governorate. By November 1990, the adoption of UNSC Resolution 678 officially issued Iraq an ultimatum to withdraw unconditionally by 15 January 1991 or else be removed by \"all necessary means\" from Kuwaiti territory. In anticipation of a war with Iraq, the UNSC authorized the assembly of an American-led military coalition.",
  coordinates: null,
  coordinate_source: null,
  location_quality: "none",
  date_precision: "day",
  date_end_precision: "day",
  review_reasons: [
    "category_year_mismatch: Wikipedia year categories mention [1990] but none is within 1 year of 2009-1990",
    'part_of: Wikidata (P361) lists this event as part of "Gulf War" (Q37643); it may overlap with that larger event',
  ],
  extract_retrieved_at: "2026-09-26",
  date_flags: [
    "date_start_year_not_in_lead: start year 2009 (2009-08-02) is not within 1 year of any year in the Wikipedia lead [1990, 1991]",
    "date_order_invalid: Wikidata start (2009-08-02) is after end (1990-08-04); shown as Wikidata gives them",
    "wikipedia_dates_note: Wikipedia lead mentions 2 August 1990; 4 August 1990; 28 August 1990; 15 January 1991; Wikidata gives 2009-08-02 to 1990-08-04 (start year 2009 not in lead)",
  ],
  wikipedia_lead_dates: ["1990-08-02", "1990-08-04", "1990-08-28", "1991-01-15"],
});

// Its framing review's data note then (data/framing-review.json, d3a4574^).
export const KUWAIT_PRE_F16_DATA_NOTE = "The start date (2009) comes from Wikidata and is wrong; the invasion began on 2 August 1990.";
