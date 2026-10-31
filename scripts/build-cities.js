// Builds the map's city names (app/src/data/cities.json): a point per city and name, each
// with the years it is shown in, so the map names a city as it was called in the year shown.
//
// Which cities: Natural Earth's populated places (1:10m, public domain) in the site's 16
// countries (Turkey, Iran, Iraq, Syria, Lebanon, Jordan, Israel, Palestine, Egypt, Saudi
// Arabia, Yemen, Kuwait, Bahrain, Qatar, the UAE, Oman) whose population POP_MAX (Natural
// Earth's metropolitan figure) is at least MIN_POP, at Natural Earth's point. One figure from
// one source for every country: Wikidata's population statements mix cities with their
// governorates and districts (Irbid 1.9M), and sitelink counts favour Turkish provincial towns.
// The cities are today's: a city that merged into another (Jaffa into Tel Aviv-Yafo in 1950)
// has no name of its own, and one that was small in 1900 is named all the same. No capital is
// marked.
//
// Each name: the title of the city's English Wikipedia article (its Wikidata item's, Natural
// Earth's WIKIDATAID), as an event's title is, without Wikipedia's disambiguation
// ("Arak, Iran" is "Arak", "Hail (city)" "Hail"). Before a change of name RENAMES lists, the
// former name. Shown from zoom 5 (POP_MAX 2 million and up), 6 (1 million) or 7.
//
// RENAMES: a change of name since 1900 is listed when an English Wikipedia article gives the
// former name and the year (or decade) of the change; the quoted sentences are the source. A
// name is shown only in the years the quotes make certain, so a change dated to a decade
// leaves those years unnamed. A year shows the name taken that year (Istanbul in 1930). The
// current period is always the article's title, even where the official name differs (Tel
// Aviv, officially Tel Aviv-Yafo since 1950; Urfa, officially Şanlıurfa since 1984). Not
// listed, because the article does not date the change: Gaziantep (Aintab; "Gazi" added),
// Arak (Soltan Abad, "under the reign of Reza Shah"), and English spellings that went out
// of use (Trebizond, Jedda, Assuan). Kermanshah's article does not mention Bakhtaran.
//
// Checks (the build fails): every place has a Wikidata item with an English Wikipedia
// article, and no item is used twice; every quote is in the current text of its article
// (whitespace aside), and every former name and every year of a listed change is in its quotes;
// a city's periods are in order and do not overlap.
//
// Source, pinned to the commit the land is built from (Natural Earth 5.1.x, public domain):
//   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ace5fed0eaf3c6c03c951e75b439ba8fffbc218e/geojson/ne_10m_populated_places.geojson -o data/raw/ne10-populated-places.geojson
// Wikidata (CC0): wbgetentities (lib/wd-entities.js). English Wikipedia: the plain text of
// each article RENAMES quotes (one request each); its revision is kept as the citation.
//
// CLI (optional): --raw-dir=DIR  read the source from DIR (default data/raw)
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fetchEntities } from "./lib/wd-entities.js";
import { politeFetch, mediaWikiJson, sleep } from "./lib/http.js";
import { stringifyFeatureCollection } from "./lib/json-lines.js";

const COUNTRIES = new Set(["TUR", "IRN", "IRQ", "SYR", "LBN", "JOR", "ISR", "PSX", "EGY", "SAU", "YEM", "KWT", "BHR", "QAT", "ARE", "OMN"]);
const MIN_POP = 300_000;
// Places left out, by Natural Earth's NE_ID, and why.
const SKIP = {
  // "Al Hillah", Saudi Arabia (23.49N 46.76E, Riyadh region): no WIKIDATAID, and POP_MAX
  // 594,605 is the figure of Al Hillah in Iraq (NE_ID 1159143173), copied: a small town.
  1159128275: "population copied from Hillah, Iraq",
};
const minzoomFor = (pop) => (pop >= 2_000_000 ? 5 : pop >= 1_000_000 ? 6 : 7);

