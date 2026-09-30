// JSON layouts that keep git diffs small for large geometry files: one feature (or one
// named geometry) per line, so a changed border shows up as a changed line instead of a
// changed megabyte-long single line. The result is ordinary JSON; readers are unaffected.

export function stringifyFeatureCollection(fc) {
  const { features, ...rest } = fc;
  const head = JSON.stringify({ ...rest, features: [] }).slice(0, -2);
  return `${head}\n${features.map((f) => JSON.stringify(f)).join(",\n")}\n]}\n`;
}

export function stringifyKeyPerLine(obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}
