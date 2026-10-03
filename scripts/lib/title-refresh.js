// Title refresh: an event's `title` is the CURRENT English Wikipedia article title (docs/DATA_POLICY.md).
// Articles get renamed (e.g. "2023 Israel–Hamas war" -> "Gaza war"); this module decides, from a freshly
// fetched lead record (lib/lead.js fetchLeads), whether an event's stored title/URL are stale.
//
// scripts/refresh-extracts.js uses it on every run: a dry run only lists the changes; with --apply the plain
// renames are written (applyTitleChanges), the same way changed leads are, and land in the monthly refresh PR.
// Held cases are never applied, only listed. The event `id` is NEVER changed (deep links depend on it).
import { titleFromWikipediaUrl } from "./lead.js";

const TITLE_FLAG = "title_differs_from_article";

// kind:
//   renamed_redirect  the stored URL redirects to an article with another title (the article was moved)
//   title_stale       the stored URL is the current article, but the stored title is not its title
//   url_only          the title is already current, only the stored URL points at a redirect
// hold (no proposal, listed for a person):
//   lead_missing      Wikipedia returned no page for the stored URL (deleted/invalid)
//   section_redirect  the stored URL redirects to a SECTION of another article (merged into a larger one)
//   qid_mismatch      the article's Wikidata item is not the event's wikidata_qid (redirect to a different subject)
//   title_not_redirected_here  (checkFormerTitle) a title_stale title that Wikipedia does not redirect to the article
export function detectTitleChange(event, lead) {
  const storedUrlTitle = titleFromWikipediaUrl(event.wikipedia_url);
  const base = {
    id: event.id,
    wikidata_qid: event.wikidata_qid ?? null,
    old_title: event.title,
    old_url: event.wikipedia_url,
  };
  if (!lead) return { ...base, hold: "lead_missing", detail: `no Wikipedia page returned for "${storedUrlTitle}"` };

  const titleChanged = lead.title !== event.title;
  // compare decoded titles, so a percent-encoding or underscore difference alone is not a change
  const urlChanged = storedUrlTitle !== lead.title;
  if (!titleChanged && !urlChanged) return null;

  const rec = {
    ...base,
    new_title: lead.title,
    new_url: urlChanged ? lead.url : event.wikipedia_url,
    url_update: urlChanged,
    redirected_from: lead.redirected_from ?? null,
    article_qid: lead.wikibase_item ?? null,
    article_pageid: lead.pageid ?? null,
  };
  if (lead.redirect_fragment) {
    return { ...rec, hold: "section_redirect", detail: `"${lead.redirected_from}" redirects to a section: ${lead.title}#${lead.redirect_fragment}` };
  }
  if (event.wikidata_qid && lead.wikibase_item && lead.wikibase_item !== event.wikidata_qid) {
    return { ...rec, hold: "qid_mismatch", detail: `article "${lead.title}" is Wikidata ${lead.wikibase_item}, the event is ${event.wikidata_qid}` };
  }
  const kind = lead.redirected_from && titleChanged ? "renamed_redirect" : titleChanged ? "title_stale" : "url_only";
  return { ...rec, kind, hold: null };
}

// Second check for `title_stale`: does Wikipedia redirect the stored title to this very article? `oldTitleLead` is the
// lead record fetched for the stored TITLE (not the URL). If the old title redirects (without a section anchor) to the
// same page, it is a former name or an accepted alternative name of the article (Wikipedia leaves a redirect behind
// when an article is moved), and the proposal stands. If it redirects to a section, to another page, or to nothing,
// the stored title names something narrower or different (typically a hand-picked label for an event whose URL points
// at a broader article, e.g. "Jordanian independence" -> "History of Jordan#Establishment"); replacing it would change
// what the event is, so it is held for a person. Returns the (possibly held) change.
export function checkFormerTitle(change, oldTitleLead) {
  const articlePageId = change?.article_pageid;
  if (!change || change.hold || change.kind !== "title_stale") return change;
  if (oldTitleLead && oldTitleLead.pageid === articlePageId && !oldTitleLead.redirect_fragment) {
    return { ...change, old_title_redirects_here: true };
  }
  const where = !oldTitleLead
    ? "no Wikipedia page or redirect has that title"
    : oldTitleLead.pageid !== articlePageId
      ? `"${change.old_title}" leads to another page, "${oldTitleLead.title}"`
      : `"${change.old_title}" redirects to a section: ${oldTitleLead.title}#${oldTitleLead.redirect_fragment}`;
  return {
    ...change,
    old_title_redirects_here: false,
    hold: "title_not_redirected_here",
    detail: `Wikipedia does not redirect the stored title to "${change.new_title}": ${where}`,
  };
}

