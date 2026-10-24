import test from "node:test";
import assert from "node:assert/strict";
import { articleTitle, citationNotes, citeEvent, isoDay, longDate, mlaDate, permalink } from "./citation.js";

const event = (o = {}) => ({
  id: "six-day-war",
  title: "Six-Day War",
  wikipedia_url: "https://en.wikipedia.org/wiki/Six-Day_War",
  extract_retrieved_at: "2026-09-26",
  wikipedia_revid: 1300000000,
  ...o,
});

const byId = (c) => Object.fromEntries(c.styles.map((s) => [s.id, s.text]));

test("dates: APA/Chicago long form, MLA day-month with the Handbook's abbreviations", () => {
  assert.deepEqual(isoDay("2026-09-26T04:00:00Z"), { y: 2026, m: 9, d: 26 });
  assert.equal(isoDay("26 Sept 2026"), null);
  assert.equal(isoDay("2026-13-01"), null);
  assert.equal(longDate({ y: 2026, m: 9, d: 6 }), "September 6, 2026");
  assert.equal(mlaDate({ y: 2026, m: 9, d: 6 }), "6 Sept. 2026");
  assert.equal(mlaDate({ y: 2026, m: 6, d: 1 }), "1 June 2026");
  assert.equal(mlaDate({ y: 2026, m: 5, d: 1 }), "1 May 2026");
});

test("articleTitle and permalink", () => {
  assert.equal(articleTitle("https://en.wikipedia.org/wiki/Israel%E2%80%93Hamas_war#Background"), "Israel–Hamas war");
  assert.equal(articleTitle("https://fr.wikipedia.org/wiki/X"), null);
  assert.equal(articleTitle(null), null);
  // APA's own example link
  assert.equal(permalink("Oil painting", 929802398), "https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398");
  assert.equal(permalink("Israel–Hamas war", 5), "https://en.wikipedia.org/w/index.php?title=Israel%E2%80%93Hamas_war&oldid=5");
});

test("with a revision: the three styles cite the permanent link", () => {
  const c = citeEvent(event());
  const link = "https://en.wikipedia.org/w/index.php?title=Six-Day_War&oldid=1300000000";
  assert.equal(c.url, link);
  assert.equal(c.revid, 1300000000);
  assert.deepEqual(byId(c), {
    apa: `Six-Day War. (n.d.). In Wikipedia. Retrieved September 26, 2026, from ${link}`,
    mla: "“Six-Day War.” Wikipedia: The Free Encyclopedia, Wikimedia Foundation, en.wikipedia.org/w/index.php?title=Six-Day_War&oldid=1300000000. Accessed 26 Sept. 2026.",
    chicago: `Wikipedia, “Six-Day War,” accessed September 26, 2026, ${link}.`,
    "chicago-short": "Wikipedia, “Six-Day War.”",
  });
  assert.equal(c.eventPage, "https://middleeast.events/event/six-day-war");
  assert.match(c.borders, /^CShapes 2\.0 - historical country borders\. Schvitz, G\., et al\. \(2022\)\. CC BY-NC-SA 4\.0\./);
  assert.match(citationNotes(c)[0], /revision 1300000000/);
});

test("italics: Wikipedia (APA) and the MLA container are italic parts, and the plain text is the parts joined", () => {
  const c = citeEvent(event());
  for (const s of c.styles) assert.equal(s.parts.map((p) => p.text).join(""), s.text);
  assert.deepEqual(c.styles.find((s) => s.id === "apa").parts.filter((p) => p.italic).map((p) => p.text), ["Wikipedia"]);
  assert.deepEqual(c.styles.find((s) => s.id === "mla").parts.filter((p) => p.italic).map((p) => p.text), ["Wikipedia: The Free Encyclopedia"]);
});

test("without a revision: the article URL and the retrieval date, and a note that the text may have changed", () => {
  const c = citeEvent(event({ wikipedia_revid: undefined }));
  const url = "https://en.wikipedia.org/wiki/Six-Day_War";
  assert.equal(c.revid, null);
  assert.equal(byId(c).apa, `Six-Day War. (n.d.). In Wikipedia. Retrieved September 26, 2026, from ${url}`);
  assert.equal(byId(c).chicago, `Wikipedia, “Six-Day War,” accessed September 26, 2026, ${url}.`);
  assert.match(citationNotes(c)[0], /may have changed since it was retrieved on September 26, 2026/);
  // an invalid stored value is treated as none
  assert.equal(citeEvent(event({ wikipedia_revid: "12" })).revid, null);
});

test("the cited title is the article's, not our label; a title ending in ? or ! takes no extra period", () => {
  const c = citeEvent(event({ title: "Our label", wikipedia_url: "https://en.wikipedia.org/wiki/Who_Is_a_Jew%3F", wikipedia_revid: 9 }));
  assert.equal(c.title, "Who Is a Jew?");
  assert.match(byId(c).apa, /^Who Is a Jew\? \(n\.d\.\)/);
  assert.match(byId(c).mla, /^“Who Is a Jew\?” Wikipedia/);
  assert.match(byId(c).chicago, /^Wikipedia, “Who Is a Jew\?” accessed/);
});

test("no English article: no citation", () => {
  assert.equal(citeEvent(event({ wikipedia_url: null })), null);
  assert.deepEqual(citationNotes(null), []);
});
