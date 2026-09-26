# Are the events we list biased? Dataset selection bias review

Scope: which events are on the map at all (selection bias), not how articles are worded. Everything below was
computed from the repository files (`data/events.json`, `data/event-candidates.json`, `data/enriched-candidates.json`,
`data/events.proposed.json`, `data/seed-events.json`, `scripts/discover-events.js`, `scripts/lib/event-classes.js`)
plus live Wikidata/Wikipedia queries run on 2026-09-26. Author: an AI model (see Limitations).

## Plain-language summary

**Yes, the selection is skewed, and the skew is mostly mechanical rather than a matter of whom we chose to include.**
The rule is published and applied uniformly, but each of its filters favours a particular kind of event. The
project's stated position ("any bias visible is Wikipedia's") is only partly true: several skews come from our own
filter design and one from our curated seed list.

Headline numbers:

1. **Funnel.** 2,539 raw Wikidata candidates -> 394 shown (15.5%). 639 have no English article, 1,365 more have
   fewer than 10 sitelinks, 195 more have no real coordinates, 5 have a Wikidata date error, 2 were removed as
   duplicates. 112 of the 394 are the hand-picked seed list, and 61 of those 112 are not reachable by the rule at all.
2. **The coordinates filter skews the most by theme.** It removes 41% of otherwise-qualifying discovered events
   (195 of 479), but only 6% of sieges and 8% of terrorist attacks versus 96% of wars, 91% of coups, 73% of
   rebellions, 78% of treaties, and 100% of referendums, genocides and revolutions. Result: **zero referendums,
   zero genocides and zero discovered revolutions on the map**, and a map that over-represents point-like events
   (attacks, battles, massacres).
3. **It removes high-casualty events.** Of 66 events with 100+ deaths recorded in Wikidata (P1120) among
   candidates with 10+ sitelinks, 46 are shown; **all 20 missing ones were dropped for lacking coordinates**
   (e.g. Gaza genocide 72,991; Dersim massacre 13,160; Yazidi genocide 5,000; 2014 Gaza War 2,205; 2026 Iran war
   4,859; WWI and WWII).
4. **The sitelinks rule favours events with many European-language editions.** Among events dropped for
   fewer than 10 sitelinks, 49% (669 of 1,365) have more Arabic/Hebrew/Turkish/Persian-family editions than
   European ones; among kept events only 5% (26 of 535). Arabic Wikipedia has an article for 79% of the
   dropped events (95% of kept), so "regional-language coverage exists but few translations" is the typical
   dropped event.
5. **It hits some countries harder.** Of English-article candidates, only 24% of Iraq-tagged and 27% of
   Syria-tagged events reach 10 sitelinks, versus 55-57% for Jordan/Qatar/Bahrain and 46% for Egypt/Iran.
   Iraq-tagged "terrorist attack" items pass at 5% (7 of 148), versus 25% for Turkey and 34% for Egypt.
6. **English-article requirement:** 46% of Israel/Palestine-tagged candidates (389 of 851) lack an English
   article (the next highest is Iran at 28%); 229 of all 639 have only an Arabic article and 158 only a Hebrew one.
   They would be dropped by the sitelinks rule anyway (498 of 639 have exactly 1 sitelink).
7. **Recall against an independent reference** (articles linked from 14 Wikipedia timeline/history pages, tagged to
   the 15 tracked countries, 10+ sitelinks, dated 1900+): **95 of 235 = 40%** are on the map. 45 were dropped only
   for coordinates, 1 for a date error, 94 never became candidates (elections 24, protests 10, attacks
   classified outside our class list 15, others). Lowest recall: Turkey 3/19, Iran 5/21; highest: Syria 11/19.
   Small numbers, see limits.
8. **Era:** 45% of shown events (178 of 394) date from 2000 on; 1950-1969 has 20. Retention from raw candidates is
   highest for the world-war decades (1910s 25%, 1940s 27%) and about 8-12% elsewhere. The recent-heavy shape comes mostly
   from how many items Wikidata holds for recent years (59% of raw candidates are 2000+), not from the sitelinks
   threshold, whose pass rate is actually lowest in the 2000s-2010s (18-21%).
