import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION,
  CSV_COLUMNS,
  csvCell,
  exportFilename,
  exportQuery,
  exportRow,
  exportRows,
  rowNotes,
  toCSV,
  toJSON,
} from "./exportResults.js";

// A strict RFC 4180 reader, to check what toCSV writes reads back field for field.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (ch === '"') {
        quoted = false;
        i++;
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"') {
      assert.equal(field, "", "a quote may only open a field");
      quoted = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
    } else {
      assert.ok(ch !== "\r" && ch !== "\n", "a bare line break outside quotes");
      field += ch;
      i++;
    }
  }
  assert.equal(quoted, false, "unterminated quote");
  assert.equal(field, "", "the last record ends with CRLF");
  return rows;
}

const precise = {
  id: "six-day-war",
  title: "Six-Day War",
  date_start: "1967-06-05",
  date_end: "1967-06-10",
  countries: ["Israel", "Egypt", "Syria", "Jordan"],
  category: "war",
  snippet: "The Six-Day War, also known as ...",
  coordinates: { lat: 31.7683, lon: 35.2137 },
  location_quality: "precise",
  sitelinks: 95,
};
const rounded = {
  id: "al-anfal-campaign",
  title: "Al-Anfal campaign",
  date_start: "1986-02-01",
  date_end: "1989-09-06",
  countries: ["Iraq"],
  category: "atrocity",
  coordinates: { lat: 33, lon: 43 },
  location_quality: "approximate",
  approximate_reason: "rounded",
  sitelinks: 30,
};
const regional = {
  id: "arab-spring",
  title: "Arab Spring",
  date_start: "2010-12-17",
  date_end: "2012-12-01",
  countries: ["regional"],
  category: "uprising",
  coordinates: null,
  location_quality: "none",
  sitelinks: null,
};

test("a row: displayed countries and category, lat/lon only for a precise location", () => {
  const r = exportRow(precise);
  assert.deepEqual(r.countries, ["Israel", "Egypt", "Syria", "Jordan"]);
  assert.equal(r.category, "War");
  assert.equal(r.lat, 31.7683);
  assert.equal(r.lon, 35.2137);
  assert.equal(r.site_url, "https://middleeast.events/event/six-day-war");
  assert.equal(r.license, ATTRIBUTION);
  assert.match(r.license, /^Text: Wikipedia contributors, CC BY-SA 4\.0/);
  assert.equal(r.wikimedia_pages, 95);

  const a = exportRow(rounded);
  assert.equal(a.lat, null);
  assert.equal(a.lon, null);
  assert.equal(a.category, "Atrocity (genocide, massacre, war crime)");

  const n = exportRow(regional);
  assert.deepEqual(n.countries, ["Region-wide"]);
  assert.equal(n.lat, null);
  assert.equal(n.wikimedia_pages, null);
});

test("a row carries no extract text and no geometry", () => {
  const r = exportRow({ ...precise, extract: "Full text", geometry: { type: "Polygon" } });
  assert.equal("snippet" in r, false);
  assert.equal("extract" in r, false);
  assert.equal("geometry" in r, false);
  assert.equal("coordinates" in r, false);
});

test("notes: the tags the panel shows", () => {
  assert.deepEqual(rowNotes(precise, { range: [1967, 1967] }), []);
  assert.deepEqual(rowNotes(precise, { range: [1990, 2000] }), ["Outside selected years"]);
  assert.deepEqual(rowNotes(rounded, { range: [1988, 2000], browse: true }), [
    "Ongoing since 1986",
    "Approximate location (the source rounds the coordinates to the area)",
  ]);
  // "Ongoing since" is the browse list's tag only.
  assert.deepEqual(rowNotes(rounded, { range: [1988, 2000] }), [
    "Approximate location (the source rounds the coordinates to the area)",
  ]);
  assert.deepEqual(rowNotes(regional), ["No map location"]);
  const kuwait = { ...precise, date_start: "2009-08-02", date_end: "1990-08-04" };
  assert.deepEqual(rowNotes(kuwait, { range: [1990, 1990] }), ["End date before start"]);
  assert.deepEqual(rowNotes({ ...precise, location_quality: "approximate" }), ["Approximate location"]);
});

test("exportRows keeps the order it is given", () => {
  assert.deepEqual(
    exportRows([regional, precise, rounded]).map((r) => r.id),
    ["arab-spring", "six-day-war", "al-anfal-campaign"]
  );
});

test("csvCell: RFC 4180 quoting", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a, b"), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell("cr\rhere"), '"cr\rhere"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(["Israel", "Egypt"]), "Israel; Egypt");
  assert.equal(csvCell([]), "");
});

