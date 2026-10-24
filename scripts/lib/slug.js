// The id a NEW event gets from its Wikipedia title (scripts/enrich-candidates.js).
// Existing ids are data and never regenerated: renaming one breaks shared links,
// and a rename needs an entry in data/event-redirects.json (app/scripts/redirects.mjs).
//
// Accented letters keep their base letter ("Sèvres" -> "sevres", "d'État" ->
// "detat"): NFKD splits them into letter + combining mark and the marks are
// dropped. Letters NFKD does not split are spelled out (Turkish dotless "ı",
// "ß", "æ", ...). Apostrophes and the ʿayn/hamza marks of transliterated Arabic
// are dropped inside a word ("Dawson's" -> "dawsons", "Baʿath" -> "baath")
// instead of splitting it. Every other run of non-alphanumerics is one "-".

const SPELLED = { ı: "i", ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ð: "d", ł: "l", þ: "th", ħ: "h" };
const WORD_MARKS = /['’‘ʼʻʿʾ`´]/g;

export function slugify(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ıßæœøđðłþħ]/g, (ch) => SPELLED[ch])
    .replace(WORD_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