9. **Our own hand:** the curated seed list (112 events) is the only source of diplomatic (8 of 8), economic
   (1 of 1) and 12 of 17 treaty events, and contains 2 terrorism events versus 57 from discovery. It also has
   80 events with only a capital-city fallback pin that are shown, while the same condition drops discovered
   events. Country scope itself (15 countries, Israel/Palestine merged into one tag) is a choice.

Bottom line: on the data available, no single "side" is systematically dropped by the rule (Israel/Palestine is 30% of
the raw candidates and 30% of the shown events). What is biased is the **type** of event (point-like violent
events over diplomatic, electoral and large-area ones), the **era** (recent), the **language footprint** (European
editions), and **English-language Wikipedia coverage**. Some of these affect countries unequally (Iraq, Syria, Yemen most
by sitelinks; Gulf states, Iran and Jordan most by coordinates).

---

## 1. Coverage of the 394 shown events

Country tags are Wikidata's (multi-country events count once per country, so columns do not sum to 394). 342 events have
one tag, 26 two, 4 three, 4 four, 18 five or more (mostly WWI/WWII-type items tagged with all 15 countries, which inflates
the small Gulf states).

| Country tag | Shown events | Of which seed | Coordinates fallback (approx) |
|---|---|---|---|
| Israel/Palestine | 120 | 36 | 28 |
| Turkey | 73 | 12 | 10 |
| Syria | 66 | 18 | 14 |
| Iraq | 64 | 20 | 15 |
| Egypt | 59 | 13 | 10 |
| Lebanon | 42 | 14 | 11 |
| Iran | 27 | 11 | 9 |
| Saudi Arabia | 14 | 8 | 6 |
| Jordan | 14 | 9 | 7 |
| Yemen | 10 | 5 | 5 |
| UAE | 4 | 1 | 1 |
| Kuwait / Bahrain | 3 / 3 | 1 / 1 | 1 / 1 |
| Qatar | 2 | 1 | 1 |
| Oman | 0 | 0 | 0 |
| "regional" (seed-only tag) | 11 | 11 | 6 |

Oman has no shown event even though 37 candidates exist (all but a few are multi-country world-war-type items or fail
the filters). Regions (my grouping: Levant = Israel/Palestine, Lebanon, Syria, Jordan; Gulf/Arabia = Saudi, Yemen, Kuwait,
Bahrain, Qatar, UAE, Oman): Levant 189, Turkey 73, Iraq 64, Egypt 59, Gulf/Arabia 31, Iran 27, none/regional 5.
Raw candidates were Levant 1,329, Iraq 455, Turkey 320, Gulf/Arabia 255, Egypt 204, Iran 178.

Decade (start date):

| Decade | 1900s | 1910s | 1920s | 1930s | 1940s | 1950s | 1960s | 1970s | 1980s | 1990s | 2000s | 2010s | 2020s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shown | 3 | 54 | 15 | 7 | 47 | 10 | 10 | 29 | 26 | 15 | 42 | 83 | 53 |

