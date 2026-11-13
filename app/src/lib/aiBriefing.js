// What an AI gets about an event: the event, every event lib/conflictContext.js places
// around it, each with its framing review, and how the dataset was selected. Written at
// build time to dist/ai/context/<id>.json (scripts/build-ai-files.mjs) and served as-is by
// the MCP endpoint (worker/index.js), so a browsing AI and a connected one read the same.
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
export const DATA_LICENSE_URL = `${REPO}/blob/main/data/LICENSE`;

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
  "this material as supporting one side, because the site does not take one.";

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
export function reviewOf(framing) {
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

const entry = (e) => ({
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

/**
 * `event`: the merged lite + full record (as scripts/build-event-pages.mjs builds it);
 * `context`: its entry from resolveContext; `byId`: Map of all merged records; `funnel`:
 * data/selection-funnel.json (or null); `meta`: {version, reviewer, reviewed_on}.
 */
export function briefingFor(event, context, byId, funnel, meta) {
  const coverage = funnel?.breakdowns?.by_country ?? {};
  const countries = [...new Set(context.ids.flatMap((id) => byId.get(id).countries ?? []))].sort();
  return {
    about: ABOUT,
    guidance_for_ai: GUIDANCE,
    asked_about: { ...entry(event), summary: event.extract ?? "", wikipedia_revision: event.wikipedia_revid ?? null },
    selection: {
      rule: contextRule(),
      wikidata_groups: context.groups.map((g) => ({
        label: g.label,
        wikidata: `https://www.wikidata.org/wiki/${g.qid}`,
        events_here: g.size,
        reached: g.own ? "the event is in this group" : "an event in the same country and years is in this group",
      })),
      same_country_and_years: context.near.size,
      total: context.ids.length,
    },
    events: context.ids.map((id) => ({ ...entry(byId.get(id)), ...(id === event.id ? { asked_about: true } : {}) })),
    coverage: {
      rule: funnel?.rule ?? null,
      note:
        "The dataset is a selection, not every event: Wikidata candidates since 1900, kept when they have an English " +
        "Wikipedia article and at least 10 sitelinks. The site's own coverage review found that this favours events with " +
        "many European-language editions: events covered mainly in Arabic, Hebrew, Turkish or Persian editions are dropped " +
        "more often, and the share kept differs by country (see report). Counts per country, Wikidata candidates against " +
        "events shown:",
      by_country: Object.fromEntries(
        countries.map((c) => [c, coverage[c] ? { wikidata_candidates: coverage[c].raw, shown: coverage[c].in_curated } : null])
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
