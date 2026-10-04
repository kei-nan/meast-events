import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLead, titleFromWikipediaUrl, LEAD_BATCH } from "./lead.js";

test("normalizeLead: whitespace only - CRLF, Unicode spaces, runs and blank lines", () => {
  const raw = "  The Suez  Crisis\twas an invasion.\r\n\r\n\r\nIt　ended in 1957. \n";
  assert.equal(normalizeLead(raw), "The Suez Crisis was an invasion.\n\nIt ended in 1957.");
});

test("normalizeLead: every paragraph break becomes exactly one blank line", () => {
  assert.equal(normalizeLead("A.\nB.\n\n\n\nC.\rD."), "A.\n\nB.\n\nC.\n\nD.");
});

test("normalizeLead: no character other than whitespace changes", () => {
  const raw = "Ṣalāḥ al-Dīn — “quoted” (1187–1192), 50 % … ‘x’";
  assert.equal(normalizeLead(raw), raw);
  const strip = (s) => s.replace(/\s+/g, "");
  const messy = "  Café été   1948–\n\n49  ";
  assert.equal(strip(normalizeLead(messy)), strip(messy.replace(/[  -  　]/g, " ")));
});

test("normalizeLead: empty or non-string input gives null", () => {
  assert.equal(normalizeLead(""), null);
  assert.equal(normalizeLead(" \n \r\n "), null);
  assert.equal(normalizeLead(undefined), null);
  assert.equal(normalizeLead(null), null);
  assert.equal(normalizeLead(42), null);
});

test("titleFromWikipediaUrl: decodes the slug, underscores to spaces, drops the section", () => {
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/wiki/Six-Day_War"), "Six-Day War");
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/wiki/Sykes%E2%80%93Picot_Agreement"), "Sykes–Picot Agreement");
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/wiki/Iran%E2%80%93Iraq_War#Background"), "Iran–Iraq War");
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/wiki/Coup_d%27%C3%A9tat"), "Coup d'état");
});

test("titleFromWikipediaUrl: null for anything that is not a /wiki/ link", () => {
  assert.equal(titleFromWikipediaUrl(null), null);
  assert.equal(titleFromWikipediaUrl(""), null);
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/w/index.php?title=X"), null);
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/wiki/"), null);
  assert.equal(titleFromWikipediaUrl("https://en.wikipedia.org/wiki/Bad%E2%80"), null, "malformed percent-encoding");
});

test("LEAD_BATCH stays within the TextExtracts exintro limit of 20", () => {
  assert.ok(LEAD_BATCH >= 1 && LEAD_BATCH <= 20);
});