Class as shown to the user (Wikidata's own label for discovered events; seed events use the coarse group name):
battle 108, terrorist attack 54, massacre 52, war 37 (seed), political 36 (seed), military operation 27, treaty 17,
uprising 15, siege 12, assassination 10, diplomatic 8, rebellion 4, war crime 3, aircraft hijacking 3, migration 2,
terrorism 2, one each of economic, population transfer, declaration of independence, coup d'etat.

Deaths (Wikidata P1120), only where recorded: 141 of 394 shown events carry a value. Coverage depends on the class,
not the country: massacre 51/52, terrorist attack 52/54, but battle 2/108, treaty 0/17, siege 0/12. So death tolls cannot be
compared across countries or classes from this data. Where present, the median by country tag: Iraq 300 (18 events),
Syria 261 (8), Lebanon 102 (13), Turkey 37 (20), Egypt 46 (15), Iran 29 (12), Israel/Palestine 28 (48).

## 2. Funnel from raw candidates to shown events

Rule (from `docs/DATA_POLICY.md`): Wikidata class in a list of 23 classes; located (P17/P276/P131) in one of 15
tracked countries; dated 1900+; English article and 10+ sitelinks; real coordinates; valid dates and extract.

Overall:

| Stage | Removed | Remaining |
|---|---|---|
| Raw candidates (23 classes, 15 countries, 1900+) | | 2,539 |
| No English Wikipedia article (all also under 10 sitelinks) | 639 | 1,900 |
| English article but fewer than 10 sitelinks | 1,365 | 535 |
| Already curated (kept, shown) | (51 kept) | |
| No real coordinates (country-capital fallback only) | 195 | |
| Wikidata date order invalid | 5 | |
| Redirect duplicates (proposed-exclusions) | 2 | |
| Discovered events shown | | 282 + 51 curated = 333 |
| Plus seed events not found by discovery | | +61 = **394** |

By country tag (multi-country events counted in every country; "shown" here = discovered events shown, including the
51 already-curated, so it excludes the 61 seed-only events; retention = shown / raw):

| Country | Raw | No EN article | <10 sitelinks | No coords | Date err | Shown | Retention | Sitelinks pass rate (EN-article events) |
|---|---|---|---|---|---|---|---|---|
| Israel/Palestine | 851 | 389 | 307 | 50 | 0 | 103 | 12% | 34% |
| Iraq | 455 | 48 | 310 | 40 | 2 | 55 | 12% | 24% |
| Syria | 372 | 48 | 237 | 27 | 1 | 59 | 16% | 27% |
| Turkey | 320 | 43 | 165 | 45 | 1 | 66 | 21% | 40% |
| Egypt | 204 | 38 | 90 | 23 | 0 | 53 | 26% | 46% |
| Lebanon | 196 | 26 | 110 | 19 | 0 | 41 | 21% | 35% |
| Iran | 178 | 50 | 69 | 33 | 0 | 26 | 15% | 46% |
| Yemen | 126 | 20 | 74 | 18 | 0 | 14 | 11% | 30% |
| Saudi Arabia | 91 | 13 | 43 | 21 | 0 | 14 | 15% | 45% |
| Jordan | 68 | 17 | 23 | 13 | 0 | 14 | 21% | 55% |
| Kuwait | 47 | 5 | 22 | 11 | 1 | 8 | 17% | 48% |
| UAE | 47 | 6 | 22 | 11 | 0 | 8 | 17% | 46% |
| Oman | 37 | 6 | 15 | 11 | 0 | 5 | 14% | 52% |
| Qatar | 35 | 4 | 14 | 11 | 0 | 6 | 17% | 55% |
| Bahrain | 34 | 4 | 13 | 10 | 0 | 7 | 21% | 57% |

(Israel/Palestine shown = 103 plus 2 proposed-but-excluded duplicates.) Note the Gulf rows are dominated by multi-country
world-war items; their raw counts are small.

By decade:

| Decade | Raw | No EN | <10 sl | No coords | Shown | Retention |
|---|---|---|---|---|---|---|
| 1900s | 24 | 3 | 14 | 5 | 2 | 8% |
| 1910s | 174 | 17 | 96 | 17 | 44 | 25% |
| 1920s | 76 | 13 | 41 | 15 | 6 | 8% |
| 1930s | 29 | 7 | 13 | 6 | 3 | 10% |
| 1940s | 144 | 37 | 57 | 11 | 39 | 27% |
| 1950s | 57 | 23 | 24 | 4 | 6 | 11% |
| 1960s | 65 | 20 | 31 | 7 | 7 | 11% |
| 1970s | 168 | 50 | 80 | 13 | 25 | 15% |
| 1980s | 161 | 30 | 88 | 18 | 25 | 16% |
| 1990s | 131 | 30 | 77 | 11 | 13 | 10% |
| 2000s | 374 | 68 | 251 | 15 | 39 | 10% |
| 2010s | 617 | 95 | 412 | 31 | 76 | 12% |
| 2020s | 519 | 246 | 181 | 42 | 48 | 9% |

Sitelinks pass rate among English-article candidates by decade: 1900s 33%, 1910s 39%, 1920s 35%, 1930s 41%, 1940s 47%,
1950s 29%, 1960s 31%, 1970s 32%, 1980s 33%, 1990s 24%, 2000s 18%, 2010s 21%, 2020s 34%. So the rule does not favour recent
events; it is harshest on the 2000s-2010s (many low-sitelink Iraq/Syria items) and kindest to the world-war decades.
The era skew toward 2000+ therefore comes from how many items Wikidata holds for recent years (raw counts: 1,510 of 2,539
candidates are 2000 or later), not from the threshold. The 2020s have the most items without an English article
(246 of 519), mainly Hebrew-only and Arabic-only items.

Country tags: the funnel columns use Wikidata's tags from the candidate file. For the 51 already-curated events the tags
shown on the map are ours (curated) and differ from Wikidata's in 21 cases (e.g. Six-Day War: Wikidata tags 15 countries, the
map 4; Iran-Iraq War: 8 versus 2). That is why Oman has candidates marked "shown" in the table but no shown tag.

