// Links that come from the data (Wikipedia URLs, guideline links) are rendered
// only when they are plain web links: anything else (javascript:, data:,
// relative paths) gives null and the text is shown without a link. Pure.

/** The URL as given if it is an absolute http(s) URL, else null. */
export function safeUrl(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
