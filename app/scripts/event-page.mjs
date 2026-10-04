// Renders the static, crawlable per-event pages (/event/<id>), the /event/ index
// and sitemap.xml. Pure functions over the records split-data.mjs writes (the lite
// record merged with its full-lead record), so the page shows exactly what the app's
// detail view shows: Wikipedia's title and lead unchanged, Wikidata's dates and
// classes as given, and our framing review boxed off as ours. Driven by
// build-event-pages.mjs; tested in event-page.test.mjs.
import { categoryLabel } from "../src/lib/categoryLabels.js";
import { formatEventDate } from "../src/lib/eventDate.js";
import { markSegments } from "../src/lib/highlights.js";
import { REVIEW_TABS } from "../src/lib/reviewTabs.js";
import { isValidEventId } from "../src/lib/urlState.js";

export const SITE = "https://middleeast.events";
export const SITE_NAME = "Middle East, 1900–present";
const REPO = "https://github.com/kei-nan/meast-events";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;
const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";
const OG_IMAGE = `${SITE}/og-image.png`;
export const DESCRIPTION_LENGTH = 160;

const TAB_NAMES = { fairness: "Overall fairness", wording: "Wording check" };

/** Escapes text for HTML element content and double- or single-quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only http(s) links from the data are rendered as links (never javascript: etc.).
export function safeUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

export const eventPath = (id) => `/event/${encodeURIComponent(id)}`;
export const mapPath = (id) => `/?e=${encodeURIComponent(id)}`;

/**
 * The meta description: the lead's first paragraph, cut at a word boundary to at
 * most `max` characters (code points) with "…" appended when cut. The words kept
 * are Wikipedia's own, unchanged; only whitespace runs are collapsed.
 */
export function metaDescription(extract, max = DESCRIPTION_LENGTH) {
  const first = String(extract ?? "")
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find(Boolean);
  if (!first) return "";
  const chars = Array.from(first);
  if (chars.length <= max) return first;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  // A single huge word: cut it (rare; never seen in the data).
  const cut = space > max / 2 ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:–—-]+$/, "")}…`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function tabStatus(tab, r) {
  if (!r.found) return "Nothing found";
  return tab === "wording" ? plural(r.findings.length, "wording point", "wording points") : "Issue found";
}

// Same prefilled issue as the app's "Disagree with this review?" link.
function contestUrl(event, review) {
  const title = `Framing review: ${event.title}`;
  const w = review.wording.findings;
  const body = [
    `Event: ${event.title} (${event.id})`,
    "",
    `Overall fairness: ${review.fairness.found ? review.fairness.note : "nothing found"}`,
    "",
    "Wording check:",
    ...(w.length ? w.map((x) => `- ${x.guideline_name}: "${x.phrase}"`) : ["- nothing found"]),
    "",
    "What is wrong with this review, and what shows it?",
    "",
  ].join("\n");
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=framing-review`;
}

function link(href, text, { external = false } = {}) {
  const attrs = external ? ' rel="noreferrer"' : "";
  return `<a href="${escapeHtml(href)}"${attrs}>${text}</a>`;
}

function historyUrl(wikipediaUrl) {
  return wikipediaUrl + (wikipediaUrl.includes("?") ? "&" : "?") + "action=history";
}

function renderParagraph(paragraph, highlights) {
  const html = markSegments(paragraph, highlights)
    .map((s) => {
      if (!s.flagged) return escapeHtml(s.text);
      const cls = ["framing-mark", ...s.kinds.map((k) => `framing-mark--${k}`)].join(" ");
      const by = s.kinds.map((k) => (k === "fairness" ? "overall fairness review" : "wording check")).join(" and the ");
      return `<mark class="${cls}" title="Flagged by the ${escapeHtml(by || "framing review")}. See the review below.">${escapeHtml(s.text)}</mark>`;
    })
    .join("");
  return `<p>${html}</p>`;
}

// The short notice above the text (the app's FramingPointer).
function renderPointer(review) {
  if (!review || (!review.fairness.found && !review.wording.found)) return "";
  const parts = REVIEW_TABS.filter((t) => review[t].found).map(
    (t) => `${TAB_NAMES[t].toLowerCase()} (${tabStatus(t, review[t]).toLowerCase()})`
  );
  const marked = review.highlights?.length > 0 ? " The words in question are highlighted." : "";
  return `<p class="framing-pointer" role="note">Our framing review found something in this summary: ${escapeHtml(parts.join(" and "))}.${marked} <a href="#framing-review">Read the review</a></p>`;
}

