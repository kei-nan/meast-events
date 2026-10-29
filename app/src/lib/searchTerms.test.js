import test from "node:test";
import assert from "node:assert/strict";
import { everyTermIndexed, hasWordWithPrefix, pagefindQuery, queryTerms, stemEnglish } from "./searchTerms.js";

test("queryTerms cuts and folds the query as pagefind.js does", () => {
  assert.deepEqual(queryTerms("  Six-Day   War "), ["sixday", "war"]);
  assert.deepEqual(queryTerms("Israel's Kürt Beyrouth."), ["israels", "kurt", "beyrouth"]);
  assert.deepEqual(queryTerms("Kıbrıs"), ["kıbrıs"]); // dotless i has no NFD decomposition
  assert.deepEqual(queryTerms("القدس ירושלים"), ["القدس", "ירושלים"]);
  assert.deepEqual(queryTerms("--"), []);
});

test("pagefindQuery drops symbols and bidi marks, never part of an indexed word", () => {
  assert.equal(pagefindQuery("US$500 8000+ ~60 ₪85"), "US500 8000 60 85");
  assert.equal(pagefindQuery("iran\u200e"), "iran");
  assert.equal(pagefindQuery("می\u200cخواهم"), "می\u200cخواهم"); // ZWNJ is part of Persian words
});

test("stemEnglish follows Snowball 3.0.0 English", () => {
  const cases = {
    wars: "war",
    massacres: "massacr",
    crisis: "crisi",
    gaps: "gap",
    gas: "gas",
    cries: "cri",
    ties: "tie",
    hoping: "hope",
    hopping: "hop",
    added: "add",
    dying: "die",
    inning: "inning",
    proceed: "proceed",
    agreed: "agre",
    generously: "generous",
    nationalization: "nation",
    organize: "organiz",
    interallied: "interal",
    pathologist: "patholog",
    happily: "happili",
    sky: "sky",
    only: "onli",
    say: "say",
    cry: "cri",
    by: "by",
    intifada: "intifada",
    القدس: "القدس",
  };
  for (const [word, stem] of Object.entries(cases)) assert.equal(stemEnglish(word), stem, word);
});

test("hasWordWithPrefix searches a sorted list", () => {
  const words = ["a", "jerusalem", "suez", "suezkan", "war"];
  assert.ok(hasWordWithPrefix(words, "suez"));
  assert.ok(hasWordWithPrefix(words, "jer"));
  assert.ok(hasWordWithPrefix(words, "a"));
  assert.ok(!hasWordWithPrefix(words, "aa"));
  assert.ok(!hasWordWithPrefix(words, "jerusalemxyz"));
  assert.ok(!hasWordWithPrefix(words, "zzz"));
  assert.ok(!hasWordWithPrefix([], "a"));
});

test("everyTermIndexed needs every word, stemmed, to start an indexed word", () => {
  const words = ["a", "jerusalem", "massacr", "sixday", "suez", "war"];
  assert.ok(everyTermIndexed("Six-Day War", words));
  assert.ok(everyTermIndexed("Jerusalem massacres", words));
  assert.ok(everyTermIndexed("jerus", words));
  assert.ok(!everyTermIndexed("aaaaaaaa", words)); // Pagefind: falls back to "a"
  assert.ok(!everyTermIndexed("jerusalemxyz", words)); // Pagefind: falls back to "jerusalem"
  assert.ok(!everyTermIndexed("suez qqqqqqqq", words)); // Pagefind: ignores "qqqqqqqq"
  assert.ok(!everyTermIndexed("", words));
});
