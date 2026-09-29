// Border-honesty helpers: the boundary `status` flag, humanised, plus shared
// styling constants so the map layer and the legend can never drift apart.
//
// The `note` and `source` strings in data/boundaries.json are shown AS-IS (they
// carry the reasoning and citations); only the short machine `status` value is
// mapped to plain language, in the ONE table below. Every status value used in
// scripts/boundary-corrections.js needs an entry here.
export const BOUNDARY_STATUS_LABELS = {
  mandate: "Mandate territory (administered under a mandate)",
  "occupied-territory-included": "Occupied territory, included inside this border",
  "occupied-administered": "Occupied and administered by another power",
  "shared-sovereignty-included": "Shared-sovereignty territory, included inside this border",
  "shared-sovereignty": "Shared sovereignty",
  "annexed-unrecognized": "Annexed; the annexation is not internationally recognised",
  "disputed-then-resolved": "Disputed border (later resolved)",
  disputed: "Disputed: held by one state and claimed by another",
  "autonomous-partial": "Partly autonomous area",
  "joint-control": "Under joint control",
  "de-facto-separate-administration": "Separately administered in practice (de facto)",
  "active-conflict": "Border contested by active conflict",
  "partitioned-ceasefire": "Partitioned along a ceasefire line",
};

export function humaniseStatus(status) {
  if (!status) return null;
  if (BOUNDARY_STATUS_LABELS[status]) return BOUNDARY_STATUS_LABELS[status];
  const words = String(status).replace(/[-_]+/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} (status flag as recorded in the data)`;
}

// One line style per meaning. Solid = source-dated geometry; dashed = a status flag
// is attached. Shared by the boundaries-line layer and the legend swatches.
export const BORDER_STYLE = {
  solid: { color: "#6f6148", width: 1.4 },
  flagged: { color: "#9a5b13", width: 2.2, dash: [3, 2] },
};

// De-duplicated (a polygon split across tiles is returned once per piece),
// sorted by name, from raw feature properties.
export function uniqueBoundaries(featureList) {
  const seen = new Set();
  const out = [];
  for (const f of featureList) {
    const p = f.properties ?? {};
    const key = `${p.name}|${p.start_year}|${p.end_year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: p.name,
      start_year: p.start_year,
      end_year: p.end_year,
      status: p.status ?? null,
      note: p.note ?? null,
      source: p.source ?? null,
    });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function yearsLabel(b) {
  const end = b.end_year >= 9999 ? "present" : b.end_year;
  return b.start_year === b.end_year ? `${b.start_year}` : `${b.start_year}–${end}`;
}

// First-visit hint dismissal (localStorage may throw or be blocked).
const HINT_KEY = "atlas.mapHintDismissed";

export function readHintDismissed() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}
export function writeHintDismissed() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // Storage unavailable (private mode); the hint simply reappears next visit.
  }
}