// Applies proposals (entries without `hold`) to an events array IN PLACE. Only `title`, `wikipedia_url`,
// the `title_differs_from_article` review flag (moot once the title is the article title) and the derived
// `needs_review` change. Returns { applied, already, stale, duplicate, unknown } lists of ids.
// A proposal is applied only if the event still has the old title/URL (a later edit is never overwritten) and no
// other event already has the new title (two events would then share one title; listed as `duplicate`).
export function applyTitleChanges(events, changes) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const idsBefore = events.map((e) => e.id).join("\n");
  const out = { applied: [], already: [], stale: [], duplicate: [], unknown: [] };
  const titleOwner = new Map(events.map((e) => [e.title, e.id]));
  for (const c of changes) {
    if (c.hold) continue;
    const e = byId.get(c.id);
    if (!e) {
      out.unknown.push(c.id);
      continue;
    }
    if (e.title === c.new_title && e.wikipedia_url === c.new_url) {
      out.already.push(c.id);
      continue;
    }
    if (e.title !== c.old_title || e.wikipedia_url !== c.old_url) {
      out.stale.push(c.id);
      continue;
    }
    if (c.new_title !== e.title && titleOwner.has(c.new_title) && titleOwner.get(c.new_title) !== e.id) {
      out.duplicate.push(c.id);
      continue;
    }
    titleOwner.delete(e.title);
    titleOwner.set(c.new_title, e.id);
    e.title = c.new_title;
    if (c.url_update) e.wikipedia_url = c.new_url;
    if (Array.isArray(e.review_reasons)) {
      const kept = e.review_reasons.filter((r) => !String(r).startsWith(TITLE_FLAG));
      if (kept.length !== e.review_reasons.length) {
        e.review_reasons = kept;
        if ("needs_review" in e) e.needs_review = kept.length > 0 || (e.date_flags ?? []).length > 0;
      }
    }
    out.applied.push(c.id);
  }
  if (events.map((e) => e.id).join("\n") !== idsBefore) throw new Error("title refresh changed an event id - refusing");
  return out;
}

const KIND_TEXT = {
  renamed_redirect: "article renamed, stored URL redirected",
  title_stale: "title out of date, URL already current",
  url_only: "URL pointed at a redirect, title already current",
};

const HOLD_TEXT = {
  lead_missing: "No article returned",
  section_redirect: "Redirects to a section of another article",
  qid_mismatch: "Article belongs to a different Wikidata item",
  title_not_redirected_here: "Stored title does not redirect to the article",
  not_applied: "Not applied",
};

// Markdown section for the refresh printout: every title/URL change (applied or, in a dry run, to be applied)
// and every held case. `applied` says which of the two the changes are.
export function titleReport(changes, { name = "curated", applied = false } = {}) {
  const plain = changes.filter((c) => !c.hold);
  const held = changes.filter((c) => c.hold);
  const L = [];
  L.push(`### ${name} titles: ${plain.length} ${applied ? "updated" : "to update (dry run)"}, ${held.length} held`);
  if (plain.length) {
    L.push("");
    L.push(
      applied
        ? "Updated to the current English Wikipedia article title (ids unchanged):"
        : "Would be updated to the current English Wikipedia article title with --apply (ids unchanged):"
    );
    for (const c of [...plain].sort((a, b) => a.id.localeCompare(b.id))) {
      const t = c.new_title === c.old_title ? `"${c.old_title}" (title unchanged)` : `"${c.old_title}" -> "${c.new_title}"`;
      L.push(`- \`${c.id}\`: ${t}${c.url_update ? `; URL ${c.old_url} -> ${c.new_url}` : ""} (${KIND_TEXT[c.kind]})`);
    }
  }
  if (held.length) {
    L.push("");
    L.push(
      "Held, not changed: a redirect to a section or to another subject usually means the article was merged into a larger one; " +
        "a stored title that Wikipedia does not redirect to the article is usually a hand-picked label for an event whose URL points " +
        "at a broader article. These need a person's judgement."
    );
    for (const c of [...held].sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(`- \`${c.id}\` ("${c.old_title}"): ${HOLD_TEXT[c.hold]}. ${c.detail}`);
    }
  }
  return L.join("\n");
}