// The app's FramingReview, with both review types shown in full (no tabs: no JS).
function renderReview(event, review) {
  if (!review) return "";
  const f = review.fairness;
  const w = review.wording;
  const fairness = f.found ? `<p>${escapeHtml(f.note)}</p>` : `<p class="fr-nothing">No one-sided framing found.</p>`;
  const wording = w.found
    ? `<ul class="framing-obs">${w.findings
        .map((x) => {
          const url = safeUrl(x.url);
          const name = escapeHtml(x.guideline_name);
          const guideline = url
            ? `<a href="${escapeHtml(url)}" rel="noreferrer" title="${escapeHtml(x.shortcut)}">${name}</a>`
            : name;
          return `<li>${guideline}: <q>${escapeHtml(x.phrase)}</q>. ${escapeHtml(x.note)}</li>`;
        })
        .join("")}</ul>`
    : `<p class="fr-nothing">No wording found that Wikipedia’s guidelines advise against.</p>`;
  const notes = [
    review.stale && `<p class="framing-review-flag">Wikipedia’s text has changed since this review, so it may no longer apply.</p>`,
    review.category_note && `<p><strong>Category note:</strong> ${escapeHtml(review.category_note)}</p>`,
    review.data_note && `<p><strong>Data note:</strong> ${escapeHtml(review.data_note)}</p>`,
    review.disclosure && `<p><strong>Disclosure:</strong> ${escapeHtml(review.disclosure)}</p>`,
  ].filter(Boolean);
  return `<aside id="framing-review" class="framing-review" aria-labelledby="framing-review-title">
<h2 id="framing-review-title">Framing review <span class="framing-review-owner">our reading, not Wikipedia’s</span></h2>
<section class="fr-section fr-section--fairness${f.found ? " fr-section--found" : ""}">
<h3>${TAB_NAMES.fairness} <span class="fr-status">${escapeHtml(tabStatus("fairness", f))}</span></h3>
<p class="fr-method">Our judgement of the summary’s overall fairness: emphasis, balance, what it leaves out, and contested claims stated as fact.</p>
${fairness}
</section>
<section class="fr-section fr-section--wording${w.found ? " fr-section--found" : ""}">
<h3>${TAB_NAMES.wording} <span class="fr-status">${escapeHtml(tabStatus("wording", w))}</span></h3>
<p class="fr-method">Checks the wording against Wikipedia’s own neutrality and wording guidelines.</p>
${wording}
</section>
${notes.join("\n")}
<p class="framing-review-meta">Reviewed by Claude, an AI model made by Anthropic, and not checked line by line by a person. It does not judge whether the events happened, and the Wikipedia text above is shown unchanged. ${link(METHOD_URL, "How we review", { external: true })} · ${link(contestUrl(event, review), "Disagree with this review?", { external: true })}</p>
</aside>`;
}

function locationNote(quality) {
  if (quality === "approximate") {
    return `<p class="note">Approximate location: this event isn’t tied to a single known site, so its marker on the map is placed at a national capital.</p>`;
  }
  if (quality === "none") {
    return `<p class="note">No map location: Wikipedia and Wikidata give no coordinates for this event, so it has no marker on the map.</p>`;
  }
  return "";
}

function head({ title, description, canonical, type }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const c = escapeHtml(canonical);
  return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t}</title>
