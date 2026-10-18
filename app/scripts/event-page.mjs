// Renders the per-event pages (/event/<id>), the /event/ index and sitemap.xml.
// Pure functions over the records split-data.mjs writes (the lite record merged
// with its full-lead record), so the page shows exactly what the app's detail view
// shows: Wikipedia's title and lead unchanged, Wikidata's dates and classes as
// given, and our framing review boxed off as ours. Driven by
// build-event-pages.mjs; tested in event-page.test.mjs.
//
// An event's page IS the app (fillAppShell): the built index.html with the
// event's own title and link-preview tags in its <head>, and the event as plain
// HTML inside #root for readers without JavaScript and crawlers that do not run
// it. The app replaces that content when it starts, reads the event from the path
// (src/lib/urlState.js) and opens it on the map.
import { rtlRuns, splitBidi } from "../src/lib/bidi.js";
import { categoryLabel } from "../src/lib/categoryLabels.js";
import { dateOrderNote } from "../src/lib/dateOrderNote.js";
import { formatEventDate } from "../src/lib/eventDate.js";
import { rawEventYears } from "../src/lib/eventYears.js";
import { markSegments } from "../src/lib/highlights.js";
import { otherArticleNote } from "../src/lib/otherArticle.js";
import { wikidataUrl } from "../src/lib/partOf.js";
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
      return `<mark class="${cls}" title="Flagged by the ${escapeHtml(by || "framing review")}. See the review below.">${text}</mark>`;
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

function locationNote(quality) {
  if (quality === "approximate") {
    return `<p class="note">Approximate location: this event isn’t tied to a single known site, so its marker on the map is placed at a national capital.</p>`;
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

// A whole <head> for the pages that are not the app (the /event/ index, 404.html).
function head(meta) {
  return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
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
 * stylesheet applies only without JavaScript (media "scripting: none"), so it
 * never touches the app; with JavaScript the app's CSS keeps `content` hidden
 * until React replaces it (src/index.css .static-page).
 */
export function fillAppShell(template, meta, content) {
  const withMeta = replaceRegion(
    template,
    SHELL_MARKERS.meta,
    `${pageMeta(meta)}\n<link rel="stylesheet" href="/event/event.css" media="(scripting: none)">`
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
 * The tab title, as the app sets it (App.jsx): "Title (1912–1913) – site", with
 * the years as the dates give them (rawEventYears). No dates: "Title – site".
 */
export function eventPageTitle(event) {
  const title = String(event.title ?? event.id);
  const [s, e] = rawEventYears(event);
  const years = event.date_start && Number.isFinite(s) ? (e !== s ? `${s}–${e}` : `${s}`) : "";
  return `${title}${years ? ` (${years})` : ""} – ${SITE_NAME}`;
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
 * Wikipedia article under its licence, about an Event with the dates at the
 * precision recorded. The Event is the page's subject ("about"), not the page
 * itself, so search engines are not invited to list a historical event as one
 * to attend. A location is given only for a precise pin: a capital-city
 * fallback is not where the event happened. Name and description are
 * Wikipedia's, unchanged (the description is the meta description).
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
    about: {
      "@type": "Event",
      name: title,
      ...(startDate && { startDate }),
      ...(endDate && endDate !== startDate && { endDate }),
      ...(precise && {
        location: { "@type": "Place", geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon } },
      }),
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
 * framing_review, part_of, includes). Every field may be missing except id and title.
 */
export function renderEventPage(event, template) {
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
  const dateNote = dateOrderNote(event);
  const retrieved = event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null;
  const paragraphs = extract.split(/\n+/).filter((p) => p.trim());

  const meta = [dateText, countries.join(", ")].filter(Boolean).map(escapeHtml).join(" · ");
  const body = [
    event.category && `<p class="category">Category (our grouping): ${escapeHtml(categoryLabel(event.category))}</p>`,
    `<h1>${escapeHtml(title)}</h1>`,
    meta && `<p class="meta">${meta}</p>`,
    renderPartOf(event.part_of),
    showClasses && `<p class="classes">Wikidata classes: ${escapeHtml(classes.join(", "))}</p>`,
    dateNote && `<p class="note" role="note">${escapeHtml(dateNote)}</p>`,
    wiki && `<p class="actions"><a class="wiki" href="${escapeHtml(wiki)}" rel="noreferrer">Read on Wikipedia</a></p>`,
    event.text_from_article && `<p class="note" role="note">${escapeHtml(otherArticleNote(event.text_from_article))}</p>`,
    renderPointer(review),
    `<div class="extract">${paragraphs.length ? paragraphs.map((p) => renderParagraph(p, review?.highlights)).join("\n") : "<p>No summary available.</p>"}</div>`,
    retrieved && `<p class="asof">Text retrieved ${escapeHtml(retrieved)} from Wikipedia.</p>`,
    renderReview(event, review),
    renderIncludes(event.includes),
    locationNote(event.location_quality),
    `<p class="attribution">Text from Wikipedia, licensed ${link(CC_BY_SA, "CC BY-SA 4.0", { external: true })} by ${
      wiki ? link(historyUrl(wiki), "Wikipedia contributors", { external: true }) : "Wikipedia contributors"
    }${wiki ? `, from the article ${link(wiki, escapeHtml(title), { external: true })}` : ""}.${showClasses ? " Classes are Wikidata’s labels (CC0)." : ""}${
      event.part_of?.length ? " “Part of” is Wikidata’s statement, in its labels (CC0)." : ""
    }</p>`,
  ].filter(Boolean);

  return fillAppShell(
    template,
    { title, pageTitle: eventPageTitle(event), description, canonical, type: "article", jsonLd: jsonLdScript(eventJsonLd(event)) },
    `${siteHeader}
<main>
<article>
${body.join("\n")}
</article>
</main>
${siteFooter}`
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

/** sitemap.xml: the home page, the event index and every event page. */
export function renderSitemap(events) {
  const urls = [`${SITE}/`, `${SITE}/event/`, ...events.map((e) => SITE + eventPath(e.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`).join("\n")}
</urlset>
`;
}
