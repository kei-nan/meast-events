// This file is the actual "fork" of CShapes 2.0 for this project: every historical
// judgment call we've made beyond the raw upstream dataset lives here, nowhere else.
// Nothing in here is auto-generated - it's hand-authored and cited, and it's the only
// place ingest-boundaries.js consults besides the raw CShapes download itself.
//
// Two kinds of entry:
//
//   "split" - a one-directional rename/status progression over an entity's lifetime
//     (a mandate becoming independent, an empire being renamed). `phases` is an
//     ordered list of {until, name, status?}; the first phase where year < until
//     applies. Falls through to the default name (CShapes' own name, parenthetical
//     stripped) if no phase matches - so this only needs to list the *historical*
//     names, not the current one.
//
//   "flag" - a bounded [fromYear, toYear] window attaching a note/status/source to
//     an existing entity, optionally with a temporary display name (e.g. a military
//     occupation). Outside the window, whatever the entity's normal name/status is
//     (from a "split" entry or the default) applies unchanged. Doesn't require the
//     window to align with any underlying CShapes date boundary - the ingest script
//     splits the geometry's date range as needed.
//
// Every entry with historical content must cite a source. Nothing here should be
// taken on my (the model's) say-so alone without a citation a reader can check.

export const CORRECTIONS = [
  // --- Renames / mandate-to-independence progressions ---
  {
    type: "split",
    target: "Turkey (Ottoman Empire)",
    phases: [{ until: 1923, name: "Ottoman Empire" }],
    note: "The Ottoman Empire was formally abolished and the Republic of Turkey proclaimed on 29 October 1923.",
    source: "https://en.wikipedia.org/wiki/Republic_of_Turkey_(1923%E2%80%93present)",
  },
  {
    type: "split",
    target: "Iran (Persia)",
    phases: [{ until: 1935, name: "Persia" }],
    note: "Reza Shah requested foreign governments use \"Iran\" instead of \"Persia\" starting in 1935.",
    source: "https://en.wikipedia.org/wiki/Name_of_Iran",
  },
  {
    type: "split",
    target: "Palestine",
    // Never had its own independence before becoming Israel - one phase covers its
    // whole 1920-1948 span in the dataset.
    phases: [{ until: 1949, name: "Mandatory Palestine", status: "mandate" }],
    note: "British Mandate for Palestine, in force 1920-1948 (formalized 1922, effective 1923).",
    source: "https://en.wikipedia.org/wiki/Mandatory_Palestine",
  },
  {
    type: "split",
    target: "Jordan",
    phases: [{ until: 1946, name: "Transjordan", status: "mandate" }],
    note: "Emirate of Transjordan under British Mandate until full independence on 25 May 1946.",
    source: "https://en.wikipedia.org/wiki/Emirate_of_Transjordan",
  },
  {
    type: "split",
    target: "Syria",
    phases: [{ until: 1946, name: "French Mandate of Syria", status: "mandate" }],
    note: "French Mandate for Syria and Lebanon until Syrian independence, effective 17 April 1946.",
    source: "https://en.wikipedia.org/wiki/French_Mandate_for_Syria_and_the_Lebanon",
  },
  {
    type: "split",
    target: "Iraq",
    phases: [
      { until: 1932, name: "Kingdom of Iraq (British Mandate)", status: "mandate" },
      { until: 1958, name: "Kingdom of Iraq" },
    ],
    note: "British Mandate of Mesopotamia -> Kingdom of Iraq (independence 3 October 1932, still a monarchy) -> Republic (14 July Revolution, 1958).",
    source: "https://en.wikipedia.org/wiki/Kingdom_of_Iraq",
  },

  // --- Status flags: corrections and additions to CShapes' existing geometry ---
  {
    type: "flag",
    target: "Israel",
    fromYear: 1967,
    toYear: 9999,
    status: "occupied-territory-included",
    note:
      "This shape includes territory occupied in the 1967 Six-Day War. The Golan Heights " +
      "and West Bank remain part of this polygon throughout (Israeli sovereignty over both " +
      "is not internationally recognized). Sinai was returned to Egypt in 1979 under the " +
      "Camp David Accords and is excluded from this shape from that year on. Gaza remains " +
      "part of this polygon throughout even though Israel withdrew from Gaza in 2005 and it " +
      "has been under separate Palestinian administration since (Hamas from 2007) - this " +
      "dataset does not yet model that as a distinct shape.",
    source: "https://en.wikipedia.org/wiki/Israeli-occupied_territories",
  },
  {
    type: "flag",
    target: "United Arab Emirates",
    fromYear: 1952,
    toYear: 1974,
    status: "disputed-then-resolved",
    note:
      "Sovereignty over the Buraimi Oasis was disputed between Saudi Arabia and " +
      "Abu Dhabi/Oman from 1952 (Saudi occupation of part of the oasis) until the 1974 " +
      "Treaty of Jeddah, which also set the Saudi-UAE corridor to the Gulf coast. Current " +
      "geometry reflects the post-1974 settlement.",
    source: "https://en.wikipedia.org/wiki/Buraimi_dispute",
  },
  {
    type: "flag",
    target: "Bahrain",
    fromYear: 1939,
    toYear: 2001,
    status: "disputed-then-resolved",
    note:
      "Sovereignty over the Hawar Islands was contested by Qatar from the 1930s until the " +
      "International Court of Justice awarded them to Bahrain in 2001. Current geometry " +
      "reflects the final ruling; this window marks when it was still unsettled.",
    source: "https://en.wikipedia.org/wiki/Hawar_Islands_dispute",
  },
  {
    type: "flag",
    target: "Kuwait",
    fromYear: 1990,
    toYear: 1991,
    name: "Kuwait (annexed by Iraq)",
    status: "annexed-unrecognized",
    note:
      "Iraq invaded Kuwait on 2 August 1990 and declared it annexed as Iraq's 19th " +
      "province. The annexation was rejected by the UN Security Council and reversed by " +
      "the US-led coalition in the Gulf War; Kuwait City was liberated 26-28 February 1991.",
    source: "https://en.wikipedia.org/wiki/Iraqi_invasion_of_Kuwait",
  },
];