By coarse group (my table; groups from `event-classes.js`):

| Group | Raw | No EN | <10 sl | No coords | Shown |
|---|---|---|---|---|---|
| war | 1,015 | 160 | 576 | 97 | 177 |
| political | 699 | 280 | 299 | 44 | 76 |
| terrorism | 674 | 174 | 432 | 8 | 60 |
| uprising | 76 | 6 | 38 | 20 | 12 |
| treaty | 42 | 9 | 8 | 18 | 7 |
| migration | 21 | 6 | 9 | 3 | 3 |
| diplomatic | 10 | 3 | 2 | 5 | 0 |
| economic | 2 | 1 | 1 | 0 | 0 |

Coordinates filter by Wikidata class (share of qualifying, non-curated, date-valid events dropped; 479 events):
war 24/25 (96%), referendum 10/10, genocide 6/6, revolution 5/5, coup d'etat 10/11 (91%), treaty 18/23 (78%),
rebellion 19/26 (73%), military operation 54/88 (61%), war crime 8/19 (42%), battle 26/134 (19%), massacre 10/64 (16%),
assassination 2/12 (17%), terrorist attack 6/79 (8%), siege 1/18 (6%). By country the coordinates drop rate is Oman 100%,
Qatar 92%, Kuwait 85%, Bahrain 83%, UAE 79%, Saudi Arabia 78%, Yemen 78%, Jordan 68%, Iran 67%, Iraq 48%, Turkey 42%,
Lebanon 40%, Israel/Palestine 37%, Syria 36%, Egypt 33%. It does not favour high-sitelink events: median sitelinks of
dropped (15) equals that of retained (15).

The five date-error drops are Wikidata errors, not content choices: Iraqi invasion of Kuwait (start 2009-08-02, end
1990-08-04; 45 sitelinks), Third Battle of Fallujah, Palmyra offensive (May 2015), Second Battle of Inonu, First Battle of Tikrit.
Dropping the Iraqi invasion of Kuwait for a Wikidata typo is at odds with the "flags only" policy.

### Which filter skews most?

| Filter | Volume removed | Main skew |
|---|---|---|
| English article | 639 (25%) | Israel/Palestine 46%, Iran 28%; recent (2020s) items; 229 Arabic-only, 158 Hebrew-only |
| Sitelinks < 10 | 1,365 (54%) | Iraq/Syria/Yemen hardest; terrorist attacks, coups, rebellions, massacres; European-language coverage; earlier decades outside the world wars |
| Real coordinates | 195 (of the 535 passing the two above) | class/theme (abstract and large-area events), Gulf states, Iran, Jordan; removes highest death tolls |

The sitelinks rule removes the most events and skews by country and language; coordinates skews most by type of event.

## 3. Categories

How much of the category mix is Wikidata's and how much is ours:

