// Renders the per-event pages (/event/<id>), the /event/ index and sitemap.xml.
// Pure functions over the records split-data.mjs writes (the lite record merged
// with its full-lead record), so the page shows exactly what the app's detail view
// shows: Wikipedia's title, and its lead as plain text with references removed
// (the words not edited), Wikidata's dates and classes as
// given, and our framing review boxed off as ours. Driven by
// build-event-pages.mjs; tested in event-page.test.mjs.
//
// An event's page IS the app (fillAppShell): the built index.html with the
// event's own title and link-preview tags in its <head>, and the event as plain
// HTML inside #root for readers without JavaScript and crawlers that do not run
// it. The app replaces that content when it starts, reads the event from the path
// (src/lib/urlState.js) and opens it on the map.
import { rtlRuns, splitBidi } from "../src/lib/bidi.js";
import { categorySourceParts, categorySummary } from "../src/lib/categoryLabels.js";
import { citationNotes, citeEvent } from "../src/lib/citation.js";
import { roundedLocationNote } from "../src/lib/coordPrecision.js";
import { dataFixUrl } from "../src/lib/dataFixes.js";
import { dateOrderNote } from "../src/lib/dateOrderNote.js";
import { formatEventDate } from "../src/lib/eventDate.js";
import { countryLabel } from "../src/lib/eventCountries.js";
import { rawEventYears } from "../src/lib/eventYears.js";
import { markSegments } from "../src/lib/highlights.js";
import { otherArticleNote } from "../src/lib/otherArticle.js";
import { wikidataUrl } from "../src/lib/partOf.js";
import { shownClasses } from "../src/lib/eventClasses.js";
import { fallbackLocationNote } from "../src/lib/fallbackPoint.js";
import { HAND_PICKED_NOTE } from "../src/lib/handPicked.js";
import { NEARBY_KM, RELATED_SHOWN } from "../src/lib/related.js";
import { compassPoint, formatKm } from "../src/lib/relatedViz.js";
import { REVIEW_TABS } from "../src/lib/reviewTabs.js";
import { eventPath, isValidEventId } from "../src/lib/urlState.js";

export { eventPath };

export const SITE = "https://middleeast.events";
export const SITE_NAME = "Middle East, 1900–present";
const REPO = "https://github.com/kei-nan/meast-events";
const METHOD_URL = `${REPO}/blob/main/docs/framing-review.md`;
const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";
// Border credits (NOTICE): every source family in data/boundaries.json is named
// in the footer; event-page.test.mjs checks it against the data.
export const CSHAPES_URL = "https://icr.ethz.ch/data/cshapes/";
export const OCHA_AREAS_URL = "https://data.humdata.org/dataset/state-of-palestine-other-0-0-0-0-0";
const OG_IMAGE = `${SITE}/og-image.png`;
export const DESCRIPTION_LENGTH = 160;
// Link previews show the description under our site name, so it says whose words they are.
// The same for every event: a label on the flagged ones only would make the others look checked.
export const PREVIEW_SOURCE = "Wikipedia: ";

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

// Names in Arabic, Hebrew or Persian script are isolated as right-to-left (<bdi>,
// as EventDetail.jsx does), so the punctuation around them stays in place and
// screen readers get their language (WCAG 3.1.2). The text is unchanged and
// escaped; `at` is where the piece starts in its paragraph.
function bidiHtml(text, runs, at) {
  if (!runs.length) return escapeHtml(text);
  return splitBidi(text, runs, at)
    .map((p) => (p.rtl ? `<bdi dir="rtl"${p.lang ? ` lang="${p.lang}"` : ""}>${escapeHtml(p.text)}</bdi>` : escapeHtml(p.text)))
    .join("");
}

