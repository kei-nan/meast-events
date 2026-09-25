// This file is the actual "fork" of CShapes 2.0 for this project: every historical
// judgment call we've made beyond the raw upstream dataset lives here, nowhere else.
// Nothing in here is auto-generated - it's hand-authored and cited, and it's the only
// place ingest-boundaries.js consults besides the raw CShapes download itself.
//
// Four kinds of entry:
//
//   "split" - a one-directional rename/status progression over an entity's lifetime
//     (a mandate becoming independent, an empire being renamed). `phases` is an
//     ordered list of {until, name, status?, geometry?}; the first phase where
//     year < until applies. Falls through to the default name (CShapes' own name,
//     parenthetical stripped) and default (raw CShapes) geometry if no phase matches
//     - so this only needs to list the *historical* names/shapes, not the current
//     ones. `geometry` is optional and only needed when the shape itself changed, not
//     just the name (see Turkey/Hatay below) - it references a key in
//     data/corrections-geometry.json (see scripts/extract-correction-geometry.js).
//
//   "flag" - a bounded [fromYear, toYear] window attaching a note/status/source to
//     an existing entity, optionally with a temporary display name (e.g. a military
//     occupation). Outside the window, whatever the entity's normal name/status is
//     (from a "split" entry or the default) applies unchanged. Doesn't require the
//     window to align with any underlying CShapes date boundary - the ingest script
//     splits the geometry's date range as needed.
//
//   "add" - an entirely new feature with no CShapes counterpart at all: not derived
//     from filtering/splitting any raw CShapes record, just its own name/dates/
//     geometry/status. `geometry` references a key in data/corrections-geometry.json.
//     Optional `geometry_source` credits where that polygon came from, for the cases
//     where the shape has a different (and separately licensed) provenance from the
//     historical claim in `source` - it's carried into the output feature's `source`
//     property so the credit travels with the data, which some upstream licenses
//     require of us.
//
// Every entry with historical content must cite a source. Nothing here should be
// taken on my (the model's) say-so alone without a citation a reader can check.

// Credit for the Oslo II Area A/B/C polygons. The license they come under (see
// scripts/extract-correction-geometry.js) permits derivative works only with credit to
// the source, so this has to travel with the generated data, not just live in a comment.
const OSLO_GEOMETRY_CREDIT =
  "Areas A/B/C geometry from UN OCHA occupied Palestinian territory, \"State of Palestine " +
  "- Oslo Agreement in the West Bank\" (source: Palestinian Authority Ministry of " +
  "Planning), https://data.humdata.org/dataset/state-of-palestine-other-0-0-0-0-0";

