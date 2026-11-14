// The attribution line under an event's text, one wording for the event panel (components/EventDetail.jsx)
// and the static event page (scripts/event-page.mjs): it names the licence, links the authors (the
// article's history), says what was changed (CC BY-SA 4.0 section 3(a)(1)(B): the lead only, as plain
// text, references removed) and names the article, which is another item's for an event without an
// article of its own (text_from_article, lib/otherArticle.js). Pure.

import { safeUrl } from "./safeUrl.js";

export const TEXT_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

/** The change made to Wikipedia's text, as every attribution states it. */
export const TEXT_FORM = "the article’s lead section as plain text, references removed";

/** The article's revision history: its list of authors. */
export function historyUrl(wikipediaUrl) {
  return wikipediaUrl + (wikipediaUrl.includes("?") ? "&" : "?") + "action=history";
}

/**
 * The attribution as parts: strings, and links { text, href } (all external). The Wikipedia link only
 * when it is a plain web address (lib/safeUrl.js). `classes` / `partOf`: whether the panel shows
 * Wikidata's classes and its "part of", whose CC0 notes follow.
 *
 * @param {{ title?: string, wikipedia_url?: string, text_from_article?: string|null }} event
 * @param {{ classes?: boolean, partOf?: boolean }} [shown]
 * @returns {(string | { text: string, href: string })[]}
 */
export function textAttributionParts(event, { classes = false, partOf = false } = {}) {
  const wiki = safeUrl(event?.wikipedia_url);
  const article = String(event?.text_from_article ?? event?.title ?? "");
  return [
    `Text from Wikipedia (${TEXT_FORM}), licensed `,
    { text: "CC BY-SA 4.0", href: TEXT_LICENSE_URL },
    " by ",
    wiki ? { text: "Wikipedia contributors", href: historyUrl(wiki) } : "Wikipedia contributors",
    ...(wiki && article ? [", from the article ", { text: article, href: wiki }] : []),
    ".",
    ...(classes ? [" Classes are Wikidata’s labels (CC0)."] : []),
    ...(partOf ? [" “Part of” is Wikidata’s statement, in its labels (CC0)."] : []),
  ];
}
