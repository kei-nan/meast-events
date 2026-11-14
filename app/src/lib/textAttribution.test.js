import test from "node:test";
import assert from "node:assert/strict";
import { TEXT_LICENSE_URL, historyUrl, textAttributionParts } from "./textAttribution.js";

const text = (parts) => parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

test("textAttributionParts: licence, authors, the change made and the article", () => {
  const url = "https://en.wikipedia.org/wiki/Six-Day_War";
  const parts = textAttributionParts({ title: "Six-Day War", wikipedia_url: url });
  assert.equal(
    text(parts),
    "Text from Wikipedia (the article’s lead section as plain text, references removed), licensed CC BY-SA 4.0 by Wikipedia contributors, from the article Six-Day War."
  );
  assert.deepEqual(
    parts.filter((p) => typeof p !== "string"),
    [
      { text: "CC BY-SA 4.0", href: TEXT_LICENSE_URL },
      { text: "Wikipedia contributors", href: `${url}?action=history` },
      { text: "Six-Day War", href: url },
    ]
  );
});

test("textAttributionParts: another item's article is named; no safe link, no links to it; Wikidata notes when shown", () => {
  const other = textAttributionParts({ title: "Ein HaShlosha massacre", text_from_article: "October 7 attacks", wikipedia_url: "https://en.wikipedia.org/wiki/October_7_attacks" });
  assert.match(text(other), /from the article October 7 attacks\.$/);
  const none = textAttributionParts({ title: "X", wikipedia_url: "javascript:alert(1)" }, { classes: true, partOf: true });
  assert.equal(
    text(none),
    "Text from Wikipedia (the article’s lead section as plain text, references removed), licensed CC BY-SA 4.0 by Wikipedia contributors. Classes are Wikidata’s labels (CC0). “Part of” is Wikidata’s statement, in its labels (CC0)."
  );
  assert.equal(none.filter((p) => typeof p !== "string").length, 1, "only the licence is linked");
  assert.equal(historyUrl("https://x/w?a=1"), "https://x/w?a=1&action=history");
});