export const CORRECTIONS = [
  // --- Renames / mandate-to-independence progressions ---
  {
    type: "split",
    target: "Turkey (Ottoman Empire)",
    phases: [
      { until: 1923, name: "Ottoman Empire" },
      // CShapes' Turkey polygon already includes Hatay (the Sanjak of Alexandretta),
      // but France didn't cede it from Syria until 1939 - see the "add" entry for
      // Hatay below for the 1923-1939 period. geometry: "turkeyPre1939" is Turkey's
      // CShapes shape with Hatay subtracted (computed via polygon difference against
      // modern Hatay Province as an approximation of the historical Sanjak boundary).
      { until: 1939, name: "Turkey", geometry: "turkeyPre1939" },
    ],
    note:
      "The Ottoman Empire was formally abolished and the Republic of Turkey proclaimed " +
      "on 29 October 1923. Separately: this shape excludes Hatay/Alexandretta until " +
      "1939 (see the Hatay entry below) - CShapes' own polygon incorrectly included it " +
      "from 1923.",
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
      "Camp David Accords and is excluded from this shape from that year on. Gaza likewise " +
      "remains part of this polygon throughout, even though Israel withdrew its settlements " +
      "and forces in 2005. CShapes gives us no dividing lines inside this blob, so the West " +
      "Bank and Gaza entries further down are drawn on top of it as separate shapes; the " +
      "Golan Heights is still undifferentiated.",
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

  // --- Additions: territories with no CShapes counterpart at all ---
  {
    type: "add",
    name: "Sanjak of Alexandretta (Hatay)",
    start_year: 1923,
    end_year: 1938,
    status: "mandate",
    geometry: "hatay",
    note:
      "An autonomous sanjak within the French Mandate for Syria, its status formalized " +
      "by a 1937 League of Nations agreement; briefly the separatist \"Hatay State\" from " +
      "September 1938 before Turkey annexed it in June 1939 following a referendum " +
      "widely regarded internationally as rigged. Geometry approximated using the " +
      "modern boundary of Turkey's Hatay Province (Natural Earth), which may not " +
      "exactly match the historical Sanjak/State boundary.",
    source: "https://en.wikipedia.org/wiki/Hatay_State",
  },
  {
    type: "add",
    name: "West Bank (Jordanian military administration)",
    start_year: 1948,
    end_year: 1949,
    status: "occupied-administered",
    geometry: "westBank",
    note:
      "Held by Jordan's Arab Legion after the 1948 Arab-Israeli War, before formal " +
      "annexation in 1950 (see the next entry). Geometry follows the 1949 Armistice " +
      "(\"Green\") Line, using its modern representation (Natural Earth), which has not " +
      "moved since.",
    source: "https://en.wikipedia.org/wiki/1949_Armistice_Agreements",
  },
  {
    type: "add",
    name: "West Bank (annexed by Jordan)",
    start_year: 1950,
    end_year: 1966,
    status: "annexed-unrecognized",
    geometry: "westBank",
    note:
      "Jordan formally annexed the West Bank on 24 April 1950, extending citizenship to " +
      "Palestinians there. Barely recognized: only the United Kingdom did so formally " +
      "(de facto for East Jerusalem), the United States recognized it except for " +
      "Jerusalem, Pakistan's often-cited recognition is disputed, and the Arab League " +
      "declared it illegal, treating Jordan as a temporary trustee. Held until lost to " +
      "Israel in the Six-Day War of 5-10 June 1967; because that war fell mid-year and " +
      "this dataset works in whole years, 1967 itself is assigned to the Israeli " +
      "occupation entry below - the same year Israel's own occupied-territory-included " +
      "flag starts. Jordan did not sever its legal and administrative ties to the West " +
      "Bank until 31 July 1988.",
    source: "https://en.wikipedia.org/wiki/Jordanian_annexation_of_the_West_Bank",
  },
  {
    type: "add",
    name: "Gaza Strip (Egyptian military administration)",
    start_year: 1948,
    end_year: 1966,
    status: "occupied-administered",
    geometry: "gaza",
    note:
      "Held by Egypt after the 1948 Arab-Israeli War under military administration - " +
      "never annexed, unlike Jordan's West Bank. The Arab League-backed \"All-Palestine " +
      "Government\" was nominally based in Gaza from September 1948 but held little real " +
      "power and was dissolved by Nasser in 1959. Held until lost to Israel in the Six-Day " +
      "War of June 1967; as with the West Bank above, the year 1967 itself is assigned to " +
      "the Israeli occupation entry below rather than split. Geometry follows the " +
      "1949 Armistice Line, using its modern representation (Natural Earth), which has " +
      "not moved since.",
    source: "https://en.wikipedia.org/wiki/All-Palestine_Government",
  },

  // --- West Bank after 1967 ---
  //
  // Israel's CShapes polygon swallows the West Bank whole from 1967 on (see the
  // "occupied-territory-included" flag above), so without these entries the map has
  // nothing to say about the West Bank after 1967 at all. Three periods, with the
  // 1995-1999 one existing precisely because the picture was changing too fast to map:
  {
    type: "add",
    name: "West Bank (Israeli military occupation)",
    start_year: 1967,
    end_year: 1994,
    status: "occupied-administered",
    geometry: "westBank",
    note:
      "Israel captured the West Bank from Jordan on 7 June 1967 in the Six-Day War. It was " +
      "run by an Israeli military governorate until 1981, when Military Order 947 created " +
      "the Israeli Civil Administration to handle civil matters - still under, not instead " +
      "of, the military government. East Jerusalem was placed under Israeli law and " +
      "administration on 28 June 1967, a step the UN Security Council declared null and " +
      "void; this shape includes it throughout. No part of the West Bank passed to " +
      "Palestinian control in this period.",
    source: "https://en.wikipedia.org/wiki/Israeli_occupation_of_the_West_Bank",
  },
  {
    type: "add",
    name: "West Bank (Israeli occupation, phased Oslo transfers)",
    start_year: 1995,
    end_year: 1999,
    status: "occupied-administered",
    geometry: "westBank",
    note:
      "A deliberately undifferentiated shape for the years when the Oslo map was still " +
      "moving. The 4 May 1994 Gaza-Jericho Agreement handed the PA the Jericho area only; " +
      "the Oslo II Accord of 28 September 1995 introduced the Area A/B/C division, but " +
      "Area A started at roughly 3% of the West Bank and only reached its present ~18% " +
      "through the 1997 Hebron Protocol, the 1998 Wye River Memorandum (Israel transferred " +
      "2% of the 13% agreed) and the three Sharm el-Sheikh Memorandum redeployments of " +
      "September 1999 - March 2000. We have not found a reliable year-by-year source for " +
      "the intermediate A/B/C boundaries, so this dataset does not attempt to draw them; " +
      "the mapped division below begins only once it stopped changing.",
    source: "https://en.wikipedia.org/wiki/West_Bank_areas_in_the_Oslo_II_Accord",
  },
  // The three Oslo II areas as they have stood since the final redeployment of
  // 20 March 2000. Geometry from UN OCHA oPt's "Oslo Agreement in the West Bank"
  // dataset (source: Palestinian Authority Ministry of Planning) - see
  // scripts/extract-correction-geometry.js for the download, the license, and the
  // reasoning behind how its eight classes were grouped into these three shapes.
  // Percentages below are computed from that geometry itself (script output), not
  // quoted from elsewhere, and land within a point of the commonly published
  // 18% / 22% / 60-62% figures.
  //
  // Caveat worth knowing: these three shapes come from a different source than the
  // 1948-1999 "westBank" shape above (Natural Earth), and the two renderings of the
  // Green Line don't agree exactly - about 274 km2 falls inside the Natural Earth
  // outline but outside OCHA's, and about 190 km2 the other way (roughly 5% and 3% of
  // the territory). So the West Bank's outer edge shifts very slightly as the timeline
  // crosses 1999/2000. That is a source artefact, not a historical border change.
  {
    type: "add",
    name: "West Bank Area A (Palestinian Authority)",
    start_year: 2000,
    end_year: 9999,
    status: "autonomous-partial",
    geometry: "westBankAreaA",
    geometry_source: OSLO_GEOMETRY_CREDIT,
    note:
      "Oslo II's Area A: Palestinian Authority civil AND security control, on paper. " +
      "1,004 km2, 17.7% of the West Bank - the eight main Palestinian cities and their " +
      "immediate surroundings, in about fifteen disconnected blocks, plus Hebron's H1 " +
      "sector (Palestinian-controlled under the 1997 Hebron Protocol), which is merged " +
      "into this shape. \"Full Palestinian control\" is a de jure description only: since " +
      "Operation Defensive Shield (29 March - 10 May 2002) Israel has reoccupied and " +
      "continued to conduct military operations inside Area A at will.",
    source: "https://en.wikipedia.org/wiki/West_Bank_areas_in_the_Oslo_II_Accord",
  },
  {
    type: "add",
    name: "West Bank Area B (Palestinian civil, joint security)",
    start_year: 2000,
    end_year: 9999,
    status: "joint-control",
    geometry: "westBankAreaB",
    geometry_source: OSLO_GEOMETRY_CREDIT,
    note:
      "Oslo II's Area B: Palestinian Authority civil control, Israeli-Palestinian joint " +
      "security control. 1,203 km2, 21.2% of the West Bank, in roughly 210 separate " +
      "enclaves - some 440 Palestinian villages and their built-up areas, each ringed by " +
      "Area C. Includes the Oslo nature reserves, which OCHA's dataset classes separately " +
      "but which Oslo II placed under the Area B regime with building restricted.",
    source: "https://en.wikipedia.org/wiki/West_Bank_areas_in_the_Oslo_II_Accord",
  },
  {
    type: "add",
    name: "West Bank Area C (Israeli control)",
    start_year: 2000,
    end_year: 9999,
    status: "occupied-administered",
    geometry: "westBankAreaC",
    geometry_source: OSLO_GEOMETRY_CREDIT,
    note:
      "Oslo II's Area C: full Israeli civil and security control, administered by the " +
      "Israeli Civil Administration. 3,453 km2, 61.0% of the West Bank - the single " +
      "largest fact about the territory, and the one a \"West Bank = Palestinian " +
      "Authority\" shape would hide. Oslo II committed this land to be \"gradually " +
      "transferred to Palestinian jurisdiction\"; the last transfer of any West Bank " +
      "territory to the PA was on 20 March 2000, and nothing has moved since. All Israeli " +
      "settlements are here. This shape also absorbs two categories that sit outside the " +
      "Oslo A/B/C scheme entirely but are likewise under Israeli control - Israeli-declared " +
      "East Jerusalem (~69 km2) and the 1949-1967 no-man's-land (~50 km2) - so that the " +
      "three areas tile the West Bank without holes; that merge is ours, not OCHA's.",
    source: "https://en.wikipedia.org/wiki/Area_C_(West_Bank)",
  },

  // --- Gaza Strip after 1967 ---
  {
    type: "add",
    name: "Gaza Strip (Israeli military occupation)",
    start_year: 1967,
    end_year: 1993,
    status: "occupied-administered",
    geometry: "gaza",
    note:
      "Israel took Gaza from Egypt in the Six-Day War in June 1967 and ran it under a " +
      "military governorate, then from 1981 through the Israeli Civil Administration (the " +
      "same structure as the West Bank; its Gaza role ended with the 2005 disengagement). " +
      "Israeli settlement in the Strip began in 1970 and eventually reached 21 settlements.",
    source: "https://en.wikipedia.org/wiki/Israeli_Civil_Administration",
  },
  {
    type: "add",
    name: "Gaza Strip (Palestinian Authority, Israeli settlements retained)",
    start_year: 1994,
    end_year: 2004,
    status: "autonomous-partial",
    geometry: "gaza",
    note:
      "The Gaza-Jericho Agreement of 4 May 1994 created the Palestinian Authority and " +
      "required Israeli withdrawal within three weeks - but its Article V(1)(a) limited PA " +
      "territorial jurisdiction to \"the Gaza Strip and the Jericho Area territory ... " +
      "except for Settlements and the Military Installation Area\". Israel's 21 " +
      "settlements, their access roads, the military zones around them and the Philadelphi " +
      "corridor along the Egyptian border stayed under Israeli control, leaving the PA " +
      "with roughly 60% of the Strip's land until 2005. This shape is the whole Strip: we " +
      "have not sourced polygons for the settlement blocs, so it overstates PA control.",
    source: "https://en.wikipedia.org/wiki/Gaza%E2%80%93Jericho_Agreement",
  },
  {
    type: "add",
    name: "Gaza Strip (Palestinian Authority, post-disengagement)",
    start_year: 2005,
    end_year: 2006,
    status: "autonomous-partial",
    geometry: "gaza",
    note:
      "Under Israel's unilateral disengagement plan (Knesset approval 16 February 2005) " +
      "all 21 Gaza settlements were evacuated between 15 and 22 August 2005 and the last " +
      "Israeli soldier left on 12 September 2005, taking the share of Gaza nominally " +
      "governed by the PA from about 60% to 100%. Israel declared the Strip " +
      "\"extraterritorial\" on 21 September 2005 but kept control of its airspace, " +
      "territorial waters, population registry and all but one land crossing, so the UN, " +
      "most states and the ICJ's 2024 advisory opinion continued to treat Gaza as " +
      "occupied; Israel and the United States disagree.",
    source: "https://en.wikipedia.org/wiki/Israeli_disengagement_from_the_Gaza_Strip",
  },
  {
    type: "add",
    name: "Gaza Strip (Hamas government, under blockade)",
    start_year: 2007,
    end_year: 2022,
    status: "de-facto-separate-administration",
    geometry: "gaza",
    note:
      "Hamas won the Palestinian legislative election of 25 January 2006 (74 seats to " +
      "Fatah's 45). The power-sharing that followed collapsed into armed conflict with " +
      "Fatah in Gaza from 7 June 2007; Mahmoud Abbas dissolved the unity government and " +
      "declared a state of emergency on 14 June, and Hamas held all Palestinian Authority " +
      "institutions in Gaza by 15 June. From then the Palestinian territories had two " +
      "administrations - Hamas in Gaza, the Ramallah-based PA still nominally governing " +
      "the West Bank - and Gaza remained de jure PA territory throughout. Israel " +
      "designated Gaza a \"hostile entity\" in September 2007; the Israeli-Egyptian " +
      "blockade dates from this point.",
    source: "https://en.wikipedia.org/wiki/Battle_of_Gaza_(2007)",
  },
  {
    type: "add",
    name: "Gaza Strip (Israeli ground offensive)",
    start_year: 2023,
    end_year: 2025,
    status: "active-conflict",
    geometry: "gaza",
    note:
      "The Hamas-led attack on Israel of 7 October 2023 was followed by an Israeli ground " +
      "invasion from 27 October 2023 and a war lasting until the ceasefire of 10 October " +
      "2025. Control of the Strip was divided and shifting throughout; this dataset keeps " +
      "a single shape for the period because the front lines were not fixed and we have no " +
      "sourced geometry for them.",
    source: "https://en.wikipedia.org/wiki/Gaza_war",
  },
  {
    type: "add",
    name: "Gaza Strip (ceasefire, divided at the Yellow Line)",
    start_year: 2026,
    end_year: 9999,
    status: "partitioned-ceasefire",
    geometry: "gaza",
    note:
      "The ceasefire that took effect on 10 October 2025 left Gaza split along the " +
      "\"Yellow Line\": Israeli forces east of it (about 53% of the Strip at the " +
      "ceasefire, which Israel said had grown to about 60% by May 2026), Hamas and other " +
      "Palestinian armed groups on the coastal side. UN Security Council Resolution 2803 " +
      "of 17 November 2025 established a Board of Peace and an International Stabilization " +
      "Force to oversee a transitional administration; the Hamas civil administration " +
      "resigned on 6 July 2026. IMPORTANT: this remains one undivided shape - we could not " +
      "source Yellow Line geometry (it is not published on OCHA's oPt data portal), so the " +
      "map does NOT show the division this entry describes. This is also the most volatile " +
      "and least settled entry in this file and is the most likely to be out of date.",
    source: "https://en.wikipedia.org/wiki/Yellow_Line_(Gaza)",
  },
];
