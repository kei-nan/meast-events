import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("accented letters keep their base letter", () => {
  assert.equal(slugify("Treaty of Sèvres"), "treaty-of-sevres");
  assert.equal(slugify("1953 Iranian coup d'état"), "1953-iranian-coup-detat");
  assert.equal(slugify("Ağrı rebellion"), "agri-rebellion");
  assert.equal(slugify("Straße"), "strasse");
});

test("apostrophes and transliteration marks do not split a word", () => {
  assert.equal(slugify("Dawson's Field hijackings"), "dawsons-field-hijackings");
  assert.equal(slugify("Dawson’s Field hijackings"), "dawsons-field-hijackings");
  assert.equal(slugify("Baʿath Party"), "baath-party");
});

test("other punctuation becomes single dashes, none at the ends", () => {
  assert.equal(slugify("  Suez Crisis (1956) – aftermath! "), "suez-crisis-1956-aftermath");
  assert.equal(slugify("حرب"), "");
  assert.equal(slugify(undefined), "");
});