- **Wikidata's:** which class an item carries. The same kind of act is typed differently in different places, e.g.
  Israel/Palestine shows 29 "massacre" and 9 "terrorist attack" labels among 120 shown events, while Turkey shows 14
  "terrorist attack" and 4 "massacre" of 73, Egypt 11 and 1 of 59, Iraq 5 and 8 of 64. Wikidata items may be both
  (227 of 2,539 candidates carry more than one class; 43 shown ones do). Discovery uses the first-matched class as
  `category`; for the 41 multi-class discovered events shown, all 41 carry the first class in `event-classes.js`
  order, e.g. "Haifa Oil Refinery massacre" is shown as "massacre", not "terrorist attack", and "King David Hotel
  bombing" as "terrorist attack" although it is also a "military operation". **That is an ordering choice of ours.**
  Suicide attacks (Dolphinarium, Passover massacre, Sbarro, Maxim restaurant) are typed "suicide attack" in Wikidata
  and, in my reference test, did not enter discovery at all, so the terrorism count depends on which Wikidata class
  path an editor used.
- **Terrorist-attack pass rate through the sitelinks filter** (items with that label, raw -> 10+ sitelinks):
  Israel/Palestine 296 -> 26 (9%), Iraq 148 -> 7 (5%), Syria 49 -> 3 (6%), Turkey 63 -> 16 (25%), Egypt 32 -> 11 (34%),
  Lebanon 26 -> 5 (19%), Iran 35 -> 6 (17%). Terrorism-labelled events are 27% of raw candidates but 15% of the events
  passing the sitelinks rule.
- **Group ratios in shown events** (terrorism-group : war-group): Turkey 14:44, Egypt 11:36, Israel/Palestine 10:54,
  Iraq 5:34, Syria 2:48 (war group here excludes "massacre", counted as political). The 2010s hold 29 of the 59 terrorism-group
  events (49%); 1990s 3, 1950s-60s 0.
- **Our own editorial choices in the pipeline** (stated plainly):
  1. The 23 event classes and the 15-country list (`scripts/lib/event-classes.js`) were chosen by us. Classes missing
     from the list (pogrom, suicide attack, airstrike, protest, election, disaster) exclude whole event types. The class
     list was tuned iteratively; two classes (embargo, nationalization) contribute nothing.
  2. `category_group` (war/political/terrorism/uprising/treaty/migration/diplomatic/economic) is a coarse mapping we wrote:
     e.g. massacre, genocide, war crime, assassination and coup are all "political" and referendum too; hostage taking and
     aircraft hijacking are "terrorism". It drives marker colour only, but a user reading colours sees our grouping.
  3. The order of the class list determines which label a multi-class event shows.
  4. The 10-sitelink threshold, English-article requirement and coordinates requirement (documented as judgement calls).
  5. **The seed list** (`data/seed-events.json`, 112 entries, chosen by the assistant and the owner earlier): the
     first 112 events shown. Its composition: 36 tagged Israel/Palestine, 20 Iraq, 18 Syria, 14 Lebanon, 13 Egypt, 12 Turkey,
     11 Iran, 11 "regional", 9 Jordan, 8 Saudi Arabia, 5 Yemen. 36 political, 36 war, 15 uprising, 12 treaty, 8 diplomatic,
     2 terrorism. It includes non-events: people and organisations such as Hafez al-Assad, Saddam Hussein, Hamas,
     Palestine Liberation Organization, Islamic State, Kingdom of Iraq. 61 of the 112 never appear in discovery. It has no
     entry from Oman and only single entries for Kuwait, Qatar, UAE and Bahrain. It also holds the only diplomatic and
     economic events, so the "diplomatic" category is 100% our selection.
  6. Asymmetry: 80 seed events shown with a capital-city fallback pin ("approximate") versus 195 discovered events dropped
     for the same condition.

## 4. Independent reference: recall