// Per city (Wikidata id): `names`, in order, each { name, from, to } with `to` the first year
// it is no longer shown; no `name` = the article's title; no `from` = from 1900 (the map's
// first year), no `to` = to today. `cite`: the article and its sentences, quoted exactly.
const RENAMES = {
  Q406: {
    names: [{ name: "Constantinople", to: 1930 }, { from: 1930 }],
    cite: [{ article: "Istanbul", quote: "The name Constantinople, which remained in use for 1600 years, was officially changed as İstanbul on 28 March 1930" }],
  },
  // Ankara and İzmir: the same law, in the Istanbul article.
  Q3640: {
    names: [{ name: "Angora", to: 1930 }, { from: 1930 }],
    cite: [{ article: "Istanbul", quote: "Other city names that were changed with the Postal Services Law (Turkish: Posta Hizmetleri Kanunu) of 28 March 1930 include Angora which was renamed as Ankara" }],
  },
  Q35997: {
    names: [{ name: "Smyrna", to: 1930 }, { from: 1930 }],
    cite: [{ article: "Istanbul", quote: "of 28 March 1930 include Angora which was renamed as Ankara, and Smyrna which was renamed as İzmir" }],
  },
  Q83387: {
    names: [{ name: "Diyarbekir", to: 1937 }, { from: 1937 }],
    cite: [{ article: "Diyarbakır", quote: "In November 1937, Turkish President Atatürk visited the city and after expressing uncertainty on the exact etymology of the city's name, \"Diyarbekir\", in December of the same year ordered that it be renamed \"Diyarbakır\"" }],
  },
  Q134703: {
    names: [{ name: "Maraş", to: 1973 }, { from: 1973 }],
    cite: [{ article: "Kahramanmaraş", quote: "After 1973, Maraş was officially named Kahramanmaraş" }],
  },
  // The village's earlier name is not given, so before 1957 the city is not named.
  Q159835: {
    names: [{ from: 1957 }],
    cite: [{ article: "Batman, Turkey", quote: "In 1957, the village was renamed Batman" }],
  },
  Q140561: {
    names: [{ name: "Duzzap", to: 1929 }, { from: 1929 }],
    cite: [
      { article: "Zahedan", quote: "The earlier name of the city was Duzzap" },
      { article: "Zahedan", quote: "The name was later changed to Zahedan during Reza Shah's visit in 1929." },
    ],
  },
  // Named Nāseriyeh under Naser al-Din Shah (1848-1896), so in 1900 too.
  Q170366: {
    names: [{ name: "Nāseriyeh", to: 1935 }, { from: 1935 }],
    cite: [{ article: "Ahvaz", quote: "During the Qajar period, under Naseroddin Shah, the name of Ahvaz was changed to 'Nāseriyeh'. However, in September 1935, by approval of the Council of Ministers, the city was once again officially named Ahvaz." }],
  },
  Q179665: {
    names: [{ to: 1925 }, { name: "Rezaiyeh", from: 1925, to: 1979 }, { from: 1979 }],
    cite: [{ article: "Urmia", quote: "During the Pahlavi era (1925–1979), the city was called Rezaiyeh" }],
  },
  // Renamed "in the 1930s": no name in 1930-1939.
  Q720001: {
    names: [{ name: "Sedeh", to: 1930 }, { name: "Homayunshahr", from: 1940, to: 1979 }, { from: 1979 }],
    cite: [
      { article: "Khomeynishahr", quote: "The town was originally known as Sedeh." },
      { article: "Khomeynishahr", quote: "In the 1930s, the name was changed to Homayunshahr." },
      { article: "Khomeynishahr", quote: "After the Iranian Revolution of 1979, the city was renamed again to Khomeynishahr" },
    ],
  },
  // Founded in 1909; the name Tel Aviv-Yafo (1950) is not the article's title.
  Q33935: {
    names: [{ name: "Ahuzat Bayit", from: 1909, to: 1910 }, { from: 1910 }],
    cite: [
      { article: "Tel Aviv", quote: "The city was founded in 1909 by the Yishuv (Jewish residents) and initially given the Hebrew name Ahuzat Bayit" },
      { article: "Tel Aviv", quote: "On 21 May 1910, the name Tel Aviv was adopted." },
    ],
  },
  // Settled "around 1923": not named before.
  Q160320: {
    names: [{ from: 1923 }],
    cite: [{ article: "Dammam", quote: "The area that eventually became Dammam was settled by the Dawasir tribe around 1923" }],
  },
};

const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const RAW_DIR = argVal("raw-dir") ? pathToFileURL(resolve(argVal("raw-dir")) + "/") : new URL("../data/raw/", import.meta.url);
const OUT = new URL("../app/src/data/cities.json", import.meta.url);

const problems = [];
const places = JSON.parse(await readFile(new URL("ne10-populated-places.geojson", RAW_DIR), "utf-8"))
  .features.map((f) => f.properties)
  .filter((p) => COUNTRIES.has(p.ADM0_A3) && p.POP_MAX >= MIN_POP && !SKIP[p.NE_ID]);