function renderParagraph(paragraph, highlights) {
  const runs = rtlRuns(paragraph);
  let at = 0;
  const html = markSegments(paragraph, highlights)
    .map((s) => {
      const text = bidiHtml(s.text, runs, at);
      at += s.text.length;
      if (!s.flagged) return text;
      const cls = ["framing-mark", ...s.kinds.map((k) => `framing-mark--${k}`)].join(" ");
      const by = s.kinds.map((k) => (k === "fairness" ? "overall fairness review" : "wording check")).join(" and the ");
      return `<mark class="${escapeHtml(cls)}" title="Flagged by the ${escapeHtml(by || "framing review")}. See the review below.">${text}</mark>`;
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
<p class="framing-review-meta"><button type="button" class="ai-btn" popovertarget="ai-note">Reviewed by AI</button> · ${link(METHOD_URL, "How we review", { external: true })} · ${link(contestUrl(event, review), "Disagree with this review?", { external: true })}</p>
<div id="ai-note" popover class="ai-note">This review was made by Claude, an AI model made by Anthropic, and not checked line by line by a person. It looks at how the summary is written, not whether the events happened, and it does not change the Wikipedia text (the article’s lead section as plain text, references removed).</div>
</aside>`;
}

// The category (src/lib/categoryLabels.js), as the event panel shows it: the group, and behind a native disclosure
// (no script needed) the Wikidata classes it comes from, each linked to its own Wikidata item. Everything escaped.
function renderCategory(event) {
  const summary = `Category: ${escapeHtml(categorySummary(event))}`;
  const parts = categorySourceParts(event);
  if (!parts.length) return `<p class="category">${summary}</p>`;
  const source = parts
    .map((p) => {
      if (typeof p === "string") return escapeHtml(p);
      const url = safeUrl(p.url);
      return url
        ? `<a class="wd" href="${escapeHtml(url)}" rel="noreferrer" aria-label="${escapeHtml(`${p.label} (Wikidata class)`)}">${escapeHtml(p.label)}</a>`
        : escapeHtml(p.label);
    })
    .join("");
  return `<details class="category"><summary>${summary}<span class="info" aria-hidden="true">ⓘ</span><span class="sr">, where this category comes from</span></summary><p class="category-source">${source}</p></details>`;
}

// Wikidata's "part of" (P361), in Wikidata's labels (src/lib/partOf.js): a parent
// that is one of our events links to its page, any other is plain text with a
// small link to its Wikidata item.

function renderPartOf(parents) {
  const list = (parents ?? []).filter((p) => p && typeof p.label === "string");
  if (!list.length) return "";
  const items = list.map((p) => {
    if (p.id && isValidEventId(p.id)) return link(eventPath(p.id), escapeHtml(p.label));
    const wd = wikidataUrl(p.qid);
    return wd
      ? `${escapeHtml(p.label)} <a class="wd" href="${escapeHtml(wd)}" rel="noreferrer" aria-label="Wikidata item for ${escapeHtml(p.label)}">Wikidata</a>`
      : escapeHtml(p.label);
  });
  return `<p class="partof">Part of: ${items.join(", ")}</p>`;
}

// The events in this dataset that Wikidata lists as part of this one (oldest first).
function renderIncludes(children) {
  const list = (children ?? []).filter((c) => c && isValidEventId(c.id));
  if (!list.length) return "";
  const items = list
    .map((c) => {
      const year = c.date_start ? ` <span class="year">${escapeHtml(String(c.date_start).slice(0, 4))}</span>` : "";
      return `<li>${link(eventPath(c.id), escapeHtml(c.title ?? c.id))}${year}</li>`;
    })
    .join("\n");
  return `<section class="includes" aria-labelledby="includes-title">
<h2 id="includes-title">Includes ${plural(list.length, "event", "events")} in this dataset</h2>
<ul>
${items}
</ul>
</section>`;
}

// Other events by a shared Wikidata parent, place or date (src/lib/related.js),
// closest first; the "same time" ones are day-exact, so they show the full date.
const RELATED_GROUPS = [
  ["shared_parent", "Also part of the same wider events"],
  ["nearby", `Nearby (within ${NEARBY_KM} km)`],
  ["same_time", "Around the same time (within six months)"],
];

function renderRelated(related) {
  const groups = RELATED_GROUPS.map(([key, heading]) => [key, heading, (related?.[key] ?? []).filter((r) => r && isValidEventId(r.id))]).filter(
    ([, , list]) => list.length
  );
  if (!groups.length) return "";
  const sections = groups.map(([key, heading, list]) => {
    const items = list
      .map((r) => {
        const when = key === "same_time" ? formatEventDate(r.date_start, null, { precision: "day" }) : r.date_start ? String(r.date_start).slice(0, 4) : "";
        const dir = Number.isFinite(r.bearing) ? ` ${compassPoint(r.bearing)}` : "";
        const km = Number.isFinite(r.km) ? `${when ? " · " : ""}${formatKm(r.km)}${dir}` : "";
        const meta = when || km ? ` <span class="year">${escapeHtml(when + km)}</span>` : "";
        return `<li>${link(eventPath(r.id), escapeHtml(r.title ?? r.id))}${meta}</li>`;
      })
      .join("\n");
    return `<h3>${escapeHtml(heading)}</h3>
<ul>
${items}
</ul>`;
  });
  return `<section class="includes related" aria-labelledby="related-title">
<h2 id="related-title">Related events in this dataset</h2>
${sections.join("\n")}
<p class="related-note">Chosen only by Wikidata’s “part of”, distance and date, closest first; up to ${RELATED_SHOWN} each. Places count only when both locations are precise.</p>
</section>`;
}

// The documented corrections applied to the event (src/lib/dataFixes.js), as the event panel says it.
function renderDataFixes(fixes) {
  if (!Array.isArray(fixes) || !fixes.length) return "";
  const links = fixes.map((f) => link(dataFixUrl(f), escapeHtml(f.ref), { external: true })).join(", ");
  return `<p class="note">Corrected by this project (${links} in our log of data fixes).</p>`;
}

// The events just before and after this one in the dataset's order (oldest
// first, as the /event/ index lists them), so every page links on to others,
// including the ones with nothing related.
function renderNeighbours(neighbours) {
  const side = (e, rel, label) => {
    if (!e || !isValidEventId(e.id)) return "";
    const year = e.date_start ? ` <span class="year">${escapeHtml(String(e.date_start).slice(0, 4))}</span>` : "";
    return `<li>${label}: <a href="${escapeHtml(eventPath(e.id))}" rel="${rel}">${escapeHtml(e.title ?? e.id)}</a>${year}</li>`;
  };
  const items = [side(neighbours?.prev, "prev", "Earlier"), side(neighbours?.next, "next", "Later")].filter(Boolean);
  if (!items.length) return "";
  return `<nav class="includes neighbours" aria-label="Earlier and later events">
<ul>
${items.join("\n")}
</ul>
</nav>`;
}

// "Cite this": the event's citations as the app's Cite dialog gives them (src/lib/citation.js), without the
// copy buttons (no JavaScript here); the italics as <i>.
function renderCitation(event) {
  const cite = citeEvent(event);
  if (!cite) return "";
  const [versionNote, chicagoNote] = citationNotes(cite);
  const styles = cite.styles
    .map((s) => {
      const text = s.parts.map((p) => (p.italic ? `<i>${escapeHtml(p.text)}</i>` : escapeHtml(p.text))).join("");
      return `<h3>${escapeHtml(s.label)}</h3>\n<p class="cite-text">${text}</p>`;
    })
    .join("\n");
  return `<section class="cite" aria-labelledby="cite-title">
<h2 id="cite-title">Cite this</h2>
<p class="note${cite.revid ? "" : " cite-live"}">${escapeHtml(versionNote)}</p>
${styles}
<p class="note">${escapeHtml(chicagoNote)}</p>
<p class="note">This event on ${escapeHtml(cite.siteName)}: ${escapeHtml(cite.eventPage)}</p>
<p class="note">If you use the map’s borders: ${escapeHtml(cite.borders)}</p>
</section>`;
}

function locationNote(quality, event) {
  if (quality === "approximate" && event?.approximate_reason === "rounded") {
    return `<p class="note">${escapeHtml(roundedLocationNote(event))}</p>`;
  }
  if (quality === "approximate") {
    return `<p class="note">${escapeHtml(fallbackLocationNote(event))}</p>`;
  }
  if (quality === "none") {
    return `<p class="note">No map location: Wikipedia and Wikidata give no coordinates for this event, so it has no marker on the map.</p>`;
  }
  return "";
}

// The page's own <head> tags: title, description, canonical, link-preview tags
// and structured data. `canonical` null (the 404 page, served at any path) leaves
// out canonical and og:url. `pageTitle` is the tab title (default `title`, which
// og:/twitter:title keep). `jsonLd` is an already-serialized jsonLdScript() block.
function pageMeta({ title, pageTitle = title, description, canonical, type, noindex = false, jsonLd = "" }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const c = canonical ? escapeHtml(canonical) : null;
  return `<title>${escapeHtml(pageTitle)}</title>
${noindex ? `<meta name="robots" content="noindex">\n` : ""}${description ? `<meta name="description" content="${d}">\n` : ""}${c ? `<link rel="canonical" href="${c}">\n` : ""}<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${t}">
${description ? `<meta property="og:description" content="${d}">\n` : ""}${c ? `<meta property="og:url" content="${c}">\n` : ""}<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Map of the Middle East with the title ${escapeHtml(SITE_NAME)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
${description ? `<meta name="twitter:description" content="${d}">\n` : ""}<meta name="twitter:image" content="${OG_IMAGE}">${jsonLd ? `\n${jsonLd}` : ""}`;
}

// The site's icons (public/, made by scripts/make-icons.mjs), as index.html links
// them: the SVG for browsers that take it, favicon.ico for the rest (and for the
// /favicon.ico they ask for on their own), and the home-screen icon for iOS.
export const ICON_LINKS = `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

// A whole <head> for the pages that are not the app (the /event/ index, 404.html).
function head(meta) {
  return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${ICON_LINKS}
<link rel="stylesheet" href="/event/event.css">
<meta name="theme-color" content="#1d1a15">
${pageMeta(meta)}
</head>`;
}

// The two regions of index.html an event's page replaces, each between a pair of
// comment markers (Vite keeps comments): the site's own <head> tags, and the
// body's #root with the <noscript> note for the map.
export const SHELL_MARKERS = {
  meta: ["<!-- page-meta -->", "<!-- /page-meta -->"],
  body: ["<!-- page-body -->", "<!-- /page-body -->"],
};

function replaceRegion(html, [open, close], content) {
  const count = (m) => html.split(m).length - 1;
  if (count(open) !== 1 || count(close) !== 1) {
    throw new Error(`app shell: expected "${open}" and "${close}" exactly once each in index.html`);
  }
  const i = html.indexOf(open);
  const j = html.indexOf(close);
  if (j < i) throw new Error(`app shell: "${close}" comes before "${open}" in index.html`);
  return html.slice(0, i) + content + html.slice(j + close.length);
}

/**
 * index.html (`template`, as Vite built it) with the page's own <head> tags
 * (`meta`, as pageMeta takes them) and `content` inside #root. The event page's
 * stylesheet is inside <noscript> (NO_JS_STYLESHEET), so it loads only without
 * JavaScript and never touches the app (a "scripting: none" media query does
 * the same only from Safari 17 on). With JavaScript the app's CSS keeps
 * `content` hidden until React replaces it (src/index.css, html.js .static-page,
 * the class index.html's first script sets). `preload` (a same-origin path) is
 * the event's full-record bucket, fetched as the app's fetch() will ask for it
 * (crossorigin anonymous: same credentials mode), so it downloads while the
 * JavaScript does instead of after it.
 */
export const NO_JS_STYLESHEET = `<noscript><link rel="stylesheet" href="/event/event.css"></noscript>`;

export const preloadTag = (href) => `<link rel="preload" href="${escapeHtml(href)}" as="fetch" crossorigin="anonymous">`;

export function fillAppShell(template, meta, content, { preload = null } = {}) {
  const withMeta = replaceRegion(
    template,
    SHELL_MARKERS.meta,
    `${pageMeta(meta)}\n${preload ? `${preloadTag(preload)}\n` : ""}${NO_JS_STYLESHEET}`
  );
  return replaceRegion(withMeta, SHELL_MARKERS.body, `<div id="root"><div class="static-page">\n${content}\n</div></div>`);
}

const siteHeader = `<header class="site-header"><a href="/" class="site-name">${escapeHtml(SITE_NAME)}</a> <a href="/event/" class="site-index">All events</a></header>`;

const siteFooter = `<footer class="site-footer"><p>${escapeHtml(SITE_NAME)} is a non-commercial project: an interactive map and timeline of major Middle East events since 1900. Event text comes from Wikipedia and Wikidata; borders are adapted from ${link(CSHAPES_URL, "CShapes 2.0", { external: true })} (CC BY-NC-SA 4.0), and the West Bank&#39;s Areas A, B and C from ${link(OCHA_AREAS_URL, "UN OCHA", { external: true })} (non-commercial use, credited to UN OCHA). ${link(REPO, "Source and data documentation on GitHub", { external: true })}.</p></footer>`;

export function eventDateText(event) {
  const flags = (event.date_flags ?? []).filter(Boolean);
  return formatEventDate(event.date_start, event.date_end, { precision: event.date_precision ?? null, yearOnly: flags.length > 0 });
}

/**
 * The tab title: the share title and the site name, "Title (1912–1913) – site".
 * No dates, or a title that names its own years: "Title – site".
 */
export function eventPageTitle(event) {
  return `${eventShareTitle(event)} – ${SITE_NAME}`;
}

// A year (1800-2099) standing alone in a title: "1929 Palestine riots",
// "Capture of Baghdad (1917)". Longer numbers (Metrojet Flight 9268) do not count.
const TITLE_YEAR_RE = /(?<!\d)(?:1[89]|20)\d\d(?!\d)/;

/** Whether a title already names a year, so no "(years)" is added to it. */
export function titleHasYear(title) {
  return TITLE_YEAR_RE.test(String(title ?? ""));
}

/**
 * The link-preview title (og:title, twitter:title): "Title (1912–1913)", the tab
 * title without the site name, which og:site_name already gives, with the years
 * as the dates give them (rawEventYears). No dates: the title alone. A title that
 * already names a year is left alone too: "Capture of Baghdad (1917)" is not
 * followed by "(1917)" again, nor "Political violence in Turkey (1976–1980)" by
 * the dates' different "(1968–1980)" (Wikipedia's title and Wikidata's dates can
 * disagree; the page itself shows the dates).
 */
export function eventShareTitle(event) {
  const title = String(event.title ?? event.id);
  if (titleHasYear(title)) return title;
  const [s, e] = rawEventYears(event);
  const years = event.date_start && Number.isFinite(s) ? (e !== s ? `${s}–${e}` : `${s}`) : "";
  return `${title}${years ? ` (${years})` : ""}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A Wikidata date as ISO 8601 at no more precision than the data records (the
// same rule as formatEventDate): a day, a month, or else the year.
function isoDate(date, precision) {
  const m = DATE_RE.exec(String(date ?? ""));
  if (!m) return null;
  if (precision === "day" && Number(m[2]) && Number(m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((precision === "day" || precision === "month") && Number(m[2])) return `${m[1]}-${m[2]}`;
  return m[1];
}

/**
 * schema.org structured data for an event page: the WebPage, based on the
 * Wikipedia article under its licence, about a Thing identified by its
 * Wikipedia article and Wikidata item (sameAs). Not a schema.org Event: Google
 * reads Event as something to attend and requires a location, which most of
 * these topics (wars, treaties, crises) do not have. The page's own
 * temporalCoverage (an ISO 8601 date or "start/end" interval) carries the dates
 * at the precision recorded, and spatialCoverage a precise pin only: a
 * capital-city fallback is not where the event happened. Name and description
 * are Wikipedia's words (the description is the meta description).
 */
export function eventJsonLd(event) {
  const title = String(event.title ?? event.id);
  const canonical = SITE + eventPath(event.id);
  const wiki = safeUrl(event.wikipedia_url);
  const wd = wikidataUrl(event.wikidata_qid);
  const flagged = (event.date_flags ?? []).filter(Boolean).length > 0;
  const reversed = Boolean(event.date_start && event.date_end && String(event.date_end) < String(event.date_start));
  // Flagged (unverified) or reversed dates: years only, as the page shows them.
  const startDate = isoDate(event.date_start, flagged || reversed ? "year" : (event.date_precision ?? null));
  // No precision is recorded for an end date: the year only. A reversed range is
  // not valid structured data, so it gets no endDate; the page shows both dates
  // and a note.
  const endDate = event.date_end && !reversed ? isoDate(event.date_end, "year") : null;
  const c = event.coordinates;
  const precise = event.location_quality === "precise" && Number.isFinite(c?.lat) && Number.isFinite(c?.lon);
  const description = metaDescription(event.extract);
  const sameAs = [wiki, wd].filter(Boolean);
  const temporalCoverage = startDate ? (endDate && endDate !== startDate ? `${startDate}/${endDate}` : startDate) : null;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonical,
    url: canonical,
    name: title,
    ...(description && { description }),
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE}/` },
    ...(wiki && { isBasedOn: wiki }),
    license: CC_BY_SA,
    ...(temporalCoverage && { temporalCoverage }),
    ...(precise && {
      spatialCoverage: { "@type": "Place", geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon } },
    }),
    about: {
      "@type": "Thing",
      name: title,
      ...(sameAs.length && { sameAs }),
    },
  };
}

/**
 * A JSON-LD <script> block. It is a data block, never run, so the CSP's
 * script-src does not apply. "<", ">" and "&" are written as \u escapes so no
 * value can close the element ("</script>") or open a comment; U+2028 and
 * U+2029 too. JSON.parse of the content gives back `data`.
 */
export function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * One event's page: the app shell `template` (dist/index.html) filled with the
 * event (fillAppShell). `event` is the lite record (split-data.mjs publicEvent)
 * merged with its full-lead record (extract, extract_retrieved_at, date_precision,
 * framing_review, part_of, includes, related). Every field may be missing except id and title.
 * `neighbours` ({prev, next}, lite records) are the events before and after it in
 * the dataset's order; `preload` is its full-record bucket's path (fillAppShell).
 */
export function renderEventPage(event, template, { neighbours = null, preload = null } = {}) {
  if (!isValidEventId(event?.id)) throw new Error(`invalid event id: ${JSON.stringify(event?.id)}`);
  const title = String(event.title ?? event.id);
  const canonical = SITE + eventPath(event.id);
  const review = event.framing_review ?? null;
  const extract = String(event.extract ?? "");
  const lead = metaDescription(extract, DESCRIPTION_LENGTH - PREVIEW_SOURCE.length);
  const description = lead && PREVIEW_SOURCE + lead;
  const wiki = safeUrl(event.wikipedia_url);
  const dateText = eventDateText(event);
  const countries = (event.countries ?? []).filter((c) => typeof c === "string" && c);
  // Only the classes on the event-class list (src/lib/eventClasses.js), as the event panel shows them.
  const classes = shownClasses(event);
  const showClasses = classes.length > 0;
  const itemUrl = wikidataUrl(event.wikidata_qid);
  const dateNote = dateOrderNote(event);
  const retrieved = event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null;
  const paragraphs = extract.split(/\n+/).filter((p) => p.trim());

  const meta = [dateText, countries.map(countryLabel).join(", ")].filter(Boolean).map(escapeHtml).join(" · ");
  const body = [
    event.category && renderCategory(event),
    `<h1>${escapeHtml(title)}</h1>`,
    meta && `<p class="meta">${meta}</p>`,
    renderPartOf(event.part_of),
    showClasses &&
      `<p class="classes">Wikidata classes on our event-class list: ${escapeHtml(classes.join(", "))}${
        itemUrl ? ` (all its classes: <a class="wd" href="${escapeHtml(itemUrl)}" rel="noreferrer">Wikidata item</a>)` : ""
      }</p>`,
    dateNote && `<p class="note" role="note">${escapeHtml(dateNote)}</p>`,
    wiki && `<p class="actions"><a class="wiki" href="${escapeHtml(wiki)}" rel="noreferrer">Read on Wikipedia</a></p>`,
    event.text_from_article && `<p class="note" role="note">${escapeHtml(otherArticleNote(event.text_from_article))}</p>`,
    renderPointer(review),
    `<div class="extract">${paragraphs.length ? paragraphs.map((p) => renderParagraph(p, review?.highlights)).join("\n") : "<p>No summary available.</p>"}</div>`,
    retrieved && `<p class="asof">Text retrieved ${escapeHtml(retrieved)} from Wikipedia.</p>`,
    renderCitation(event),
    renderReview(event, review),
    renderIncludes(event.includes),
    renderRelated(event.related),
    renderNeighbours(neighbours),
    locationNote(event.location_quality, event),
    event.hand_picked && `<p class="note">${escapeHtml(HAND_PICKED_NOTE)}</p>`,
    renderDataFixes(event.data_fixes),
    `<p class="attribution">Text from Wikipedia (the article’s lead section as plain text, references removed), licensed ${link(CC_BY_SA, "CC BY-SA 4.0", { external: true })} by ${
      wiki ? link(historyUrl(wiki), "Wikipedia contributors", { external: true }) : "Wikipedia contributors"
    }${wiki ? `, from the article ${link(wiki, escapeHtml(title), { external: true })}` : ""}.${showClasses ? " Classes are Wikidata’s labels (CC0)." : ""}${
      event.part_of?.length ? " “Part of” is Wikidata’s statement, in its labels (CC0)." : ""
    }</p>`,
  ].filter(Boolean);

  return fillAppShell(
    template,
    { title: eventShareTitle(event), pageTitle: eventPageTitle(event), description, canonical, type: "article", jsonLd: jsonLdScript(eventJsonLd(event)) },
    `${siteHeader}
<main>
<article>
${body.join("\n")}
</article>
</main>
${siteFooter}`,
    { preload }
  );
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

/**
 * dist/404.html: what the host serves, with status 404, for any path that is not a
 * file (wrangler.jsonc not_found_handling "404-page"). The app is served only at /
 * and at the event pages, so a mistyped /event/<id> lands here instead of on the
 * map with nothing selected.
 * Links are absolute because the page is served at whatever path was asked for.
 */
export function renderNotFoundPage() {
  return `<!doctype html>
<html lang="en">
${head({ title: `Page not found · ${SITE_NAME}`, description: "", canonical: null, type: "website", noindex: true })}
<body>
${siteHeader}
<main>
<h1>Page not found</h1>
<p>There is no page at this address. It may have been mistyped, or the event may have been renamed or removed.</p>
<p><a class="open-map" href="/">Open the map</a> or browse <a href="/event/">all events</a>.</p>
</main>
${siteFooter}
</body>
</html>
`;
}

// The day an event's text was retrieved from Wikipedia (extract_retrieved_at, an
// ISO timestamp), as a sitemap date, or null.
const retrievedDay = (e) => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(String(e?.extract_retrieved_at ?? ""));
  return m ? m[1] : null;
};

/**
 * sitemap.xml: the home page, the event index and every event page. An event's
 * <lastmod> is the day its text was retrieved from Wikipedia (the page changes
 * when that text does); the home page's and the index's is the latest of those.
 * A page with no retrieval date gets none.
 */
export function renderSitemap(events) {
  const days = events.map(retrievedDay);
  const latest = days.filter(Boolean).sort().at(-1) ?? null;
  const urls = [
    [`${SITE}/`, latest],
    [`${SITE}/event/`, latest],
    ...events.map((e, i) => [SITE + eventPath(e.id), days[i]]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, day]) => `  <url><loc>${escapeHtml(u)}</loc>${day ? `<lastmod>${day}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}
