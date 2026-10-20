// The map's label font. MapLibre draws the labels in the browser (TinySDF on a
// canvas; the base style has no `glyphs` URL, MapView.jsx BASE_STYLE) with the
// CSS family named in `text-font`, and takes the weight from that name
// ("Semibold" -> 600). scripts/subset-fonts.mjs writes this family's @font-faces:
// the subset Inter files the page itself uses, so no file of their own.
export const LABEL_FONT_FAMILY = "Map Label Semibold";

// Loads every face of the label font; resolves when all have loaded or failed.
// TinySDF draws each character once, with whatever font the canvas has at that
// moment, and keeps the bitmap: a face still loading would leave fallback-font
// letters on the map for good. MapLibre waits only for the face that covers a
// space (the Latin one), so MapView waits for this before adding the label layers.
export function loadLabelFont(fonts = globalThis.document?.fonts) {
  if (!fonts) return Promise.resolve();
  const faces = [...fonts].filter((f) => f.family.replace(/^["']|["']$/g, "") === LABEL_FONT_FAMILY);
  return Promise.all(faces.map((f) => f.load().catch(() => null)));
}
