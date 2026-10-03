// Title refresh: an event's `title` is the CURRENT English Wikipedia article title (docs/DATA_POLICY.md).
// Articles get renamed (e.g. "2023 Israel–Hamas war" -> "Gaza war"); this module decides, from a freshly
// fetched lead record (lib/lead.js fetchLeads), whether an event's stored title/URL are stale.
//
// It never edits anything itself. scripts/refresh-extracts.js --propose-titles writes the proposals to
// data/title-changes.proposed.json; only `node scripts/merge-proposed.js --titles --apply`, run by a person,
// writes them into data/events.json. The event `id` is NEVER changed (deep links depend on it).
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
// `needs_review` change. Returns { applied, already, stale, unknown } lists of ids.
// A proposal is applied only if the event still has the old title/URL (a later edit is never overwritten).
export function applyTitleChanges(events, changes) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const idsBefore = events.map((e) => e.id).join("\n");
  const out = { applied: [], already: [], stale: [], unknown: [] };
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
  renamed_redirect: "Article renamed (stored URL redirects)",
  title_stale: "Title out of date (URL already current; Wikipedia redirects the stored title to the article)",
  url_only: "URL points at a redirect (title already current)",
};

const HOLD_TEXT = {
  lead_missing: "No article returned",
  section_redirect: "Redirects to a section of another article",
  qid_mismatch: "Article belongs to a different Wikidata item",
  title_not_redirected_here: "Stored title does not redirect to the article",
};

const md = (s) => String(s ?? "").replace(/\|/g, "\\|");

// Human-readable report of every proposed title/URL change and every held case.
export function titleReport(changes, { date, checked }) {
  const proposals = changes.filter((c) => !c.hold);
  const held = changes.filter((c) => c.hold);
  const titleCount = proposals.filter((c) => c.new_title !== c.old_title).length;
  const L = [];
  L.push(`# Title refresh report (${date})`);
  L.push("");
  L.push(
    `Each event's \`title\` is the current English Wikipedia article title (docs/DATA_POLICY.md). Checked ${checked} events against the live ` +
      `MediaWiki API (\`redirects=1\`). **${titleCount}** titles are out of date, ${proposals.length - titleCount} more only need their URL updated, ` +
      `${held.length} are held for a person to look at. Event ids never change.`
  );
  L.push("");
  L.push("Proposals are in `data/title-changes.proposed.json`. Nothing here has been written to `data/events.json`. To apply them:");
  L.push("");
  L.push("```");
  L.push("node scripts/merge-proposed.js --titles          # dry run: lists what would change");
  L.push("node scripts/merge-proposed.js --titles --apply  # writes title / wikipedia_url into data/events.json");
  L.push("```");
  const groups = new Map();
  for (const c of proposals) {
    const key = `${c.file ?? "curated"}|${c.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const [key, list] of [...groups].sort()) {
    const [file, kind] = key.split("|");
    L.push("");
    L.push(`## ${KIND_TEXT[kind]} - ${file}: ${list.length}`);
    L.push("");
    L.push("| id | old title | new title | URL update | redirected from |");
    L.push("|---|---|---|---|---|");
    for (const c of list.sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(
        `| \`${c.id}\` | ${md(c.old_title)} | ${c.new_title === c.old_title ? "(unchanged)" : md(c.new_title)} | ` +
          `${c.url_update ? `${md(c.old_url)} -> ${md(c.new_url)}` : "no"} | ${md(c.redirected_from) || "-"} |`
      );
    }
  }
  if (held.length) {
    L.push("");
    L.push(`## Held - not proposed: ${held.length}`);
    L.push("");
    L.push("These are not changed by the merge. A redirect to another subject or to a section usually means the article was merged into a larger one; a stored title that Wikipedia does not redirect to the article is usually a hand-picked label for an event whose URL points at a broader article.");
    L.push("");
    L.push("| id | file | stored title | reason | detail |");
    L.push("|---|---|---|---|---|");
    for (const c of held.sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(`| \`${c.id}\` | ${c.file ?? "curated"} | ${md(c.old_title)} | ${HOLD_TEXT[c.hold]} | ${md(c.detail)} |`);
    }
  }
  return L.join("\n") + "\n";
}