test("csvCell: formula injection is neutralised with a leading apostrophe", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+cmd"), "'+cmd");
  assert.equal(csvCell("-2+3"), "'-2+3");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\t=x"), "'\t=x");
  assert.equal(csvCell("  =HYPERLINK(\"http://x\")"), `"'  =HYPERLINK(""http://x"")"`);
  assert.equal(csvCell("＝1+1"), "'＝1+1"); // full-width =
  assert.equal(csvCell('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
  // Numbers stay numbers, as numbers or as their text.
  assert.equal(csvCell(-5.3), "-5.3");
  assert.equal(csvCell("-5.3"), "-5.3");
  assert.equal(csvCell("-12"), "-12");
  // Not at the start: no change.
  assert.equal(csvCell("Iran-Iraq War"), "Iran-Iraq War");
  assert.equal(csvCell("a=b"), "a=b");
});

test("toCSV: BOM, header, CRLF records that read back exactly", () => {
  const csv = toCSV(exportRows([precise, rounded, regional], { range: [1967, 2026] }));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(Buffer.from(csv, "utf8").subarray(0, 3).toString("hex"), "efbbbf");
  const rows = parseCSV(csv.slice(1));
  assert.deepEqual(rows[0], CSV_COLUMNS.map(([, h]) => h));
  assert.equal(rows[0][5], "category (our grouping)");
  assert.equal(rows.length, 4);
  for (const r of rows) assert.equal(r.length, CSV_COLUMNS.length);
  const col = (name) => CSV_COLUMNS.findIndex(([k]) => k === name);
  assert.equal(rows[1][col("countries")], "Israel; Egypt; Syria; Jordan");
  assert.equal(rows[1][col("lat")], "31.7683");
  assert.equal(rows[2][col("lat")], "");
  assert.equal(rows[3][col("countries")], "Region-wide");
  assert.equal(rows[3][col("notes")], "No map location");
  assert.equal(rows[1][col("license")], ATTRIBUTION);
});

test("toCSV: right-to-left and accented text survive unchanged, no marks added", () => {
  const title = 'Buraq uprising (Arabic: ثورة البراق, "Thawrat al-Burāq"; Hebrew: מאורעות תרפ"ט)';
  const ev = { ...precise, id: "buraq", title, countries: ["Mandatory Palestine", "Côte d’Ivoire"] };
  const csv = toCSV(exportRows([ev]));
  const rows = parseCSV(csv.slice(1));
  assert.equal(rows[1][1], title);
  assert.equal(rows[1][4], "Mandatory Palestine; Côte d’Ivoire");
  // No bidi controls (LRM/RLM, embeddings, isolates) slipped in.
  assert.doesNotMatch(csv, /[‎‏‪-‮⁦-⁩]/);
  // Round-trips through UTF-8 bytes (what the Blob holds).
  assert.equal(Buffer.from(csv, "utf8").toString("utf8"), csv);
});

test("toCSV: an injected title is neutralised in the file", () => {
  const csv = toCSV(exportRows([{ ...precise, title: "=cmd|' /C calc'!A0" }]));
  const rows = parseCSV(csv.slice(1));
  assert.equal(rows[1][1], "'=cmd|' /C calc'!A0");
});

test("exportQuery: the URL's parameters, the link and in-map-view", () => {
  const q = exportQuery({
    query: "  gaza ",
    filters: { categories: ["war"], countries: ["Egypt"], scope: "range", inView: true },
    area: null,
    range: [1948, 1973],
    sort: "coverage",
    view: "timeline",
  });
  assert.equal(q.q, "gaza");
  assert.deepEqual(q.years, [1948, 1973]);
  assert.equal(q.scope, "range");
  assert.equal(q.in_map_view, true);
  assert.equal(q.url, "https://middleeast.events/?q=gaza&cat=war&c=Egypt&y=1948-1973&scope=range&view=timeline");
});

test("toJSON: licence header, generated_at, query and typed events", () => {
  const rows = exportRows([precise, regional]);
  const text = toJSON(rows, { query: { q: "war" }, generatedAt: new Date("2026-10-24T10:00:00Z") });
  const doc = JSON.parse(text);
  assert.equal(doc.license.text_license, "CC BY-SA 4.0");
  assert.match(doc.license.text, /Wikipedia contributors/);
  assert.match(doc.license.not_included, /border geometry/);
  assert.equal(doc.attribution, ATTRIBUTION);
  assert.equal(doc.generated_at, "2026-10-24T10:00:00.000Z");
  assert.deepEqual(doc.query, { q: "war" });
  assert.equal(doc.count, 2);
  assert.deepEqual(doc.events[0].countries, ["Israel", "Egypt", "Syria", "Jordan"]);
  assert.equal(doc.events[1].lat, null);
  // JSON keeps text as it is: no apostrophe prefix.
  const inj = JSON.parse(toJSON(exportRows([{ ...precise, title: "=1+1" }])));
  assert.equal(inj.events[0].title, "=1+1");
});

test("exportFilename", () => {
  assert.equal(exportFilename([1917, 2026], 23, "csv"), "middleeast-events-1917-2026-23.csv");
  assert.equal(exportFilename([1967, 1967], 5, "json"), "middleeast-events-1967-5.json");
  assert.equal(exportFilename(null, 0, "csv"), "middleeast-events-all-0.csv");
});
