// What an AI gets about an event: the event, every event lib/conflictContext.js places
// around it, each with its framing review, and how the dataset was selected.
//
// Stored once, put together per request. Most events appear in dozens of contexts, so the
// build (scripts/build-ai-files.mjs) writes each event's entry once (dist/ai/store/
// events.json), the texts every briefing shares once (store/shared.json), and per event
// only what is its own (store/context/<id>.json: its full summary, its selection and the
// ids around it). The Worker (worker/index.js) joins them with assembleBriefing(), for the
// MCP tool event_in_context and for /ai/context/<id>.json alike, so a browsing AI and a
// connected one get the same self-contained briefing.
//
// Nothing here is new commentary. Summaries are the Wikipedia leads the site shows; review
// notes are the stored framing review (docs/framing-review.md); counts come from
// data/selection-funnel.json. The fixed texts below say what the material is and is not.

import { contextRule } from "./conflictContext.js";
import { SITE } from "./citation.js";
import { eventPath } from "./urlState.js";

const REPO = "https://github.com/kei-nan/meast-events";
export const REVIEW_METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;
export const COVERAGE_REPORT_URL = `${REPO}/blob/main/docs/bias-review/dataset-coverage.md`;
const DATA_LICENSE_URL = `${REPO}/blob/main/data/LICENSE`;

export const ABOUT =
  "middleeast.events is a map and timeline of events in the Middle East since 1900. It does not say who is right in " +
  "any conflict. Each event's summary is the lead section of its English Wikipedia article, unchanged. Each summary " +
  "has a framing review: notes on how the summary is written (what it leaves out, wording that Wikipedia's own " +
  "guidelines ask to avoid). The review is not a fact-check and not a verdict on the events.";

export const GUIDANCE =
  "These events were chosen from the event alone, by a fixed rule (see selection), not from the question asked: a " +
  "question from one side's point of view gets the events of the other side's account too. When you use them: give the " +
  "events in date order, including the ones the question did not ask about; mention a review note where it applies " +
  "to an event you cite; say that the list is a selection (see coverage) and not every event; and do not present " +
  "this material as supporting one side, because the site does not take one. The summaries and openings are " +
  "Wikipedia's wording: attribute them to Wikipedia (\"Wikipedia's article says...\") rather than stating them as fact.";

