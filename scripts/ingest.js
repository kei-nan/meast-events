// Resolves each entry in data/seed-events.json against Wikipedia + Wikidata,
// producing data/events.json: excerpt, canonical link, and coordinates for the map.
//
// Wikimedia asks automated clients to identify themselves - replace the contact
// info below with your own (an email or project URL) before running this a lot.
import { readFile, writeFile } from "node:fs/promises";

const USER_AGENT = "AtlasWiki/0.1 (prototype; +https://github.com/kei-nan/atlas-wiki)";
const REQUEST_DELAY_MS = 300;

// Fallback marker for events with no precise Wikidata point (most wars, treaties,
// and political events - they aren't tied to a single physical location).
// Deliberately country-level, not "the real site" - flagged via coordinate_source
// so the UI can be honest about precision instead of implying false accuracy.
const COUNTRY_CAPITALS = {
  Turkey: { lat: 39.9334, lon: 32.8597 },
  Iran: { lat: 35.6892, lon: 51.389 },
  Iraq: { lat: 33.3152, lon: 44.3661 },
  Syria: { lat: 33.5138, lon: 36.2765 },
  Lebanon: { lat: 33.8938, lon: 35.5018 },
  Jordan: { lat: 31.9454, lon: 35.9284 },
  "Israel/Palestine": { lat: 31.7683, lon: 35.2137 },
  Egypt: { lat: 30.0444, lon: 31.2357 },
  "Saudi Arabia": { lat: 24.7136, lon: 46.6753 },
  Yemen: { lat: 15.3694, lon: 44.191 },
  Kuwait: { lat: 29.3759, lon: 47.9774 },
  Bahrain: { lat: 26.2285, lon: 50.586 },
  Qatar: { lat: 25.2854, lon: 51.531 },
  UAE: { lat: 24.4539, lon: 54.3773 },
};

function countryFallbackCoordinates(countries) {
  const country = countries?.find((c) => COUNTRY_CAPITALS[c]);
  return country ? { ...COUNTRY_CAPITALS[country], approximate_for: country } : null;
}

// Hand-placed points for events whose real location is known but falls outside
// the country-capital table (e.g. a conference hosted outside the region).
const MANUAL_OVERRIDES = {
  "San Remo conference": { lat: 43.8167, lon: 7.7767, note: "San Remo, Italy - conference venue" },
  "Khartoum Resolution": { lat: 15.5007, lon: 32.5599, note: "Khartoum, Sudan - summit venue" },
  "Madrid Conference of 1991": { lat: 40.4168, lon: -3.7038, note: "Madrid, Spain - conference venue" },
  "McMahon–Hussein Correspondence": { lat: 30.0444, lon: 31.2357, note: "Cairo - British high commissioner's side of the correspondence" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchWikidataCoordinates(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const value = data.entities?.[qid]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  if (!value) return null;
  return { lat: value.latitude, lon: value.longitude };
}

async function resolveEvent(seedEvent, index, total) {
  const label = `[${index + 1}/${total}] ${seedEvent.wikipedia_title}`;
  const base = {
    id: slugify(seedEvent.wikipedia_title),
    title: seedEvent.wikipedia_title,
    date_start: seedEvent.date_start,
    date_end: seedEvent.date_end,
    countries: seedEvent.countries,
    category: seedEvent.category,
    retrieved_at: new Date().toISOString(),
  };

  const summary = await fetchSummary(seedEvent.wikipedia_title);
  if (!summary) {
    console.log(`${label} -> FAILED (no Wikipedia summary found)`);
    return {
      ...base,
      wikidata_qid: null,
      wikipedia_url: null,
      extract: null,
      coordinates: null,
      needs_manual_coordinates: true,
      error: "summary_not_found",
    };
  }

  const qid = summary.wikibase_item ?? null;
  let coordinates = summary.coordinates
    ? { lat: summary.coordinates.lat, lon: summary.coordinates.lon }
    : null;
  let coordinateSource = coordinates ? "wikipedia" : null;

  if (!coordinates && qid) {
    await sleep(REQUEST_DELAY_MS);
    coordinates = await fetchWikidataCoordinates(qid);
    if (coordinates) coordinateSource = "wikidata";
  }

  if (!coordinates && MANUAL_OVERRIDES[seedEvent.wikipedia_title]) {
    const override = MANUAL_OVERRIDES[seedEvent.wikipedia_title];
    coordinates = { lat: override.lat, lon: override.lon };
    coordinateSource = "manual-override";
  }

  if (!coordinates) {
    const fallback = countryFallbackCoordinates(seedEvent.countries);
    if (fallback) {
      coordinates = { lat: fallback.lat, lon: fallback.lon };
      coordinateSource = `country-fallback:${fallback.approximate_for}`;
    }
  }

  console.log(
    `${label} -> ok${coordinates ? ` (${coordinateSource})` : " (NO COORDINATES - needs manual entry)"}`
  );

  return {
    ...base,
    wikidata_qid: qid,
    wikipedia_url: summary.content_urls?.desktop?.page ?? null,
    extract: summary.extract ?? null,
    coordinates,
    coordinate_source: coordinateSource,
    needs_manual_coordinates: !coordinates,
  };
}

async function main() {
  const seedPath = new URL("../data/seed-events.json", import.meta.url);
  const outPath = new URL("../data/events.json", import.meta.url);

  const seedEvents = JSON.parse(await readFile(seedPath, "utf-8"));
  const results = [];

  for (let i = 0; i < seedEvents.length; i++) {
    try {
      results.push(await resolveEvent(seedEvents[i], i, seedEvents.length));
    } catch (err) {
      console.log(`[${i + 1}/${seedEvents.length}] ${seedEvents[i].wikipedia_title} -> FAILED (${err.message})`);
      results.push({
        id: slugify(seedEvents[i].wikipedia_title),
        title: seedEvents[i].wikipedia_title,
        date_start: seedEvents[i].date_start,
        date_end: seedEvents[i].date_end,
        countries: seedEvents[i].countries,
        category: seedEvents[i].category,
        wikidata_qid: null,
        wikipedia_url: null,
        extract: null,
        coordinates: null,
        needs_manual_coordinates: true,
        error: err.message,
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  await writeFile(outPath, JSON.stringify(results, null, 2));

  const ok = results.filter((r) => r.coordinates && !r.error).length;
  const missingCoords = results.filter((r) => !r.coordinates && !r.error).length;
  const failed = results.filter((r) => r.error).length;
  console.log(
    `\nDone: ${ok} resolved with coordinates, ${missingCoords} need manual coordinates, ${failed} failed. Total ${seedEvents.length}.`
  );
  console.log(`Output written to data/events.json`);
}

main();