**Reference built:** all English Wikipedia articles linked from 14 pages: Timeline of Middle Eastern history; History of the
Arab-Israeli conflict (redirect target of "Timeline of the Arab-Israeli conflict"); Timeline of the Israeli-Palestinian
conflict; Timeline of Israeli history; Timeline of Iranian history; Timeline of Anatolian history; Timeline of Lebanese history;
Timeline of Syrian history; Timeline of Yemeni history; Timeline of the Arab Spring; Timeline of the Iraq War; Timeline of
the Gulf War (1990-1991); History of Egypt; History of the Kurds. 5,818 linked articles resolved to Wikidata items; 1,238
have a point-in-time (P585) or start time (P580) in 1900 or later. Of these 874 have P17 in a tracked country (232 have no P17,
132 have only other countries). I did not test for occurrence class (the transitive class query timed out on WDQS), so
"has a date" is the event proxy. Recall figures use tracked-country items with 10+ sitelinks (comparable with our rule):

| Outcome (235 items) | Count | Share |
|---|---|---|
| Shown | 95 | 40% |
| Candidate, dropped for coordinates | 45 | 19% |
| Candidate, dropped for Wikidata date error | 1 | 0.4% |
| Never a candidate | 94 | 40% |

Including items under 10 sitelinks the tracked-country total is 874 with 95 shown (11%): 168 candidate but under 10 sitelinks,
565 never candidates.

Recall by theme (my regex-based labelling of Wikidata class labels plus titles; imperfect): military/political conflict 48/98,
attack/violence 28/47, other 13/42, protest 5/15, accident/disaster 1/5, **election/government 0/24, pandemic/disease 0/4**.
The 94 never-candidate items: elections/governments 24, other 20 (e.g. Israeli settlement, West Bank barrier, Israeli pound),
military/political 17 (e.g. Operation Opera, Shayrat missile strike, Highway of Death, Israeli occupation of the West Bank,
Israeli invasion of Syria), attacks 15 (Dolphinarium bombing, Passover massacre, Istanbul pogrom, 1929 Hebron massacre, Khan
Shaykhun chemical attack), protests 10 (Gezi Park, Death of Mahsa Amini, 17 October Revolution in Lebanon), pandemics 4,
disasters 4 (Meron crowd crush). These are not stated as the confirmed reason for each; the class inference is from labels.

By country tag (tracked, 10+ sitelinks; multi-country items counted per tag; small n): Israel/Palestine 31/76 (41%), Iraq 24/53
(45%), Lebanon 13/29 (45%), Egypt 8/21 (38%), Iran 5/21 (24%), Turkey 3/19 (16%), Syria 11/19 (58%), Yemen 4/11, Kuwait 1/7,
Jordan 3/4, others 0-2. Losses in Iraq (18 of 29 missing are coordinates) and Turkey (7 coordinates, 9 never candidates)
differ from Iran (4 coordinates, 12 never candidates: elections, protests, incidents). By page: Arab-Israeli 24/51,
Israeli-Palestinian 30/63, Iraq War 23/48, Arab Spring 12/23, Middle Eastern history 20/30, Egypt 10/18, Lebanese 8/17,
Turkey/Anatolia 4/17, Iran 4/16, Gulf War 4/16, Kurds 2/9, Yemen 2/7, Syria 2/6. By decade: 1970s 12/15, 2000s 25/55, 2020s
12/28, 2010s 18/59, 1990s 8/27, 1980s 7/16, 1920s-60s 11/33.

Does the missing set cluster by side? On this reference, the Israel/Palestine share of the reference (76 of 235, 32%) and of
what we show (30%) are about equal, and recall for Israel/Palestine (41%) and Iraq (45%) is similar. The clustering is by
theme (elections, protests, treaties and large-area military operations missing) and by countries with fewer or less
point-like events (Turkey, Iran). Events involving Israel as the actor that fall into "airstrike/raid/occupation" classes
(Operation Opera, 1968 Beirut raid, Israeli invasion of Syria) and Palestinian/Arab attacks typed "suicide attack" (Dolphinarium,
Sbarro, Maxim, Passover) are both missing; whether that balances is not something the data here can settle and I did not code
actors.