// The first sentence of a summary, or its first 300 characters (cut at a word) if longer.
export function opening(text) {
  const t = String(text ?? "").trim();
  const m = /^[\s\S]*?[.!?](?=\s+["'(\p{Lu}]|$)/u.exec(t);
  const s = m ? m[0] : t;
  if (s.length <= 300) return s;
  const cut = s.slice(0, 300);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 200))}…`;
}

// The stored review, without the highlight positions only the page uses.
function reviewOf(framing) {
  if (!framing) return null;
  return {
    overall_fairness: framing.fairness?.found ? framing.fairness.note : null,
    wording: (framing.wording?.findings ?? []).map((x) => ({ guideline: x.shortcut, name: x.guideline_name, url: x.url, words: x.phrase, note: x.note })),
    ...(framing.category_note ? { category_note: framing.category_note } : {}),
    ...(framing.data_note ? { data_note: framing.data_note } : {}),
    ...(framing.disclosure ? { disclosure: framing.disclosure } : {}),
    possibly_out_of_date: !!framing.stale,
  };
}

/** The stored entry for one event: what any briefing that includes it says about it. */
export const storeEntry = (e) => ({
  id: e.id,
  title: e.title,
  date_start: e.date_start ?? null,
  date_end: e.date_end ?? null,
  countries: e.countries ?? [],
  page: SITE + eventPath(e.id),
  wikipedia: e.wikipedia_url ?? null,
  opening: opening(e.extract),
  review: reviewOf(e.framing_review),
});

const COVERAGE_NOTE =
  "The dataset is a selection, not every event: Wikidata candidates since 1900, kept when they have an English " +
  "Wikipedia article and at least 10 sitelinks. The site's own coverage review found that this favours events with " +
  "many European-language editions: events covered mainly in Arabic, Hebrew, Turkish or Persian editions are dropped " +
  "more often, and the share kept differs by country (see report). Counts per country, Wikidata candidates against " +
  "events shown:";

/**
 * What every briefing shares, stored once. `funnel`: data/selection-funnel.json (or null);
 * `meta`: {version, reviewer, reviewed_on}.
 */
export function sharedParts(funnel, meta) {
  const coverage = funnel?.breakdowns?.by_country ?? {};
  return {
    about: ABOUT,
    guidance_for_ai: GUIDANCE,
    rule: contextRule(),
    coverage: {
      rule: funnel?.rule ?? null,
      note: COVERAGE_NOTE,
      by_country: Object.fromEntries(
        Object.entries(coverage).map(([c, x]) => [c, { wikidata_candidates: x.raw, shown: x.in_curated }])
      ),
      report: COVERAGE_REPORT_URL,
    },
    review_method: { url: REVIEW_METHOD_URL, reviewer: meta.reviewer ?? null, reviewed_on: meta.reviewed_on ?? null },
    licences: {
      summaries_and_titles: "Wikipedia contributors, CC BY-SA 4.0 (each event links to its article)",
      dates_places_identifiers: "Wikidata, CC0",
      all_data: DATA_LICENSE_URL,
    },
    data_version: meta.version ?? null,
  };
}

/**
 * What is an event's own, stored per event. `event`: the merged lite + full record (as
 * scripts/build-event-pages.mjs builds it); `context`: its entry from resolveContext;
 * `byId`: Map of all merged records.
 */
export function contextRecord(event, context, byId) {
  return {
    id: event.id,
    summary: event.extract ?? "",
    wikipedia_revision: event.wikipedia_revid ?? null,
    wikidata_groups: context.groups.map((g) => ({
      label: g.label,
      wikidata: `https://www.wikidata.org/wiki/${g.qid}`,
      events_here: g.size,
      reached: g.own ? "the event is in this group" : "an event in the same country and years is in this group",
    })),
    same_country_and_years: context.near.size,
    ids: context.ids,
    countries: [...new Set(context.ids.flatMap((id) => byId.get(id).countries ?? []))].sort(),
  };
}

/**
 * The self-contained briefing: an event's record joined with the stored entries (`entries`:
 * {id: storeEntry}) and the shared texts. Throws if an id has no entry, so a broken store
 * fails loudly instead of silently dropping an event from a context.
 */
export function assembleBriefing(record, entries, shared) {
  const get = (id) => {
    const e = entries[id];
    if (!e) throw new Error(`context of ${record.id}: no stored entry for ${id}`);
    return e;
  };
  const byCountry = shared.coverage.by_country;
  return {
    about: shared.about,
    guidance_for_ai: shared.guidance_for_ai,
    asked_about: { ...get(record.id), summary: record.summary, wikipedia_revision: record.wikipedia_revision },
    selection: {
      rule: shared.rule,
      wikidata_groups: record.wikidata_groups,
      same_country_and_years: record.same_country_and_years,
      total: record.ids.length,
    },
    events: record.ids.map((id) => ({ ...get(id), ...(id === record.id ? { asked_about: true } : {}) })),
    coverage: {
      rule: shared.coverage.rule,
      note: shared.coverage.note,
      by_country: Object.fromEntries(record.countries.map((c) => [c, byCountry[c] ?? null])),
      report: shared.coverage.report,
    },
    review_method: shared.review_method,
    licences: shared.licences,
    data_version: shared.data_version,
  };
}

/** One line per event for search: no review or text, just enough to pick an id. */
export function indexEntry(event, context) {
  return {
    id: event.id,
    title: event.title,
    date_start: event.date_start ?? null,
    countries: event.countries ?? [],
    groups: context.groups.filter((g) => g.own).map((g) => g.label),
  };
}
