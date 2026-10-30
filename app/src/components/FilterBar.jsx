// From mapLayers, not MapView: MapView (and MapLibre) is lazy-loaded (App.jsx).
import { CATEGORY_COLORS as COLORS } from "./mapLayers";
import { categoryLabel } from "../lib/categoryLabels";
import { countryLabel } from "../lib/eventCountries.js";

const DEFAULT_CATEGORIES = Object.keys(COLORS);

/**
 * Category chips (colour dot + always a text label; alphabetical by id, kept on
 * purpose for neutrality), country select, and the scope toggle, which only
 * matters while something is being searched (`showScope`).
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
          tagged with that country only, whoever acted. */}
      {countryOptions?.length > 0 && (
        <div className="sp-country">
          <label className="sp-select">
            <span>Country</span>
            <select
              value={countries[0] ?? ""}
              aria-describedby="sp-country-note"
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  countries: e.target.value ? [e.target.value] : [],
                })
              }
            >
              <option value="">All countries</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {countryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <p id="sp-country-note" className="sp-filter-note">
            Countries are where Wikidata places an event (its country or location; typed by hand for hand-picked
            events), not who took part.
          </p>
        </div>
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
