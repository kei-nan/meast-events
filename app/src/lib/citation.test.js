import test from "node:test";
import assert from "node:assert/strict";
import { apaDate, articleTitle, citationNotes, citeEvent, isoDay, longDate, mlaDate, permalink, revisionDay } from "./citation.js";

const event = (o = {}) => ({
  id: "six-day-war",
  title: "Six-Day War",
  wikipedia_url: "https://en.wikipedia.org/wiki/Six-Day_War",
  extract_retrieved_at: "2026-09-26",
  wikipedia_revid: 1300000000,
  wikipedia_revid_timestamp: "2026-10-05T09:07:41Z",
  ...o,
});
const undated = (o = {}) => {
  const e = event(o);
  delete e.wikipedia_revid;
  delete e.wikipedia_revid_timestamp;
  return e;
};

const byId = (c) => Object.fromEntries(c.styles.map((s) => [s.id, s.text]));

test("dates: APA reference and retrieval forms, MLA day-month with the Handbook's abbreviations, revision time in UTC", () => {
  assert.deepEqual(isoDay("2026-09-26T04:00:00Z"), { y: 2026, m: 9, d: 26 });
  assert.equal(isoDay("26 Sept 2026"), null);
  assert.equal(isoDay("2026-13-01"), null);
  assert.equal(longDate({ y: 2026, m: 9, d: 6 }), "September 6, 2026");
  assert.equal(apaDate({ y: 2019, m: 12, d: 8 }), "2019, December 8");
  assert.equal(mlaDate({ y: 2026, m: 9, d: 6 }), "6 Sept. 2026");
  assert.equal(mlaDate({ y: 2026, m: 6, d: 1 }), "1 June 2026");
  assert.equal(mlaDate({ y: 2026, m: 5, d: 1 }), "1 May 2026");
  assert.deepEqual(revisionDay("2026-10-15T19:38:37Z"), { y: 2026, m: 10, d: 15, time: "19:38" });
  assert.equal(revisionDay("2026-10-15"), null);
});

test("articleTitle and permalink", () => {
  assert.equal(articleTitle("https://en.wikipedia.org/wiki/Israel%E2%80%93Hamas_war#Background"), "Israel–Hamas war");
  assert.equal(articleTitle("https://fr.wikipedia.org/wiki/X"), null);
  assert.equal(articleTitle(null), null);
  // APA's own example link
  assert.equal(permalink("Oil painting", 929802398), "https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398");
  assert.equal(permalink("Israel–Hamas war", 5), "https://en.wikipedia.org/w/index.php?title=Israel%E2%80%93Hamas_war&oldid=5");
});

test("APA's own example comes out exactly (dated form)", () => {
  const c = citeEvent({ id: "x", wikipedia_url: "https://en.wikipedia.org/wiki/Oil_painting", wikipedia_revid: 929802398, wikipedia_revid_timestamp: "2019-12-08T12:00:00Z" });
  assert.equal(byId(c).apa, "Oil painting. (2019, December 8). In Wikipedia. https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398");
});

test("with a revision and its date: each style's dated form and the permanent link, no retrieval date", () => {
  const c = citeEvent(event());
  const link = "https://en.wikipedia.org/w/index.php?title=Six-Day_War&oldid=1300000000";
  assert.equal(c.url, link);
  assert.equal(c.revid, 1300000000);
  assert.deepEqual(byId(c), {
    apa: `Six-Day War. (2026, October 5). In Wikipedia. ${link}`,
    mla: "“Six-Day War.” Wikipedia: The Free Encyclopedia, Wikimedia Foundation, 5 Oct. 2026, en.wikipedia.org/w/index.php?title=Six-Day_War&oldid=1300000000.",
    chicago: `Wikipedia, “Six-Day War,” last modified October 5, 2026, 09:07 (UTC), ${link}.`,
    "chicago-short": "Wikipedia, “Six-Day War.”",
  });
  assert.equal(c.eventPage, "https://middleeast.events/event/six-day-war");
  assert.match(c.borders, /^CShapes 2\.0 - historical country borders\. Schvitz, G\., et al\. \(2022\)\. CC BY-NC-SA 4\.0\./);
  // Every source of the drawn borders that NOTICE credits, with its own terms: OCHA's are not a CC licence.
  assert.match(c.borders, /UN OCHA \/ HDX "Oslo Agreement" Areas A\/B\/C \(West Bank\)\. Distributed under the legacy HumanitarianResponse\.info terms: non-commercial use with credit to UN OCHA\. https:\/\/data\.humdata\.org\/dataset\/state-of-palestine-other-0-0-0-0-0/);
  assert.match(c.borders, /GeoNames - CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\)\. https:\/\/www\.geonames\.org\//);
  assert.equal(citationNotes(c)[0], "The link is the Wikipedia revision of October 5, 2026 (revision 1300000000), whose lead is exactly the text shown here.");
});

test("italics: Wikipedia (APA) and the MLA container are italic parts, and the plain text is the parts joined", () => {
  for (const c of [citeEvent(event()), citeEvent(undated())]) {
    for (const s of c.styles) assert.equal(s.parts.map((p) => p.text).join(""), s.text);
    assert.deepEqual(c.styles.find((s) => s.id === "apa").parts.filter((p) => p.italic).map((p) => p.text), ["Wikipedia"]);
    assert.deepEqual(c.styles.find((s) => s.id === "mla").parts.filter((p) => p.italic).map((p) => p.text), ["Wikipedia: The Free Encyclopedia"]);
  }
});

test("without a revision: the article URL, each style's undated form with the retrieval date, and a note that the text may have changed", () => {
  const c = citeEvent(undated());
  const url = "https://en.wikipedia.org/wiki/Six-Day_War";
  assert.equal(c.revid, null);
  assert.deepEqual(byId(c), {
    apa: `Six-Day War. (n.d.). In Wikipedia. Retrieved September 26, 2026, from ${url}`,
    mla: "“Six-Day War.” Wikipedia: The Free Encyclopedia, Wikimedia Foundation, en.wikipedia.org/wiki/Six-Day_War. Accessed 26 Sept. 2026.",
    chicago: `Wikipedia, “Six-Day War,” accessed September 26, 2026, ${url}.`,
    "chicago-short": "Wikipedia, “Six-Day War.”",
  });
  assert.match(citationNotes(c)[0], /may have changed since it was retrieved on September 26, 2026/);
  // a revision without its date (or an invalid one) is not used: never an oldid link under the wrong date
  assert.equal(citeEvent(event({ wikipedia_revid_timestamp: undefined })).revid, null);
  assert.equal(citeEvent(event({ wikipedia_revid: "12" })).revid, null);
});

test("the cited title is the article's, not our label; a title ending in ? or ! takes no extra period", () => {
  const c = citeEvent(event({ title: "Our label", wikipedia_url: "https://en.wikipedia.org/wiki/Who_Is_a_Jew%3F", wikipedia_revid: 9 }));
  assert.equal(c.title, "Who Is a Jew?");
  assert.match(byId(c).apa, /^Who Is a Jew\? \(2026, October 5\)/);
  assert.match(byId(c).mla, /^“Who Is a Jew\?” Wikipedia/);
  assert.match(byId(c).chicago, /^Wikipedia, “Who Is a Jew\?” last modified/);
});

test("no English article: no citation", () => {
  assert.equal(citeEvent(event({ wikipedia_url: null })), null);
  assert.deepEqual(citationNotes(null), []);
});
