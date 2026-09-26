import * as MapViewModule from "./MapView.jsx";

// CATEGORY_COLORS is exported by MapView (WP-MAP); tolerate its absence so this
// component still renders on branches that predate the export.
const COLORS = MapViewModule.CATEGORY_COLORS ?? {
  war: "#a13f2e",
  treaty: "#4c7a63",
  political: "#455d80",
  uprising: "#c99a45",
  migration: "#7d5a7d",
  diplomatic: "#3f7d84",
  economic: "#8c7a3f",
  terrorism: "#6b3140",
};
const DEFAULT_CATEGORIES = Object.keys(COLORS);

/** Category chips (colour dot + always a text label), country select, scope toggle. */
export default function FilterBar({
  filters,
  onFiltersChange,
  categoryOptions,
  countryOptions,
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
        <legend>Wikidata class</legend>
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
                style={{ background: COLORS[c] ?? "#6b6151" }}
              />
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sp-filter-row">
        {countryOptions?.length > 0 && (
          <label className="sp-select">
            <span>Country</span>
            <select
              value={countries[0] ?? ""}
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
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
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
    </div>
  );
}
