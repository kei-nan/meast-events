// From mapLayers, not MapView: MapView (and MapLibre) is lazy-loaded (App.jsx).
import { CATEGORY_COLORS as COLORS } from "./mapLayers";
import { categoryLabel } from "../lib/categoryLabels";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { countryLabel } from "../lib/eventCountries.js";

const DEFAULT_CATEGORIES = Object.keys(COLORS);
// As many as a link keeps (lib/urlState.js MAX_ITEMS).
const MAX_COUNTRIES = 20;

/**
 * Category chips (colour dot + always a text label; alphabetical by id, kept on
 * purpose for neutrality), countries (removable tags and a select that adds
 * one; any of them matches), and the scope toggle, which only matters while
 * something is being searched (`showScope`).
 */
export default function FilterBar({
  filters,
  onFiltersChange,
  categoryOptions,
  countryOptions,
  showScope = true,
}) {
  const cats = filters.categories ?? [];
  const countries = filters.countries ?? [];
  const categoryList = categoryOptions?.length ? categoryOptions : DEFAULT_CATEGORIES;

  function toggleCategory(c) {
    const next = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c];
    onFiltersChange({ ...filters, categories: next });
  }

  // Countries are added one at a time from the select and removed by their
  // tags. The select resets to its first option, so a screen reader would hear
  // nothing of the change; the hidden status line says it.
  const addable = (countryOptions ?? []).filter((c) => !countries.includes(c));
  const selectRef = useRef(null);
  const countryRef = useRef(null);
  const [countryNews, setCountryNews] = useState("");
  const listed = (cs) => (cs.length ? `Countries: ${cs.map(countryLabel).join(", ")}.` : "All countries.");

  function addCountry(c) {
    if (!c || countries.includes(c) || countries.length >= MAX_COUNTRIES) return;
    const next = [...countries, c];
    onFiltersChange({ ...filters, countries: next });
    setCountryNews(`Added ${countryLabel(c)}. ${listed(next)}`);
  }

  // Focus goes to the tag that took the removed one's place (or the one before
  // it), and to the select once none is left, never to the page.
  function removeCountry(c, i) {
    const next = countries.filter((x) => x !== c);
    flushSync(() => onFiltersChange({ ...filters, countries: next }));
    setCountryNews(`Removed ${countryLabel(c)}. ${listed(next)}`);
    const xs = countryRef.current?.querySelectorAll("button.sp-chip-x") ?? [];
    (xs[Math.min(i, xs.length - 1)] ?? selectRef.current)?.focus();
  }

  return (
    <div className="sp-filters">
      <fieldset className="sp-fieldset">
        <legend>Category</legend>
        <div className="sp-chips">
          {categoryList.map((c) => (
            <button
              key={c}
              type="button"
              className="sp-chip sp-chip--cat"
              aria-pressed={cats.includes(c)}
              onClick={() => toggleCategory(c)}
            >
              <span
                className="sp-dot"
                aria-hidden="true"
                style={{ "--dot": COLORS[c] ?? "#6b6151" }}
              />
              {categoryLabel(c)}
            </button>
          ))}
        </div>
      </fieldset>
      {/* The note says what a country tag is (docs/DATA_POLICY.md, `countries`): an event struck in one country is
          tagged with that country only, whoever acted. Several countries list an event tagged with any of them
          (lib/ranking.js matchesFilters), as a link's c=A,B does. */}
      {countryOptions?.length > 0 && (
        <fieldset ref={countryRef} className="sp-fieldset sp-country" aria-describedby="sp-country-note">
          <legend>Country</legend>
          {countries.length > 0 && (
            <ul className="sp-chips" aria-label="Chosen countries" style={{ listStyle: "none", padding: 0, margin: "0 0 8px" }}>
              {countries.map((c, i) => (
                <li key={c} className="sp-chip sp-chip--active">
                  {countryLabel(c)}
                  <button
                    type="button"
                    className="sp-chip-x"
                    aria-label={`Remove country: ${countryLabel(c)}`}
                    onClick={() => removeCountry(c, i)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {addable.length > 0 && countries.length < MAX_COUNTRIES && (
            <label className="sp-select">
              <span>{countries.length ? "Add another" : "Add a country"}</span>
              {/* Always on its first option: choosing a country adds it to the ones above. */}
              <select ref={selectRef} value="" onChange={(e) => addCountry(e.target.value)}>
                <option value="">{countries.length ? "Choose…" : "All countries"}</option>
                {addable.map((c) => (
                  <option key={c} value={c}>
                    {countryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p id="sp-country-note" className="sp-filter-note">
            Countries are where Wikidata places an event (its country or location; typed by hand for hand-picked
            events), not who took part. With several chosen, an event in any of them is listed.
          </p>
          <p className="sp-sr" role="status">
            {countryNews}
          </p>
        </fieldset>
      )}
      {showScope && (
        <div className="sp-filter-row">
          <div className="sp-seg" role="group" aria-label="Search scope">
            <button
              type="button"
              className="sp-seg-btn"
              aria-pressed={filters.scope !== "range"}
              onClick={() => onFiltersChange({ ...filters, scope: "all" })}
            >
              Whole timeline
            </button>
            <button
              type="button"
              className="sp-seg-btn"
              aria-pressed={filters.scope === "range"}
              onClick={() => onFiltersChange({ ...filters, scope: "range" })}
            >
              Only selected years
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
