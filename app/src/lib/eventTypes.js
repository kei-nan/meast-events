// JSDoc types for the event data: no runtime code. Referenced from JSDoc as
//   @param {import("./eventTypes.js").Event} e
// so editors (and a future `// @ts-check`) know the shape. eventTypes.test.js
// keeps these lists equal to the data: EventRecord to the validator's field
// table, Event to what the app's records actually carry.
//
// Shown as the sources give them: titles, dates, countries and extracts are
// never rewritten (docs/DATA_POLICY.md).

/**
 * One entry of data/events.json, as the pipeline writes it. Every key is in
 * scripts/lib/validate.js EVENT_FIELDS (an unknown key fails validation), and
 * docs/DATA_POLICY.md's field table says what each one means.
 *
 * @typedef {object} EventRecord
 * @property {string} id                         lower-case slug, the /event/<id> path
 * @property {string} title                      the English Wikipedia article title
 * @property {string} wikipedia_url
 * @property {string} extract                    the article's lead, plain text
 * @property {string} extract_retrieved_at
 * @property {string} retrieved_at               ISO UTC timestamp
 * @property {number} wikipedia_revid            the revision whose lead is `extract`
 * @property {string} wikipedia_revid_timestamp
 * @property {string} wikidata_qid
 * @property {string} [resolved_qid]
 * @property {string[]} wikidata_classes         Wikidata's own labels
 * @property {string|null} [wikidata_description]
 * @property {string[]} [wikidata_aliases]
 * @property {string} date_start                 YYYY-MM-DD (coarser precisions stored as the period's first day)
 * @property {string|null} date_end
 * @property {string|null} [date_precision]      Wikidata precision name ("day", "month", "year", ...)
 * @property {string|null} [date_end_precision]
 * @property {"wikidata_novalue"|"wikidata_somevalue"} [date_end_open]  Wikidata's "no value"/"unknown value" end
 * @property {string[]} [date_flags]
 * @property {string[]} [wikipedia_lead_dates]   only with a date_order_invalid flag
 * @property {string[]} countries                tracked countries, or "regional"
 * @property {string} category
 * @property {string} category_group
 * @property {"precise"|"approximate"|"none"} location_quality
 * @property {{lat: number, lon: number}|null} coordinates
 * @property {string|null} coordinate_source
 * @property {boolean} needs_manual_coordinates  location_quality is not "precise"
 * @property {string[]} review_reasons
 * @property {boolean} needs_review              review_reasons or date_flags is non-empty
 * @property {{qid: string, label: string|null}[]} [part_of]
 * @property {unknown[]} [possible_duplicates]
 * @property {number} [sitelinks]                at discovery; absent on hand-picked events
 * @property {number} sitelinks_current
 */

/**
 * An event as the app holds it (lib/dataClient.js): the lite record every list
 * and the map use (app/scripts/split-data.mjs publicEvent, then normalizeEvent),
 * plus, once the event is opened, its full record (the full-record bucket,
 * hooks/useEventLead.js), and `leadStatus` until that arrives.
 *
 * @typedef {object} Event
 * @property {string} id
 * @property {string} title
 * @property {string} date_start
 * @property {string|null} date_end
 * @property {"wikidata_novalue"|"wikidata_somevalue"} [date_end_open]
 * @property {string[]} countries
 * @property {string} category                   the category group
 * @property {string} [snippet]                  the extract's first 160 characters
 * @property {{lat: number, lon: number}|null} coordinates  null when location_quality is "none"
 * @property {"precise"|"approximate"|"none"} location_quality
 * @property {"rounded"} [approximate_reason]    a precise pin given to so few decimals it is shown as approximate
 * @property {number|null} sitelinks             Wikidata sitelinks now (the default order); null for hand-picked
 * @property {string[]} [aliases]                Wikidata's English aliases (search only)
 * @property {string} [start_precision]          Wikidata's precision of date_start, for the download (lib/exportResults.js)
 * @property {string} [end_precision]            the same for date_end
 *
 * Full record (opened events):
 * @property {string} [extract]
 * @property {string|null} [extract_retrieved_at]
 * @property {number} [wikipedia_revid]
 * @property {string} [wikipedia_revid_timestamp]
 * @property {{ref: string, anchor: string|null}[]} [data_fixes]  documented corrections (docs/data-fixes.md)
 * @property {string} [wikipedia_url]
 * @property {string} [wikidata_qid]
 * @property {string[]} [wikidata_classes]
 * @property {string[]} [date_flags]
 * @property {string[]} [wikipedia_lead_dates]
 * @property {string|null} [coordinate_source]
 * @property {string|null} [text_from_article]   the article the text comes from when it is another item's
 * @property {true} [hand_picked]
 * @property {string|null} [date_precision]
 * @property {string} [date_end_precision]
 * @property {object|null} [framing_review]      lib/framingReview.js
 * @property {object[]} [part_of]
 * @property {object[]} [includes]
 * @property {object[]} [related]
 * @property {"loading"|"error"} [leadStatus]    set until the full record is in (or if it failed)
 */

export {};