**Limits of the reference:** built from 14 pages I chose (three are Israel-centred, which tilts it; only one page each for Iran,
Syria, Yemen, none for Iraq history other than the war page, Saudi Arabia or the smaller Gulf states); linked articles are
whatever editors of those pages linked; 4 Iraq-War-related pages are event-dense; the reference includes items with dubious
"event" status (a currency, an organisation); English Wikipedia timeline editors share the same Western/English bias as the
sitelinks rule, so recall against it measures agreement with English Wikipedia, not completeness against reality.

## 5. Language-region skew of the sitelinks rule

Sitelinks in `wbgetentities` count all Wikimedia projects (Commons, Wikiquote and others), not only Wikipedia editions as
`DATA_POLICY.md` says ("10 Wikipedia language editions"): 29 candidates have 10+ sitelinks but fewer than 10 Wikipedia
editions; none the other way. Minor, but the doc and code disagree.

Full population (all 2,539 candidates, sitelinks fetched from Wikidata today). "Regional" = Arabic (ar, arz, ary), Persian
family (fa, azb, mzn, glk), Hebrew, Turkish, Kurdish (ku, ckb), Pashto, Urdu, Azerbaijani; "European" = 47 European-language
editions (my lists):

| Sitelinks band | Events | ar | he | tr | fa | Mean regional editions | Mean European editions (excl. en) |
|---|---|---|---|---|---|---|---|
| 10+ | 535 | 95% | 62% | 63% | 76% | 4.5 | 11.2 |
| 5-9 | 627 | 91% | 30% | 28% | 38% | 2.2 | 2.4 |
| under 5 | 1,377 | 57% | 22% | 8% | 8% | 1.0 | 0.35 |

Presence by language among dropped (1,365) versus kept events: ar 79%/95%, he 22%/62%, tr 18%/63%, fa 25%/76%, de 8%/61%,
fr 27%/87%, es 22%/77%, ru 14%/82%. So the kept set differs most in German/French/Spanish/Russian coverage, not Arabic.
Among dropped events, 245 have 3+ regional-language editions (mean 1.8 European ones; 114 of them have at most 1 European
edition): concrete examples of well-covered-locally, thinly-translated events. Dropped-by-country (events with an English
article): Iraq 310 (272 with Arabic), Israel/Palestine 307 (239 Arabic, 202 Hebrew), Syria 237 (215 Arabic), Turkey 165 (119
Turkish), Egypt 90, Lebanon 110, Iran 69 (51 Persian), Yemen 74 (71 Arabic).

The requested 30-event sample (deterministic: first 10 by hash of QID within each band, English-article candidates only):

| Band | Events | Arabic | Hebrew | Turkish | Persian | Mean regional | Mean European (no en) |
|---|---|---|---|---|---|---|---|
| 10+ | 10 | 10 | 9 | 8 | 10 | 7.9 | 19.6 |
| 5-9 | 10 | 10 | 6 | 2 | 3 | 2.1 | 2.6 |
| under 5 | 10 | 3 | 2 | 1 | 1 | 0.8 | 0.5 |

Sample titles include, 10+: World War I, World War II, Gaza genocide, 2024 Kerman bombings, Killing of Hind Rajab; 5-9: 2022
Beersheba attack, Abu Shusha massacre, Battle of Jabalia, 2026 Damascus bombings, Imam Reza Shrine stabbings; under 5: Buratha
mosque bombing, Assassination of Bachir Gemayel, Capture of Erzurum (1918), Irgun bombing of police headquarters in Haifa,
Vartinis massacre. The sample is small and includes two world wars, so the population table above is the reliable one.

## 6. Recommendations (objective rules preferred)

