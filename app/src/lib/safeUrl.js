// Links that come from the data (Wikipedia URLs, guideline links) are rendered
// only when they are plain web links: anything else (javascript:, data:,
// relative paths) gives null and the text is shown without a link. Pure.
// The one check for the app and the static event pages (scripts/event-page.mjs).

/**
 * The URL as given if it is an absolute http(s) URL written out in full, else null:
 * "http://" or "https://" (any case) at the very start, then a host, and no
 * whitespace anywhere. The URL parser alone would be laxer: it trims " https://x.org",
 * reads "https:x.org" as https://x.org/, and the URL returned is the string as given.
 */
export function safeUrl(url) {
  if (typeof url !== "string" || !/^https?:\/\/[^\s/?#]\S*$/i.test(url)) return null;
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && hostname ? url : null;
  } catch {
    return null;
  }
}