${description ? `<meta name="description" content="${d}">\n` : ""}<link rel="canonical" href="${c}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/event/event.css">
<meta name="theme-color" content="#1d1a15">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${t}">
${description ? `<meta property="og:description" content="${d}">\n` : ""}<meta property="og:url" content="${c}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Map of the Middle East with the title ${escapeHtml(SITE_NAME)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
${description ? `<meta name="twitter:description" content="${d}">\n` : ""}<meta name="twitter:image" content="${OG_IMAGE}">
</head>`;
}

const siteHeader = `<header class="site-header"><a href="/" class="site-name">${escapeHtml(SITE_NAME)}</a> <a href="/event/" class="site-index">All events</a></header>`;

const siteFooter = `<footer class="site-footer"><p>${escapeHtml(SITE_NAME)} is a non-commercial project: an interactive map and timeline of major Middle East events since 1900. Event text comes from Wikipedia and Wikidata; borders are adapted from CShapes 2.0. ${link(REPO, "Source and data documentation on GitHub", { external: true })}.</p></footer>`;

export function eventDateText(event) {
  const flags = (event.date_flags ?? []).filter(Boolean);
  return formatEventDate(event.date_start, event.date_end, { precision: event.date_precision ?? null, yearOnly: flags.length > 0 });
}

/**
 * One event's page. `event` is the lite record (split-data.mjs publicEvent) merged
 * with its full-lead record (extract, extract_retrieved_at, date_precision,
 * framing_review). Every field may be missing except id and title.
 */
export function renderEventPage(event) {
  if (!isValidEventId(event?.id)) throw new Error(`invalid event id: ${JSON.stringify(event?.id)}`);
  const title = String(event.title ?? event.id);
  const canonical = SITE + eventPath(event.id);
  const review = event.framing_review ?? null;
  const extract = String(event.extract ?? "");
  const description = metaDescription(extract);
  const wiki = safeUrl(event.wikipedia_url);
  const dateText = eventDateText(event);
  const countries = (event.countries ?? []).filter((c) => typeof c === "string" && c);
  const classes = (event.wikidata_classes ?? []).filter(Boolean);
  const showClasses = classes.some((c) => c.toLowerCase() !== String(event.category ?? "").toLowerCase());
  const flags = (event.date_flags ?? []).filter(Boolean);
  const retrieved = event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null;
  const paragraphs = extract.split(/\n+/).filter((p) => p.trim());

  const meta = [dateText, countries.join(", ")].filter(Boolean).map(escapeHtml).join(" · ");
  const body = [
    event.category && `<p class="category">Category (our grouping): ${escapeHtml(categoryLabel(event.category))}</p>`,
    `<h1>${escapeHtml(title)}</h1>`,
    meta && `<p class="meta">${meta}</p>`,
    showClasses && `<p class="classes">Wikidata classes: ${escapeHtml(classes.join(", "))}</p>`,
    flags.length > 0 && `<p class="note" role="note">Date unverified: ${escapeHtml(flags.join("; "))}. Dates are shown as Wikidata gives them.</p>`,
    `<p class="actions"><a class="open-map" href="${escapeHtml(mapPath(event.id))}">Open on the map</a>${
      wiki ? ` <a class="wiki" href="${escapeHtml(wiki)}" rel="noreferrer">Read on Wikipedia</a>` : ""
    }</p>`,
    renderPointer(review),
    `<div class="extract">${paragraphs.length ? paragraphs.map((p) => renderParagraph(p, review?.highlights)).join("\n") : "<p>No summary available.</p>"}</div>`,
    retrieved && `<p class="asof">Text retrieved ${escapeHtml(retrieved)} from Wikipedia.</p>`,
    renderReview(event, review),
    locationNote(event.location_quality),
    `<p class="attribution">Text from Wikipedia, licensed ${link(CC_BY_SA, "CC BY-SA 4.0", { external: true })} by ${
      wiki ? link(historyUrl(wiki), "Wikipedia contributors", { external: true }) : "Wikipedia contributors"
    }${wiki ? `, from the article ${link(wiki, escapeHtml(title), { external: true })}` : ""}.${showClasses ? " Classes are Wikidata’s labels (CC0)." : ""}</p>`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
${head({ title, description, canonical, type: "article" })}
<body>
${siteHeader}
<main>
<article>
${body.join("\n")}
</article>
</main>
${siteFooter}
</body>
</html>
`;
}

/** /event/: every event as a plain link, oldest first (the order given). */
export function renderIndexPage(events) {
  const items = events
    .map((e) => {
      const date = eventDateText(e);
      return `<li><a href="${escapeHtml(eventPath(e.id))}">${escapeHtml(e.title ?? e.id)}</a>${date ? ` <span class="meta">${escapeHtml(date)}</span>` : ""}</li>`;
    })
    .join("\n");
  const description = `All ${events.length} events on the ${SITE_NAME} map, each with its Wikipedia summary, dates and countries.`;
  return `<!doctype html>
<html lang="en">
${head({ title: `All events · ${SITE_NAME}`, description, canonical: `${SITE}/event/`, type: "website" })}
<body>
${siteHeader}
<main>
<h1>All events</h1>
<p>${escapeHtml(description)} <a class="open-map" href="/">Open the map</a></p>
<ol class="event-index">
${items}
</ol>
</main>
${siteFooter}
</body>
</html>
`;
}

/** sitemap.xml: the home page, the event index and every event page. */
export function renderSitemap(events) {
  const urls = [`${SITE}/`, `${SITE}/event/`, ...events.map((e) => SITE + eventPath(e.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`).join("\n")}
</urlset>
`;
}