| # | Option | Effect measured here | Trade-off |
|---|---|---|---|
| 1 | Publish the funnel on an "About the data" page (this doc's tables, regenerated by script each run) | Zero selection change; makes every skew above visible | Exposes the rule's weaknesses; needs a maintained script |
| 2 | Apply the curated events' approximate-location rule to discovered events: show events without real coordinates as "approximate" (country-level pin, excluded from area search) instead of dropping | Adds 195 events (26 with 30+ sitelinks, incl. Gaza genocide, Iraq War, 2014 Gaza War, 2016 coup attempt, 2026 Iran war, Dersim massacre); restores all 20 missing 100+-death events; brings referendums, genocides, revolutions and treaties in; removes the seed/discovery asymmetry | Capital-city pins mislead if not clearly labelled; map clutter around capitals; some approximate pins mislocate |
| 3 | Do not drop events for a Wikidata date-order error; show and flag (same as other flags) | Recovers 5 events incl. the Iraqi invasion of Kuwait | Displays a wrong or ambiguous date, flagged |
| 4 | Language-aware significance: keep `sitelinks >= 10`, add `OR >= 3 editions in a fixed regional set` | R2 in my simulation adds 245 candidates (535 -> 780 before coordinates) mostly Iraq (+50), Israel/Palestine (+56), Syria (+41), Turkey (+30); Israel/Palestine share moves from 29% to 27% | The language set is itself a choice; may add low-notability items; requires publishing the list |
| 5 | Country-relative threshold (e.g. top N% of sitelinks within each tagged country) instead of a fixed 10 | Removes the country skew of a fixed cutoff mechanically without picking languages | Small countries get low-sitelink items; N is still a choice |
| 6 | Lower the threshold to 5 and rank/zoom by sitelinks in the UI | 535 -> 1,160 candidates; terror-labelled share 15% -> 20%; Levant share of shown 45% -> 48% | Doubles the volume; more low-quality items; review load |
| 7 | Add classes objectively: replace the class list with "any item with P585/P580 and P17 in region and 15+ sitelinks", instead of curating classes (needs non-transitive queries because the transitive occurrence query timed out) | Would add elections, protests, airstrikes, suicide attacks (24 election, 10 protest, 15 attack items in the reference alone) | Adds items that are arguably not "events of confrontation" (pandemics, currencies); needs a scope decision |
| 8 | Report Wikidata errors upstream (dates, missing P625 via `data/missing-coordinates-report.md`) | Closes gaps at source | Slow; not in our control |

Options 1 to 3 need no new judgement calls; 4 to 7 shift bias rather than remove it and should be published with their
parameters. I recommend 1, 2 and 3 first.

## 7. Limitations and honesty

- I am a model with my own biases. My groupings (regions, "regional" versus "European" language sets, reference themes) are
  my choices, made without the owner; other groupings would give different numbers. The theme labels in section 4 come from
  keyword rules on class labels and titles and were not checked item by item.
- Only countable, checkable dimensions: I did not code who is actor or victim, side, or article wording.
- Multi-country events are counted once per tag, so country totals overlap; world-war items are tagged with all 15 countries.
- Sitelinks and language lists are from Wikidata today (2026-09-26); the candidate file's sitelink counts are from the
  discovery run and can differ slightly (shown events currently satisfy 10+ except one seed item: Ottoman entry into World War I, 8).
- The candidate universe is only what the discovery query finds: events whose location is not reachable in one hop from
  P17/P276/P131 to a tracked country, or with a class outside the list, are invisible, and I can measure them only via the
  reference. My reference has its own bias (it agrees with English Wikipedia); the 40% recall is an estimate with
  wide uncertainty, sensitive to which pages I chose.
- Death counts (P1120) are sparse and class-dependent (141 of 394); casualty comparisons are not supported.
- Not verified: the reason each of the 94 never-candidate items is absent (I inferred from class labels; I did not
  re-query them); whether the class-less "suicide attack" items are outside `terrorist attack` in Wikidata's hierarchy
  (I inferred from their absence in the candidates file); the 61 seed events not found by discovery were not individually
  checked for why. The relaxed-rule simulations count candidates before the coordinates step (those events were not
  enriched), so actual additions would be smaller.
- Era effects mix real history (more events, more editors) with pipeline effects; I cannot separate them.
- Country scope (15 states, Israel/Palestine as a single merged tag, no Libya, Sudan, Cyprus, Caucasus, Afghanistan, Maghreb)
  is a choice made before this analysis and is not tested here.
