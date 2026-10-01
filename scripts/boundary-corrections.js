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
//   "reshape" - cuts a shape in data/corrections-geometry.json by a CShapes country's
//     current outline before any entry uses it (`minus: "cshapes:<cntry_name>"`), for a
//     stretch of border where CShapes is checked to be the more accurate source. Applied
//     once, so every entry that uses the shape gets the same outline. The two sources'
//     coastlines differ, so with `coastEnd` (the border's last two CShapes vertices, the
//     second where it meets the sea) that stretch is extended straight out to sea and the
//     shape is cut there too; `keepPoint` marks the side that is kept.
//
//   "fit" - makes a separately sourced shape (an "add" entry, or Hatay) and the CShapes
//     countries around it share ONE line where they meet. The shapes come from sources
//     of different detail (Natural Earth 1:10m, OCHA, CShapes), so drawn as-is they
//     overlap or leave thin unclaimed slivers, and the map shows two lines a kilometre
//     or two apart. For each listed neighbour, in the years both are on the map:
//     "clip" removes the overlay's area from the neighbour; "trim" also drops the small
//     detached leftovers that clipping strands next to the overlay (and, with `between`,
//     its land in the narrow strip between the overlay and that named shape); "snap" also gives the
//     neighbour the unclaimed land (within `maxGapKm`) between the two; "contain" is for
//     a country whose shape is meant to include the overlay (Israel from 1967): it is
//     widened to wrap the overlay fully. `trim: true` adds trim's clean-up to "snap". The overlay's own outline is never changed. Applied in ingest-boundaries.js after all other
//     entries. This picks one sourced line over another; it invents no new line.
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
      // The Republic was proclaimed on 29 October 1923, so under the 1 July rule 1923 is
      // still the Ottoman Empire.
      { until: 1924, name: "Ottoman Empire" },
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
    // Years follow the 1 July rule in ingest-boundaries.js: Faisal was crowned on
    // 23 August 1921 and independence came on 3 October 1932, so 1921 is still the
    // mandate and 1932 still the kingdom under mandate.
    phases: [
      { until: 1922, name: "British Mandate of Mesopotamia", status: "mandate" },
      { until: 1933, name: "Kingdom of Iraq (British Mandate)", status: "mandate" },
      { until: 1959, name: "Kingdom of Iraq" }, // the monarchy fell on 14 July 1958
    ],
    note:
      "British Mandate of Mesopotamia -> Kingdom of Iraq under British mandate (Faisal I " +
      "crowned 23 August 1921) -> independent Kingdom of Iraq (3 October 1932, still a " +
      "monarchy) -> Republic (14 July Revolution, 1958).",
    source: "https://en.wikipedia.org/wiki/Kingdom_of_Iraq",
  },

  {
    type: "split",
    target: "Lebanon",
    // Lebanon declared independence on 22 November 1943; CShapes starts the independent
    // record on 22 November 1944, so the mandate phase ends with 1944's record.
    phases: [{ until: 1944, name: "Lebanon (French Mandate)", status: "mandate" }],
    note:
      "State of Greater Lebanon (1920), renamed the Lebanese Republic in 1926, under the " +
      "French Mandate for Syria and the Lebanon until independence was declared on " +
      "22 November 1943.",
    source: "https://en.wikipedia.org/wiki/State_of_Greater_Lebanon",
  },
  {
    type: "split",
    target: "United Arab Emirates",
    // The UAE was formed on 2 December 1971, so 1971 is still the Trucial States.
    phases: [{ until: 1972, name: "Trucial States" }],
    note:
      "The Trucial States, a group of sheikhdoms under British protection, became the " +
      "United Arab Emirates on 2 December 1971 (Ras al-Khaimah joined in February 1972).",
    source: "https://en.wikipedia.org/wiki/Trucial_States",
  },
  {
    type: "split",
    target: "Oman",
    // Renamed the Sultanate of Oman in August 1970, so 1970 is still Muscat and Oman.
    phases: [{ until: 1971, name: "Muscat and Oman" }],
    note: "Called the Sultanate of Muscat and Oman until it was renamed the Sultanate of Oman in August 1970.",
    source: "https://en.wikipedia.org/wiki/Muscat_and_Oman",
  },
  {
    type: "split",
    target: "Yemen (Arab Republic of Yemen)",
    // Republic proclaimed 26 September 1962 (1962 is still the kingdom); unification with
    // the south on 22 May 1990 (1990 is the unified Republic of Yemen, the default name).
    phases: [
      { until: 1963, name: "Mutawakkilite Kingdom of Yemen" },
      { until: 1990, name: "Yemen Arab Republic" },
    ],
    note:
      "North Yemen: the Mutawakkilite Kingdom (from 1918) until the 26 September 1962 " +
      "revolution proclaimed the Yemen Arab Republic, followed by a civil war with the " +
      "royalists until 1970. Unified with South Yemen as the Republic of Yemen on 22 May 1990.",
    source: "https://en.wikipedia.org/wiki/Yemen_Arab_Republic",
  },
  {
    type: "split",
    target: "Yemen, People's Republic of",
    // Independent 30 November 1967; renamed on 30 November 1970, so 1970 is still the
    // People's Republic of South Yemen.
    phases: [
      { until: 1971, name: "People's Republic of South Yemen" },
      { until: 1990, name: "People's Democratic Republic of Yemen" },
    ],
    note:
      "South Yemen: independent from Britain on 30 November 1967 as the People's Republic of " +
      "South Yemen, renamed the People's Democratic Republic of Yemen on 30 November 1970, " +
      "unified with North Yemen on 22 May 1990.",
    source: "https://en.wikipedia.org/wiki/South_Yemen",
  },

  // --- Status flags: corrections and additions to CShapes' existing geometry ---
  {
    type: "flag",
    target: "Israel",
    fromYear: 1967,
    toYear: 9999,
    status: "occupied-territory-included",
    note:
      "This shape includes territory occupied in the 1967 Six-Day War. Israel annexed East " +
      "Jerusalem (1980 Jerusalem Law) and the Golan Heights (1981 Golan Heights Law); the UN " +
      "Security Council declared both null and void (Resolutions 478 and 497), and the United " +
      "States recognized Israeli sovereignty over the Golan in March 2019. The rest of the " +
      "West Bank was not annexed. Sinai was returned to Egypt under the 1979 peace treaty, " +
      "in stages completed on 25 April 1982, and is excluded from this shape from 1979 on " +
      "(CShapes' switch date); Taba followed after arbitration in 1989. Gaza likewise " +
      "remains part of this polygon throughout, even though Israel withdrew its settlements " +
      "and forces in 2005. CShapes gives us no dividing lines inside this blob, so the West " +
      "Bank, Gaza and Golan Heights entries further down are drawn on top of it as separate " +
      "shapes.",
    source:
      "https://en.wikipedia.org/wiki/Israeli-occupied_territories; " +
      "https://en.wikipedia.org/wiki/Golan_Heights_Law; " +
      "https://en.wikipedia.org/wiki/Israeli_occupation_of_the_Sinai_Peninsula",
  },
  {
    type: "flag",
    target: "Egypt",
    fromYear: 1979,
    toYear: 1981,
    note:
      "Sinai is drawn as Egyptian from 1979, when the Egypt-Israel peace treaty was signed " +
      "and CShapes switches the border. Israel actually withdrew in stages that ended on " +
      "25 April 1982; Taba was returned only in 1989, after international arbitration.",
    source: "https://en.wikipedia.org/wiki/Israeli_occupation_of_the_Sinai_Peninsula",
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
  // CShapes has no notion of either Uqair Protocol neutral zone: it hands each zone's two
  // eventual halves to their modern owners for the whole 20th century, so the later
  // partition line would run through each zone. The zones are added as their own
  // features further down, and "fit" entries at the end cut them out of Saudi Arabia,
  // Kuwait and Iraq for the years they existed. These flags explain that on the two
  // shapes whose outline changes when the zone is partitioned. Iraq gets no flag: a
  // flag's note replaces a split's note for the same years, and an Iraq flag spanning
  // 1922-1981 would wipe out the mandate/kingdom/republic note above; the Saudi-Iraqi
  // zone's own entry names Iraq instead.
  {
    type: "flag",
    target: "Saudi Arabia",
    fromYear: 1922,
    toYear: 1981,
    status: null,
    note:
      "Both Uqair Protocol neutral zones are drawn as their own shared territories for the " +
      "years they existed and are not part of this shape: the Saudi-Kuwaiti zone (shared " +
      "with Kuwait until its partition took effect in December 1969) and the Saudi-Iraqi " +
      "zone (shared with Iraq until the 1981 treaty, in force February 1982). Saudi Arabia " +
      "received roughly half of each on partition.",
    source: "https://en.wikipedia.org/wiki/Uqair_Protocol_of_1922",
  },
  {
    type: "flag",
    target: "Kuwait",
    fromYear: 1922,
    toYear: 1969,
    status: null,
    note:
      "The Saudi-Kuwaiti neutral zone, which Kuwait shared equally with Najd/Saudi Arabia " +
      "from the 1922 Uqair Protocol until the partition took effect in December 1969, is " +
      "drawn as its own shared territory and is not part of this shape until then; Kuwait " +
      "received its northern half.",
    source: "https://en.wikipedia.org/wiki/Uqair_Protocol_of_1922",
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
    // Article 7 of the Treaty of Ankara (20 October 1921) gave the district its special
    // regime within French Syria, so under the 1 July rule 1922 is its first year.
    start_year: 1922,
    end_year: 1938,
    status: "mandate",
    geometry: "hatay",
    note:
      "An autonomous sanjak within the French Mandate for Syria from the Treaty of Ankara of " +
      "20 October 1921 (Article 7: \"A special administrative regime shall be established " +
      "for the district of Alexandretta\"), its status formalized by a 1937 League of " +
      "Nations agreement; briefly the separatist \"Hatay State\" from " +
      "September 1938 before Turkey annexed it in June 1939 following a referendum " +
      "widely regarded internationally as rigged. Geometry approximated using the " +
      "modern boundary of Turkey's Hatay Province (Natural Earth), which may not " +
      "exactly match the historical Sanjak/State boundary.",
    source: "https://en.wikipedia.org/wiki/Sanjak_of_Alexandretta; https://en.wikipedia.org/wiki/Hatay_State",
  },
  {
    type: "add",
    name: "West Bank (Jordanian military administration)",
    start_year: 1948,
    end_year: 1949,
    status: "occupied-administered",
    geometry: "cshapes:West Bank",
    note:
      "Held by Jordan's Arab Legion after the 1948 Arab-Israeli War, before formal " +
      "annexation in 1950 (see the next entry). Geometry: CShapes 2.0's own West Bank " +
      "record (1948-1967), which follows the 1949 Armistice (\"Green\") Line and includes " +
      "East Jerusalem.",
    source: "https://en.wikipedia.org/wiki/1949_Armistice_Agreements",
  },
  {
    type: "add",
    name: "West Bank (annexed by Jordan)",
    start_year: 1950,
    end_year: 1966,
    status: "annexed-unrecognized",
    geometry: "cshapes:West Bank",
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

  // --- Golan Heights and the Gulf islands ---
  //
  // Both sit inside another polygon or in none: Israel's CShapes shape includes the Golan
  // from 1967, and no CShapes polygon includes Abu Musa or the Tunbs. Drawn on top, like
  // the West Bank entries, so every occupation or annexation in the region gets its own
  // labelled shape rather than only some.
  {
    type: "add",
    name: "Golan Heights (Israeli military occupation)",
    start_year: 1967,
    end_year: 1981,
    status: "occupied-administered",
    geometry: "golan",
    note:
      "Captured from Syria by Israel in the Six-Day War of June 1967 and held under military " +
      "administration until the Golan Heights Law of 14 December 1981. Shape derived from " +
      "CShapes 2.0 (Israel's post-1967 polygon minus its 1949 lines, the West Bank and Gaza); " +
      "it does not exclude the UN buffer zone set up in 1974, so the eastern edge is approximate.",
    source: "https://en.wikipedia.org/wiki/Golan_Heights",
  },
  {
    type: "add",
    name: "Golan Heights (annexed by Israel)",
    start_year: 1982,
    end_year: 9999,
    status: "annexed-unrecognized",
    geometry: "golan",
    note:
      "Israel applied its law to the Golan Heights on 14 December 1981. UN Security Council " +
      "Resolution 497 declared the move \"null and void and without international legal " +
      "effect\"; the United States recognized Israeli sovereignty in March 2019, and Syria " +
      "maintains its claim. Same approximate shape as the entry above.",
    source: "https://en.wikipedia.org/wiki/Golan_Heights_Law",
  },
  {
    type: "add",
    name: "Abu Musa and Greater Tunb (held by Iran, claimed by the UAE)",
    start_year: 1972,
    end_year: 9999,
    status: "disputed",
    geometry: "gulfIslands",
    geometry_source: "Island outlines from Natural Earth 10m minor islands (public domain)",
    note:
      "Iran took control of Abu Musa and the Greater and Lesser Tunbs on 30 November 1971, " +
      "as British forces withdrew and days before the United Arab Emirates was formed; the " +
      "UAE claims all three. Lesser Tunb is not drawn because no open dataset has its outline.",
    source: "https://en.wikipedia.org/wiki/Seizure_of_Abu_Musa_and_the_Greater_and_Lesser_Tunbs",
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
    geometry: "cshapes:West Bank",
    note:
      "Israel captured the West Bank from Jordan on 7 June 1967 in the Six-Day War. It was " +
      "run by an Israeli military governorate until 1981, when Military Order 947 created " +
      "the Israeli Civil Administration to handle civil matters - still under, not instead " +
      "of, the military government. East Jerusalem was placed under Israeli law and " +
      "administration on 28 June 1967, a step the UN Security Council declared null and " +
      "void; this shape (CShapes 2.0's West Bank record, 1949 Armistice Line) includes it " +
      "throughout. No part of the West Bank passed to Palestinian control in this period.",
    source: "https://en.wikipedia.org/wiki/Israeli_occupation_of_the_West_Bank",
  },
  {
    type: "add",
    name: "West Bank (Israeli occupation, phased Oslo transfers)",
    start_year: 1995,
    end_year: 1999,
    status: "occupied-administered",
    geometry: "cshapes:West Bank",
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
  // 1948-1999 West Bank shape above (CShapes 2.0's own "West Bank" record), and the two
  // renderings of the Green Line don't agree exactly - about 336 km2 falls inside the
  // CShapes outline but outside OCHA's, and about 116 km2 the other way (roughly 6% and
  // 2% of the territory; recomputed 2026-10-01). So the West Bank's outer edge shifts
  // slightly as the timeline crosses 1999/2000. That is a source artefact, not a
  // historical border change.
  {
    type: "add",
    name: "West Bank Area A (Palestinian Authority)",
    start_year: 2000,
    end_year: 9999,
    status: "autonomous-partial",
    geometry: "westBankAreaA",
    geometry_source: OSLO_GEOMETRY_CREDIT,
    note:
      "Oslo II's Area A: Palestinian Authority civil and security control under the accord. " +
      "1,004 km2, 17.7% of the West Bank - the eight main Palestinian cities and their " +
      "immediate surroundings, in about fifteen disconnected blocks, plus Hebron's H1 " +
      "sector (Palestinian-controlled under the 1997 Hebron Protocol), which is merged " +
      "into this shape. Since Operation Defensive Shield (29 March - 10 May 2002) the " +
      "Israeli military has also conducted operations inside Area A.",
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
      "Israeli Civil Administration. 3,453 km2, 61.0% of the West Bank, the largest " +
      "of the three areas. Oslo II committed this land to be \"gradually " +
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

  // --- Neutral Zones (Uqair Protocol, 1922) ---
  {
    type: "add",
    name: "Saudi-Kuwaiti Neutral Zone",
    start_year: 1922,
    end_year: 1969,
    status: "shared-sovereignty",
    geometry: "saudiKuwaitiNeutralZone",
    note:
      "Created by the Uqair Protocol of 2 December 1922, which left this strip between " +
      "Kuwait and Najd undivided because the bedouin tribes who watered there moved freely " +
      "across it: \"in this territory the Government of Najd and Kuwait will share equal " +
      "rights until ... a further agreement is made\". No such agreement came for almost " +
      "40 years; oil concessions were granted separately by each side in 1948/49 (Aminoil " +
      "by Kuwait, Pacific Western/Getty by Saudi Arabia) and worked jointly. The two " +
      "governments agreed to partition it on 7 July 1965 (in force 25 July 1966), and the " +
      "dividing line surveyed by the Pacific Aero Survey Company took effect with the " +
      "exchange of instruments at Kuwait on 18 December 1969. Partition ended the shared " +
      "sovereignty but not the shared oil: the area is still the \"Divided Zone\", each " +
      "half administered by its own state but the petroleum revenue of the whole shared " +
      "equally. Geometry digitized here from the boundary descriptions themselves - the " +
      "1913 Anglo-Ottoman 40-mile arc on the north, Wadi ash Shaq on the west, the line " +
      "through 'Ayn al 'Abd on the south, the Gulf coast on the east - because no open " +
      "dataset maps the zone; see scripts/extract-correction-geometry.js for each " +
      "coordinate's source and for the cross-checks it is verified against. It comes out " +
      "at about 4,800 km2 of land against the ~5,700-5,770 km2 usually quoted, a gap this " +
      "project has not been able to account for.",
    source: "https://library.law.fsu.edu/Digital-Collections/LimitsinSeas/pdf/ibs103.pdf",
  },

  // --- Fits: one shared line where differently sourced shapes meet (see "fit" above) ---
  //
  // Gaza, checked 2026-10-01 against reference points that sit ON its land border:
  //   Gaza-Egypt (Rafah) border - Wikidata's Rafah Border Crossing (Q2564302, 31.2486 N
  //   34.2592 E) and Philadelphi Route (Q765017, 31.2481 N 34.2571 E): CShapes' Egypt edge
  //   is 0.30 and 0.09 km from them, Natural Earth's Gaza edge 2.25 and 2.04 km, with both
  //   points inside the Natural Earth outline. Its southern tip is also 2.4 km from the
  //   Kerem Shalom crossing (Wikipedia, 31.2208 N 34.2706 E), where CShapes' Egypt-Israel
  //   line arrives (0.41 km). So on this border CShapes is right and Natural Earth's Gaza
  //   runs about 2 km into Egypt: the "reshape" entry below cuts it back to Egypt's line.
  //   Gaza-Israel border - Wikipedia's Erez and Karni crossings: Natural Earth 1.19 and
  //   0.43 km, CShapes 0.41 and 0.62 km. Neither is clearly better, so there Gaza's own
  //   outline is kept and Israel follows it.
  // The reshaped Gaza is about 316 km2 against the official 365 km2; neither source
  // reproduces the official figure, and this one is placed correctly on the Egypt side.
  {
    type: "reshape",
    geometry: "gaza",
    minus: "cshapes:Egypt",
    // The last stretch of CShapes' Egypt-Gaza line: its previous vertex, then the vertex
    // where it reaches the sea (Natural Earth's coast runs on past that point).
    coastEnd: [[34.23916, 31.29472], [34.21676, 31.32321]],
    keepPoint: [34.4667, 31.5], // Gaza City: the side of the cut that is kept
    note: "Gaza's Rafah border follows CShapes' Egypt line, which matches the Rafah crossing to 0.3 km.",
  },
  {
    type: "fit",
    overlay: "Gaza Strip",
    neighbours: [
      // After the reshape the two share Egypt's line; this only removes rounding overlaps.
      { name: "Egypt", mode: "clip" },
      // 1948-1966: the armistice line is Gaza's edge.
      { name: "Israel", mode: "snap", toYear: 1966 },
      // From 1967 Israel's CShapes shape includes the Strip by design (its flag note), but
      // only 90-97% of this outline, so its edge would cut across the Strip's south.
      { name: "Israel", mode: "contain", fromYear: 1967 },
    ],
    maxGapKm: 3,
    note:
      "Gaza's land border follows the Gaza Strip shape (Natural Earth); Egypt's and (1948-1966) " +
      "Israel's CShapes lines are fitted to it.",
  },
  {
    type: "fit",
    overlay: "Sanjak of Alexandretta",
    neighbours: [
      // The Ottoman shape in 1922-1923 is CShapes' Turkey, which includes the sanjak, and
      // 1924-1938 Turkey is that shape minus this outline: both leave thin stranded pieces
      // (up to 63 km2) between the sanjak and Syria and along the coast.
      { name: "Ottoman Empire", mode: "trim" },
      // Turkey also keeps a strip, attached to its main body, between the sanjak and Syria.
      { name: "Turkey", mode: "trim", toYear: 1938, between: "French Mandate of Syria" },
      { name: "French Mandate of Syria", mode: "snap" },
    ],
    maxGapKm: 3,
    note:
      "The sanjak's outline (Natural Earth's modern Hatay Province) is the line; the Ottoman " +
      "shape no longer also covers it, and French Syria's CShapes edge is fitted to it.",
  },
  {
    type: "fit",
    overlay: "West Bank Area C",
    // OCHA's Area C runs about 1 km past CShapes' Jordan-West Bank line along the Jordan
    // River and Dead Sea (26.6 km2).
    neighbours: [
      { name: "Jordan", mode: "clip" },
      // Israel's shape includes the West Bank from 1967 (see its flag) but stops at CShapes' line.
      { name: "Israel", mode: "contain", fromYear: 2000 },
    ],
    maxGapKm: 3,
    note: "The West Bank's eastern edge follows OCHA's Area C; Jordan's CShapes line is fitted to it.",
  },
  // The neutral zones were undivided shared territory until partition, so neither
  // neighbour's shape may include any of them (and the later partition line, which CShapes
  // draws through each zone, disappears). "trim" also drops the small pieces the
  // hand-digitized zone edges strand next to it.
  {
    type: "fit",
    overlay: "Saudi-Kuwaiti Neutral Zone",
    neighbours: [
      { name: "Kuwait", mode: "trim" },
      // CShapes' Kuwait also reaches a few km past the zone's western edge (about 87 km2,
      // south of Kuwait's own border and west of the zone, i.e. Najd); once cut from Kuwait,
      // Saudi Arabia's edge is snapped to the zone so that wedge is not left unclaimed.
      { name: "Saudi Arabia", mode: "snap", trim: true },
    ],
    maxGapKm: 5,
    note: "the zone was shared territory until its partition took effect in December 1969",
  },
  {
    type: "fit",
    overlay: "Saudi-Iraqi Neutral Zone",
    neighbours: [
      { name: "Saudi Arabia", mode: "trim" },
      { name: "Kingdom of Iraq (British Mandate)", mode: "trim" },
      { name: "Kingdom of Iraq", mode: "trim" },
      { name: "Iraq", mode: "trim" },
    ],
    maxGapKm: 3,
    note: "the zone was shared territory until the 1981 partition treaty",
  },
  {
    type: "add",
    name: "Saudi-Iraqi Neutral Zone",
    start_year: 1922,
    end_year: 1981,
    status: "shared-sovereignty",
    geometry: "saudiIraqiNeutralZone",
    note:
      "The larger of the two zones the Uqair Protocol of 2 December 1922 left undivided, " +
      "created by the same logic as the Saudi-Kuwaiti one and defined in the same document: " +
      "\"The area delimited by the points enumerated above ... will remain neutral and " +
      "common to the two Governments of Iraq and Najd who will enjoy equal rights in it " +
      "for all purposes.\" Neither side could fortify the wells, and tribes of both watered " +
      "there freely; an agreement of 19 May 1938 set up its joint administration. Saudi " +
      "and Iraqi delegations agreed at Riyadh on 2 July 1975 to bisect it, the northern " +
      "half to Iraq and the southern to Saudi Arabia, and that division was carried out by " +
      "the International Frontier Treaty signed at Baghdad on 26 December 1981, in force " +
      "24 February 1982. The treaty was only registered with the UN in 1991, and the U.S. " +
      "State Department stopped drawing the zone on official maps in 1992. Geometry " +
      "digitized here as the straight-sided quadrilateral Uqair describes (the Wadi " +
      "al-Aujah/Al-Batin junction, the Al-Wuqubah wells, Bir Ansab and Al-Amghar), from " +
      "the coordinates the delimitation documents give for those points; see " +
      "scripts/extract-correction-geometry.js for each coordinate's source and for the " +
      "cross-checks it is verified against.",
    source: "https://treaties.un.org/doc/Publication/UNTS/volume%201638/english.pdf",
  },
];
