# Suggested Wikidata coordinates (P625) for events middleeast.events cannot pin

**DRAFT: FOR HUMAN REVIEW BEFORE SUBMITTING.** Nothing here has been submitted anywhere. middleeast.events never edits Wikipedia or
Wikidata and never invents coordinates (see [DATA_POLICY.md](DATA_POLICY.md)). Every coordinate below is copied from an existing
Wikidata place item (its own P625), fetched on 2026-09-26, and cross-checked against the English Wikipedia article's coordinates for
that place. The companion file is `data/wikidata-coordinate-suggestions.tsv` (QuickStatements V1).

Input: `data/missing-coordinates-report.md` (277 rows = 83 curated + 195 candidates; the Islamic State item Q2429253 appears twice, so 277 distinct items). All 277 items were re-fetched from Wikidata and none currently has a P625.

## What Wikidata guidance says (and does not say)

- Property [P625](https://www.wikidata.org/wiki/Property:P625), "coordinate location": description "geocoordinates of the subject. For Earth, please note that only the WGS84 geodetic datum is currently supported". Its conflict constraint says it should not be used on items that are instances of human, company, railway or organization (also names, categories, lists, disambiguation pages, templates). **Events are not excluded**, so persons/organisations in the report are definitely out, but nothing on the property page says events *should* have P625.
- Property [P276](https://www.wikidata.org/wiki/Property:P276), "location": "Location of the object, structure or event; use P131 to indicate the containing administrative entity ... P625 for coordinate locations". So the *conventional* way to say where an event happened is P276 (an item), and P625 is a precise point.
- [Help:Data type](https://www.wikidata.org/wiki/Help:Data_type) (coordinates): a precision parameter "describes the resolution of the source of the coordinate"; globe defaults to Earth.
- I did **not** find a Wikidata rule specifically saying "give wars / multi-site events a P625" or forbidding it. **Guidance for events is unclear**; in practice many battles, bombings and treaties have P625 and wars/referendums usually do not. The triage below is therefore my judgement, not a Wikidata rule. Ask on a community page (e.g. [Wikidata:Project chat](https://www.wikidata.org/wiki/Wikidata:Project_chat)) if unsure.

## Triage

| Class | Items |
|---|---|
| SITE-SPECIFIC with a sourced proposal (in the TSV) | 50 |
| SITE-SPECIFIC-looking but skipped (no clean sourced point, see below) | 20 |
| NOT-A-POINT: military operation / campaign / offensive (area, not point) | 58 |
| NOT-A-POINT: war / civil war / conflict | 40 |
| NOT-A-POINT: revolution / uprising / protest / insurgency (national scale) | 29 |
| NOT-A-POINT: other abstract (crisis, policy, period, history) | 21 |
| NOT-A-POINT: genocide / mass violence / displacement (regional) | 16 |
| NOT-A-POINT: coup / revolution in a capital or nationwide (borderline, deliberately skipped) | 16 |
| NOT-A-POINT: referendum | 10 |
| NOT-A-POINT: organisation | 6 |
| NOT-A-POINT: treaty / agreement / document without a fetched place | 4 |
| NOT-A-POINT: ceasefire/armistice (no site) | 4 |
| NOT-A-POINT: person | 2 |
| NOT-A-POINT: coup d'etat | 1 |
| **Total rows** | 277 |

Definitions: SITE-SPECIFIC = a battle, siege, bombing, massacre, execution or treaty/armistice signing tied to one named place. NOT-A-POINT = persons, organisations, wars and campaigns spanning regions, national revolutions/protests/insurgencies, referendums, ceasefires, and abstract agreements/policies. Coups and revolutions that happened in a capital are "borderline"; I skipped them rather than guess a scale.

## Proposed coordinates (50)

The coordinate is the **place's** existing P625, not a location of the event itself. For treaties and city-level events it is therefore only a "nearest place" point; that is stated in the confidence column. The last column is the distance in km between Wikidata's and English Wikipedia's coordinates for that place (sanity check, max 7.35 km).

| # | Event QID | Event | Date (report) | Place used (QID) | Lat | Lon | Confidence | WD vs WP km |
|---|---|---|---|---|---|---|---|---|
| 1 | [Q193258](https://www.wikidata.org/wiki/Q193258) | Treaty of Lausanne | 1923-07-24 | Lausanne ([Q807](https://www.wikidata.org/wiki/Q807)) | 46.533333 | 6.633333 | nearest town (city centroid; treaty signed in Lausanne) | 1.48 |
| 2 | [Q182515](https://www.wikidata.org/wiki/Q182515) | Treaty of Sèvres | 1920-08-10 | Sèvres ([Q206493](https://www.wikidata.org/wiki/Q206493)) | 48.823056 | 2.210833 | nearest town (commune centroid; signed at Sevres) | 0.11 |
| 3 | [Q309204](https://www.wikidata.org/wiki/Q309204) | Camp David Accords | 1978-09-17 | Camp David ([Q309202](https://www.wikidata.org/wiki/Q309202)) | 39.648333 | -77.463611 | exact site (Camp David retreat, where negotiated; signing was at the White House) | 0.12 |
| 4 | [Q99495661](https://www.wikidata.org/wiki/Q99495661) | Abraham Accords | 2020-09-15 | Washington, D.C. ([Q61](https://www.wikidata.org/wiki/Q61)) | 38.895 | -77.036667 | nearest town (Washington, D.C. centroid; ceremony at the White House) | 2.06 |
| 5 | [Q1129412](https://www.wikidata.org/wiki/Q1129412) | Egypt–Israel peace treaty | 1979-03-26 | White House ([Q35525](https://www.wikidata.org/wiki/Q35525)) | 38.897778 | -77.036667 | exact site (White House, signing venue) | 0.02 |
| 6 | [Q620988](https://www.wikidata.org/wiki/Q620988) | Israel–Jordan peace treaty | 1994-10-26 | Wadi Araba Crossing ([Q2559756](https://www.wikidata.org/wiki/Q2559756)) | 29.575 | 34.978056 | exact site (Wadi Araba border crossing, signing venue) | 0.00 |
| 7 | [Q1193136](https://www.wikidata.org/wiki/Q1193136) | Execution of Saddam Hussein | 2006-12-30 | Camp Justice ([Q5027295](https://www.wikidata.org/wiki/Q5027295)) | 33.382 | 44.353 | exact site (Camp Justice, Kadhimiya; Wikidata P276 also lists Kadhimiya) | 0.00 |
| 8 | [Q107354956](https://www.wikidata.org/wiki/Q107354956) | United States–Taliban deal | 2020-02-29 | Doha ([Q3861](https://www.wikidata.org/wiki/Q3861)) | 25.286111 | 51.529444 | nearest town (Doha centroid) | 0.40 |
| 9 | [Q113295397](https://www.wikidata.org/wiki/Q113295397) | Black Sea Grain Initiative | 2022-07-22 | Dolmabahçe Palace ([Q274141](https://www.wikidata.org/wiki/Q274141)) | 41.039444 | 29.001667 | exact site (Dolmabahce Palace, Istanbul; P276 also lists Istanbul) | 0.00 |
| 10 | [Q805061](https://www.wikidata.org/wiki/Q805061) | Balkan Pact (1953) | 1953-02-28 | Ankara ([Q3640](https://www.wikidata.org/wiki/Q3640)) | 39.93576 | 32.83869 | nearest town (Ankara centroid) | 1.57 |
| 11 | [Q2358950](https://www.wikidata.org/wiki/Q2358950) | Treaty of Ankara (1921) | 1921-10-20 | Ankara ([Q3640](https://www.wikidata.org/wiki/Q3640)) | 39.93576 | 32.83869 | nearest town (Ankara centroid) | 1.57 |
| 12 | [Q269606](https://www.wikidata.org/wiki/Q269606) | Treaty of Constantinople (1913) | 1913-09-29 | Constantinople ([Q16869](https://www.wikidata.org/wiki/Q16869)) | 41.01224 | 28.976018 | nearest town (Constantinople/Istanbul historic centroid) | 0.34 |
| 13 | [Q537143](https://www.wikidata.org/wiki/Q537143) | Treaty of Saadabad | 1937-07-08 | Tehran ([Q3616](https://www.wikidata.org/wiki/Q3616)) | 35.688889 | 51.389722 | nearest town (Tehran centroid; signed at Saadabad Palace, Tehran) | 0.00 |
| 14 | [Q28048694](https://www.wikidata.org/wiki/Q28048694) | Armistice of Erzincan | 1917-12-18 | Erzincan ([Q136217](https://www.wikidata.org/wiki/Q136217)) | 39.746389 | 39.491389 | nearest town (Erzincan centroid) | 0.00 |
| 15 | [Q136486580](https://www.wikidata.org/wiki/Q136486580) | Gaza peace summit | 2025-10-13 | Sharm el-Sheikh ([Q644](https://www.wikidata.org/wiki/Q644)) | 27.851944 | 34.305 | nearest town (Sharm el-Sheikh centroid) | 7.35 |
| 16 | [Q745136](https://www.wikidata.org/wiki/Q745136) | Ankara Agreement | 1963-09-12 | Ankara ([Q3640](https://www.wikidata.org/wiki/Q3640)) | 39.93576 | 32.83869 | nearest town (Ankara centroid) | 1.57 |
| 17 | [Q17035545](https://www.wikidata.org/wiki/Q17035545) | Treaty of Jeddah (1927) | 1927-01-01 | Jeddah ([Q374365](https://www.wikidata.org/wiki/Q374365)) | 21.529167 | 39.161111 | nearest town (Jeddah centroid) | 1.98 |
| 18 | [Q7837031](https://www.wikidata.org/wiki/Q7837031) | Treaty of Darin | 1915-12-26 | Tarout Island ([Q3134340](https://www.wikidata.org/wiki/Q3134340)) | 26.566667 | 50.066667 | approximate (Tarout Island; Darin is on it) | 1.17 |
| 19 | [Q94635](https://www.wikidata.org/wiki/Q94635) | Uqair Protocol of 1922 | 1922-12-02 | Uqair ([Q3546517](https://www.wikidata.org/wiki/Q3546517)) | 25.6431 | 50.2144 | exact site (Uqair) | 0.13 |
| 20 | [Q3686593](https://www.wikidata.org/wiki/Q3686593) | Trebizond Peace Conference | 1918-03-12 | Trabzon ([Q45301](https://www.wikidata.org/wiki/Q45301)) | 41.005 | 39.7225 | nearest town (Trabzon centroid) | 0.00 |
| 21 | [Q20512994](https://www.wikidata.org/wiki/Q20512994) | Zurich Protocols | 2009-10-10 | Zurich ([Q72](https://www.wikidata.org/wiki/Q72)) | 47.374444 | 8.541111 | nearest town (Zurich centroid; Wikipedia: signed in Zurich) | 0.00 |
| 22 | [Q1899132](https://www.wikidata.org/wiki/Q1899132) | Black Friday (1978) | 1978-09-08 | Tehran ([Q3616](https://www.wikidata.org/wiki/Q3616)) | 35.688889 | 51.389722 | approximate (Tehran centroid; the massacre was at Jaleh Square) | 0.00 |
| 23 | [Q122972407](https://www.wikidata.org/wiki/Q122972407) | Battle of Sderot | 2023-10-07 | Sderot ([Q123196](https://www.wikidata.org/wiki/Q123196)) | 31.525 | 34.596944 | nearest town (Sderot centroid) | 0.29 |
| 24 | [Q2081944](https://www.wikidata.org/wiki/Q2081944) | Battle of Aqaba | 1917-07-06 | Aqaba ([Q180522](https://www.wikidata.org/wiki/Q180522)) | 29.532222 | 35.006111 | nearest town (Aqaba centroid) | 0.06 |
| 25 | [Q122971969](https://www.wikidata.org/wiki/Q122971969) | Battle of Re'im | 2023-10-07 | Re'im ([Q2916652](https://www.wikidata.org/wiki/Q2916652)) | 31.386097 | 34.460297 | exact site (Re'im kibbutz) | 0.00 |
| 26 | [Q2089020](https://www.wikidata.org/wiki/Q2089020) | Battle of Mecca (1916) | 1916-06-10 | Mecca ([Q5806](https://www.wikidata.org/wiki/Q5806)) | 21.4225 | 39.826111 | nearest town (Mecca centroid) | 0.29 |
| 27 | [Q2445317](https://www.wikidata.org/wiki/Q2445317) | Battle of Dumlupınar | 1922-08-26 | Dumlupınar ([Q3041195](https://www.wikidata.org/wiki/Q3041195)) | 38.854364 | 29.977641 | nearest town (Dumlupinar village) | 1.07 |
| 28 | [Q3845560](https://www.wikidata.org/wiki/Q3845560) | Attempted assassination of Abdul Hamid II | 1905-06-21 | Yıldız Hamidi Mosque ([Q1573438](https://www.wikidata.org/wiki/Q1573438)) | 41.049411 | 29.009936 | exact site (Yildiz Hamidiye Mosque) | 0.00 |
| 29 | [Q126416493](https://www.wikidata.org/wiki/Q126416493) | Nuseirat rescue and massacre | 2024-06-08 | Nuseirat Camp ([Q2918829](https://www.wikidata.org/wiki/Q2918829)) | 31.45 | 34.391694 | approximate (Nuseirat refugee camp centroid) | 0.30 |
| 30 | [Q77513637](https://www.wikidata.org/wiki/Q77513637) | Mahshahr massacre | 2019-11-20 | Mahshahr ([Q605244](https://www.wikidata.org/wiki/Q605244)) | 30.556667 | 49.188611 | nearest town (Mahshahr centroid) | 0.11 |
| 31 | [Q123907413](https://www.wikidata.org/wiki/Q123907413) | Kidnapping and killing of the Bibas family | 2023-10-07 | Nir Oz ([Q1011560](https://www.wikidata.org/wiki/Q1011560)) | 31.310197 | 34.402097 | nearest town (Nir Oz kibbutz) | 0.01 |
| 32 | [Q12813016](https://www.wikidata.org/wiki/Q12813016) | Turkish capture of Smyrna | 1922-09-09 | İzmir ([Q35997](https://www.wikidata.org/wiki/Q35997)) | 38.41273 | 27.13838 | nearest town (Izmir centroid) | 1.41 |
| 33 | [Q7509962](https://www.wikidata.org/wiki/Q7509962) | 1920 capture of Damascus | 1920-07-24 | Damascus ([Q3766](https://www.wikidata.org/wiki/Q3766)) | 33.513056 | 36.291944 | nearest town (Damascus centroid) | 1.62 |
| 34 | [Q2096206](https://www.wikidata.org/wiki/Q2096206) | Maraş massacre | 1978-12-01 | Kahramanmaraş ([Q134703](https://www.wikidata.org/wiki/Q134703)) | 37.5875 | 36.945278 | nearest town (Kahramanmaras centroid) | 1.15 |
| 35 | [Q12203911](https://www.wikidata.org/wiki/Q12203911) | 1959 Mosul uprising | 1959-03-11 | Mosul ([Q83317](https://www.wikidata.org/wiki/Q83317)) | 36.341667 | 43.129167 | nearest town (Mosul centroid; uprising in the city) | 0.00 |
| 36 | [Q3629102](https://www.wikidata.org/wiki/Q3629102) | 2003 Nasiriyah bombing | 2003-11-12 | Nasiriyah ([Q38811](https://www.wikidata.org/wiki/Q38811)) | 31.043889 | 46.2575 | nearest town (Nasiriyah centroid) | 0.00 |
| 37 | [Q3296462](https://www.wikidata.org/wiki/Q3296462) | British Airways Flight 149 | 1990-08-02 | Kuwait International Airport ([Q527157](https://www.wikidata.org/wiki/Q527157)) | 29.226778 | 47.979972 | exact site (Kuwait International Airport) | 0.01 |
| 38 | [Q4872527](https://www.wikidata.org/wiki/Q4872527) | Battle of Tel Hai | 1920-03-01 | Tel Hai ([Q2094886](https://www.wikidata.org/wiki/Q2094886)) | 33.235 | 35.578333 | exact site (Tel Hai) | 0.00 |
| 39 | [Q4178089](https://www.wikidata.org/wiki/Q4178089) | Battle of Karbala (2003) | 2003-03-23 | Karbala ([Q199909](https://www.wikidata.org/wiki/Q199909)) | 32.616667 | 44.033333 | nearest town (Karbala centroid) | 0.00 |
| 40 | [Q4087318](https://www.wikidata.org/wiki/Q4087318) | Battle of Samarra (2004) | 2004-10-01 | Samarra ([Q170047](https://www.wikidata.org/wiki/Q170047)) | 34.1959 | 43.88568 | nearest town (Samarra centroid) | 1.09 |
| 41 | [Q2943187](https://www.wikidata.org/wiki/Q2943187) | Battle of Riyadh | 1902-01-13 | Riyadh ([Q3692](https://www.wikidata.org/wiki/Q3692)) | 24.65 | 46.71 | nearest town (Riyadh centroid) | 1.97 |
| 42 | [Q5936879](https://www.wikidata.org/wiki/Q5936879) | 1981 Iranian Prime Minister's office bombing | 1981-01-01 | Tehran ([Q3616](https://www.wikidata.org/wiki/Q3616)) | 35.688889 | 51.389722 | approximate (Tehran centroid; bomb at PM office) | 0.00 |
| 43 | [Q5638475](https://www.wikidata.org/wiki/Q5638475) | Haft-e Tir bombing | 1981-06-28 | Tehran ([Q3616](https://www.wikidata.org/wiki/Q3616)) | 35.688889 | 51.389722 | approximate (Tehran centroid; bomb at IRP headquarters) | 0.00 |
| 44 | [Q137757212](https://www.wikidata.org/wiki/Q137757212) | Fall of Aden (2026) | 2026-01-07 | Aden ([Q131694](https://www.wikidata.org/wiki/Q131694)) | 12.8 | 45.033333 | nearest town (Aden centroid) | 0.00 |
| 45 | [Q130331542](https://www.wikidata.org/wiki/Q130331542) | 20 September 2024 Beirut attack | 2024-09-20 | Haret Hreik ([Q915829](https://www.wikidata.org/wiki/Q915829)) | 33.85 | 35.516667 | nearest town (Haret Hreik, Beirut suburb) | 0.00 |
| 46 | [Q7711827](https://www.wikidata.org/wiki/Q7711827) | 20 Hunchakian gallows | 1915-06-15 | Beyazıt Square ([Q6043077](https://www.wikidata.org/wiki/Q6043077)) | 41.010519 | 28.9677 | exact site (Beyazit Square) | n/a |
| 47 | [Q11161771](https://www.wikidata.org/wiki/Q11161771) | Goharshad Mosque rebellion | 1935-08-01 | Goharshad Mosque ([Q2393680](https://www.wikidata.org/wiki/Q2393680)) | 36.2875 | 59.614722 | exact site (Goharshad Mosque) | 0.00 |
| 48 | [Q136001786](https://www.wikidata.org/wiki/Q136001786) | August 2025 Israeli attack on Sanaa | 2025-08-28 | Sanaa ([Q2471](https://www.wikidata.org/wiki/Q2471)) | 15.35 | 44.2 | nearest town (Sanaa centroid) | 0.71 |
| 49 | [Q27894014](https://www.wikidata.org/wiki/Q27894014) | Aleppo offensive (November–December 2016) | 2016-11-15 | Aleppo ([Q41183](https://www.wikidata.org/wiki/Q41183)) | 36.2 | 37.16 | nearest town (Aleppo centroid; city battle) | 0.00 |
| 50 | [Q4809060](https://www.wikidata.org/wiki/Q4809060) | Menemen massacre | 1916-06-16 | Menemen ([Q2152404](https://www.wikidata.org/wiki/Q2152404)) | 38.603611 | 27.078056 | nearest town (Menemen; Wikipedia: massacre in the town of Menemen) | 1.07 |

## Skipped although they looked site-specific

- [Q17013132](https://www.wikidata.org/wiki/Q17013132) Oslo Accords: Wikidata P276 says Oslo (where negotiated) but the accords were signed in Washington, D.C.; ambiguous, no single agreed place fetched.
- [Q2665637](https://www.wikidata.org/wiki/Q2665637) Fall of Baghdad (1917): Wikipedia infobox says "Diyala River, just below Baghdad"; Wikidata P276 is the whole Diyala River (centroid ~100 km from the fighting). No good point found.
- [Q2359563](https://www.wikidata.org/wiki/Q2359563) Tel al-Zaatar massacre: the camp's Wikidata item (Q12241544) and the article both lack coordinates; nothing to source.
- [Q660521](https://www.wikidata.org/wiki/Q660521) Reparations Agreement: Wikidata P276 is the country Luxembourg (country-level coordinate); the city was not confirmed from a fetched source.
- [Q261982](https://www.wikidata.org/wiki/Q261982) German-Ottoman alliance: Wikidata P276 says Constantinople but the English Wikipedia article names no signing place (fetched); unverified.
- [Q2045629](https://www.wikidata.org/wiki/Q2045629) Aeroflot Flight 244: Wikidata P276 = Sinop Airport, which I could not confirm from a fetched source; a hijacking with a moving aircraft is not a clean point.
- [Q594015](https://www.wikidata.org/wiki/Q594015) Battle of the Sakarya: fought along a ~100 km river front; the river item's centroid is not the battle site.
- [Q2916279](https://www.wikidata.org/wiki/Q2916279) Battle for Jerusalem (1947-48): multi-week fighting across the city and its approaches.
- [Q3636553](https://www.wikidata.org/wiki/Q3636553) Battle of Norfolk: Wikidata P276 is a whole governorate (Al Muthanna).
- [Q722990](https://www.wikidata.org/wiki/Q722990) 2004 Ashura massacre: bombings in Karbala and Baghdad on the same day (multi-site).
- [Q21190910](https://www.wikidata.org/wiki/Q21190910) Yazidi genocide: campaign across the Sinjar region and beyond, not one site.
- [Q187152](https://www.wikidata.org/wiki/Q187152) Balfour Declaration: a letter/document issued in London; no place statement fetched.
- [Q211674](https://www.wikidata.org/wiki/Q211674) Sykes-Picot Agreement: secret agreement negotiated across capitals; no signing place fetched.
- [Q541372](https://www.wikidata.org/wiki/Q541372) Anglo-Iraqi Treaty (1930): no place statement in Wikidata; not fetched.
- [Q321851](https://www.wikidata.org/wiki/Q321851) May 17 Agreement: no place statement in Wikidata; not fetched.
- [Q140932341](https://www.wikidata.org/wiki/Q140932341) Mecca Joint Defence Agreement: no place statement in Wikidata; not fetched.
- [Q2916659](https://www.wikidata.org/wiki/Q2916659) Operation Dani: a multi-day operation across Lydda/Ramle; Wikidata P276 (Jaffa) is not the site.
- [Q2073490](https://www.wikidata.org/wiki/Q2073490) 31 March incident: a mutiny/rebellion in Constantinople with no single site; no Wikidata place.
- [Q1327772](https://www.wikidata.org/wiki/Q1327772) Dersim massacre: a regional campaign (Dersim, now Tunceli); region, not point.
- [Q4842817](https://www.wikidata.org/wiki/Q4842817) Bahraini uprising: this QID is a Wikimedia DISAMBIGUATION page (P625 must not be used on those); the report links the wrong item.

## Data problems noticed in the report / pipeline

- Q4842817 (Bahraini uprising, row 83) is a disambiguation item; the real item should be found before anything is done.
- Menemen massacre (Q4809060) is dated 1916-06-16 in the report, but the English Wikipedia lead says 16-17 June 1919 (fetched). The date looks wrong in our pipeline source.
- Several items have a Wikidata P276 that is broad or odd (Fall of Baghdad 1917 = Diyala River; Aeroflot 244 = Sinop Airport). I did not propagate those.

## Quality check

- Automated, all 50 rows: the event item was re-fetched via `Special:EntityData` and confirmed to have no P625; the place item was re-fetched via `Special:EntityData` (P625, preferred rank else first); the English Wikipedia GeoData API was queried for the place article. 1 place(s) have no English Wikipedia coordinates to compare (Beyazit Square). Differences are 0 to 7.4 km, consistent with city-centroid choices differing between the two projects.
- Manual, 12 randomly drawn rows (Mahshahr massacre, Dumlupinar, Nuseirat, German-Ottoman alliance, Treaty of Ankara 1921, Treaty of Darin, 20 Sep 2024 Beirut attack, Maras massacre, 20 Hunchakian gallows, Treaty of Saadabad, Battle of Riyadh, Battle of Sderot): I fetched each event's English Wikipedia article and checked it names the same place. 11 of 12 agreed (Darin: "signed at Darin, on the island of Tarut"; Ankara 1921: "signed ... at Ankara"; Saadabad: signed in the Sa'dabad Complex, Tehran; Beirut attack: Dahieh suburb, al-Qaem neighbourhood, which is coarser-matched by Haret Hreik). **1 of 12 failed**: the German-Ottoman alliance article names no signing place, so that row (and the similar Reparations Agreement row) was dropped. Zurich Protocols, Menemen massacre were also checked against Wikipedia text (they have no Wikidata P276).
- Not verified: I did not independently check any coordinate against GeoNames or an official source; the two sources agree but are not fully independent (Wikipedia coordinates are often copied from Wikidata or vice versa).

## How to submit (your own account, small batches)

1. Use your **own** Wikimedia account (I did not and will not create one). Read [Wikidata:Bots](https://www.wikidata.org/wiki/Wikidata:Bots), [Help:QuickStatements](https://www.wikidata.org/wiki/Help:QuickStatements) and the edit/notability policies first. QuickStatements run under your account, so you are responsible for every edit.
2. Review the table. Delete any row you do not agree with. The TSV first line is a comment header; remove comment lines before pasting.
3. Open [QuickStatements](https://quickstatements.toolforge.org/), log in, "New batch", choose "V1 commands", paste rows, and run **5 to 10 rows first**. Check the resulting items, then watch for feedback on your talk page and the item histories for a few days before doing more.
4. QuickStatements V1 gives the coordinate a default precision. For city-centroid values consider setting a coarse precision (e.g. 0.01 degrees) via the web UI, since these are not exact sites. Prefer to add a determination-method or "imported from" style qualifier only if you know the community convention.
5. The reference (S854) points to the source Wikidata place item. Wikidata reviewers may prefer a non-Wikidata reference; if so use the place's Wikipedia/GeoNames page instead.
6. This changes data for everyone who uses Wikidata. Accuracy matters more than volume; if a row is doubtful, skip it.