for (const p of places) if (!p.WIKIDATAID) problems.push(`${p.NAME} (${p.ADM0_A3}): no WIKIDATAID`);
const cities = places.filter((p) => p.WIKIDATAID);
const seen = new Set();
for (const p of cities) {
  if (seen.has(p.WIKIDATAID)) problems.push(`${p.WIKIDATAID}: on two places (${p.NAME})`);
  seen.add(p.WIKIDATAID);
}
for (const qid of Object.keys(RENAMES)) if (!seen.has(qid)) problems.push(`RENAMES ${qid}: not one of the cities`);

const items = await fetchEntities([...seen], { props: "labels|sitelinks/urls" });
const title = (qid) => {
  const item = items.get(qid);
  if (!item) return problems.push(`${qid}: no such Wikidata item`), null;
  if (item.redirected) problems.push(`${qid}: redirects to ${item.qid}; Natural Earth's id is stale`);
  if (!item.enwiki) problems.push(`${qid} (${item.label}): no English Wikipedia article`);
  return item.enwiki;
};
// "Arak, Iran" -> "Arak", "Hail (city)" -> "Hail".
const displayName = (t) => t.replace(/ \([^)]*\)$/, "").replace(/, [^,]+$/, "");

// The articles RENAMES quotes: plain text and the revision it is from.
const articles = new Map();
for (const article of new Set(Object.values(RENAMES).flatMap((r) => r.cite.map((c) => c.article)))) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts|revisions&rvprop=ids&explaintext=1&titles=${encodeURIComponent(article)}`;
  const page = (await mediaWikiJson(await politeFetch(url), "extracts")).query.pages[0];
  if (page.missing || !page.extract) problems.push(`${article}: no English Wikipedia article`);
  articles.set(article, { text: (page.extract ?? "").replace(/\s+/g, " "), revid: page.revisions?.[0]?.revid ?? null });
  await sleep(300);
}

const thisYear = new Date().getUTCFullYear();
function periods(qid, current) {
  const r = RENAMES[qid];
  if (!r) return [{ name: current }];
  const quotes = r.cite.map((c) => c.quote.replace(/\s+/g, " ")).join(" ");
  for (const c of r.cite) {
    if (!articles.get(c.article)?.text.includes(c.quote.replace(/\s+/g, " "))) problems.push(`${qid} (${current}): quote not in "${c.article}": ${c.quote}`);
  }
  let last = 1900;
  const out = r.names.map(({ name, from, to }, i) => {
    if (name != null && !quotes.includes(name)) problems.push(`${qid}: "${name}" is not in its quotes`);
    for (const y of [from, to]) {
      // The year itself, or its decade ("in the 1930s": 1930 and the year after it, 1940).
      const named = y != null && [String(y), `${y - (y % 10)}s`, `${y - 10}s`].some((s) => quotes.includes(s) && (s !== `${y - 10}s` || y % 10 === 0));
      if (y != null && !named) problems.push(`${qid}: ${y} is not in its quotes`);
    }
    if ((from ?? 1900) < last || (to != null && to <= (from ?? 1900)) || (to != null && to > thisYear)) problems.push(`${qid}: period ${i} out of order`);
    last = to ?? Infinity;
    return { name: name ?? current, ...(from != null && { from }), ...(to != null && { to }) };
  });
  if (r.names.at(-1).to != null || r.names.at(-1).name != null) problems.push(`${qid}: the last period must be the article's title, to today`);
  return out;
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const features = [];
for (const p of cities.sort((a, b) => b.POP_MAX - a.POP_MAX)) {
  const t = title(p.WIKIDATAID);
  if (!t) continue;
  const cite = RENAMES[p.WIKIDATAID]?.cite[0].article;
  for (const period of periods(p.WIKIDATAID, displayName(t))) {
    features.push({
      type: "Feature",
      properties: {
        ...period,
        qid: p.WIKIDATAID,
        minzoom: minzoomFor(p.POP_MAX),
        ...(cite && period.name !== displayName(t) && { source: cite, revid: articles.get(cite)?.revid }),
      },
      geometry: { type: "Point", coordinates: [round6(p.LONGITUDE), round6(p.LATITUDE)] },
    });
  }
}

if (problems.length) {
  for (const p of problems) console.error(`- ${p}`);
  throw new Error(`build-cities: ${problems.length} problem(s)`);
}
await writeFile(OUT, stringifyFeatureCollection({ type: "FeatureCollection", features }));
const former = features.filter((f) => f.properties.source);
console.log(
  `cities.json: ${seen.size} cities, ${features.length} names; former: ${former.map((f) => `${f.properties.name} (${f.properties.from ?? 1900}-${f.properties.to})`).join(", ")}`
);
