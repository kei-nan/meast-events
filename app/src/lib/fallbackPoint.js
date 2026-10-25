// The note for an event pinned at its country's fallback point (coordinate_source
// "country-fallback:<country>", docs/DATA_POLICY.md "Location quality"). Pure; shared by the
// event panel and the event pages.
//
// The point is one per country tag, the same for every such event whatever its date, so it is
// called a reference point, not a capital: Ankara stands for Turkey before 1923 too, and the
// Israel/Palestine point is Jerusalem's conventional coordinate, which is not a statement about
// the city's status. fallbackPoint.test.js keeps the keys equal to scripts/lib/geo.js
// COUNTRY_CAPITALS.
import { countryLabel } from "./eventCountries.js";

export const FALLBACK_PLACES = {
  Turkey: "Ankara",
  Iran: "Tehran",
  Iraq: "Baghdad",
  Syria: "Damascus",
  Lebanon: "Beirut",
  Jordan: "Amman",
  "Israel/Palestine": "Jerusalem",
  Egypt: "Cairo",
  "Saudi Arabia": "Riyadh",
  Yemen: "Sanaa",
  Kuwait: "Kuwait City",
  Bahrain: "Manama",
  Qatar: "Doha",
  UAE: "Abu Dhabi",
  Oman: "Muscat",
};

/** The approximate-location note; names the country and city once the full record is in. */
export function fallbackLocationNote(event) {
  const m = /^country-fallback:(.+)$/.exec(String(event?.coordinate_source ?? ""));
  const country = m?.[1];
  const place = country && Object.hasOwn(FALLBACK_PLACES, country) ? ` (${FALLBACK_PLACES[country]})` : "";
  const point = country
    ? `the one reference point used for every such event of ${countryLabel(country)}${place}, whatever its date`
    : "a fixed reference point for one of its countries";
  const status = place ? ", and says nothing about the status of that city" : "";
  return `Approximate location: no coordinates were found for this event, so its marker is placed at ${point}. The marker shows the country, not where the event happened${status}.`;
}
