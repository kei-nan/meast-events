# Wording and label review: what atlas.wiki displays versus what Wikipedia and Wikidata say

Reviewer: one AI model (Claude), read-only research, 2026-09-26. This document surfaces quoted passages and checkable observations for the human owner to judge. It does not say who is right about any conflict. Ratings are prompts for a human look, not verdicts. Every quoted passage below was machine-checked to be a verbatim substring of the extract stored in `data/events.json` or of the live English Wikipedia lead fetched on 2026-09-26.

Companion file: `docs/bias-review/sample-wording.json` (all 60 events with the shown extract, the fetched live lead, findings and quotes).

## Headline findings (read this first)

1. **The displayed extract is usually shorter than the live lead, and what is cut is frequently the other side's account.** 50 of 60 sampled extracts stop before the end of the live lead. For 11 of the 12 events rated "worth a human look" I recorded at least one item of material content (a second party's account, a denial, a casualty range, a UN finding) that appears only in the part after the extract; the clearest cases are (Jenin 2002, Qana 1996, Tel al-Sultan 2024, Gaza War 2008-09, Lydda/Ramle 1948, Karantina 1976, Aleppo 2012-16). This is not a 545-character cut: there is no 545 limit in the stored data (max stored extract 1487 characters, median 435, 132 of 394 over 545). In the cases I read, the stored `extract` ends at a sentence or paragraph boundary and looks like Wikipedia's summary text; I did not inspect how the front end truncates or renders it.
2. **The `category` shown on the site is often not "Wikidata's class for the item" in the sense DATA_POLICY.md describes.** (a) 112 of 394 events (curated/legacy set, no `wikidata_classes` field) carry coarse legacy labels (political 36, war 36, uprising 15, treaty 12, diplomatic 8, migration 2, terrorism 2, economic 1), not Wikidata classes; for example the Armenian genocide is shown as "political" although Wikidata's own P31 for it today includes "genocide". (b) For the other events, `category` is "the first class the item was found under" (`scripts/enrich-candidates.js`, line 78-79), i.e. it depends on the order of the query loop, not on Wikidata. 41 events have two or more stored classes and only the first is displayed (details in the label section). (c) Classes are matched through subclass chains (`P31/P279*`), so an item whose own Wikidata class is "bomb attack" is displayed as "terrorist attack".
3. **Label pattern by actor type, not by side alone, but with visible asymmetries** (section "Label consistency"). In the Israeli-Palestinian set I could classify by actor, non-state Palestinian/Arab/Islamist attacks on Israelis or Jews are shown as "massacre" (17 of 26), "terrorist attack" (6), "aircraft hijacking" (2) or "military operation" (1). Israeli state or pre-state Zionist actions are shown as "massacre" (13 of 34), "military operation" (10), "assassination" (6), "terrorist attack" (3), "war crime" (1) and "population transfer" (1). The "terrorist attack" label appears once for an Israeli air strike (Bahr El-Baqar school, 1970), where Wikipedia\'s lead itself says the designation is disputed, and once for the 2022 Al-Aqsa clashes, whose extract describes clashes rather than an attack.
4. **Own-voice loaded terms are present in about half the sample**, spread across sides and regions: "terrorist attack/group/action" (King David Hotel, Sabena 571, Sharm el-Sheikh, Ahvaz), "massacre" (Simele, Nisour Square), "genocide" (Sinjar), "war crimes" (Abu Ghraib), "regime" and "totalitarian hereditary dictatorship" (Assad), "Ba\'athist" (Aleppo), "occupied" and "invaded" (Jenin, Qana, South Lebanon, 1982 war). Wikipedia usually names the actor when it uses them. The sample is too small to say whether one side is favoured.
5. **A data problem, not a bias problem:** the record titled "Israeli withdrawal from Lebanon" displays the extract of the "South Lebanon conflict (1985-2000)" article (its `wikipedia_url`); "Operation Olive Branch" has `date_start` 2019-08-09 while its extract says the operation ended 18 March 2018; the "Fall of the Assad regime" extract says "1971" where the live lead now says "1970" (stale extract); "Battle off the coast of Abkhazia" is filed under Turkey.
6. **Cross-language leads differ in ways worth a look** (section "Cross-language comparison"): e.g. Hebrew leads use "terror" vocabulary for Palestinian actors and state Israeli aims; Arabic leads use "massacre" titles and "occupation forces" and in one case call a UN report "clearly biased"; Turkish and Persian leads often mirror the English lead. Details and my reading limits below.

## Method

**Sample.** 60 events from `data/events.json` (394 events), seeded with Python `random.Random(20260928)` (Mersenne Twister, script `docs/bias-review/sample.py`; event ids sorted before shuffling so the draw is reproducible). Four eras x 15 events: before 1948, 1948-1990, 1991-2010, 2011 onward (by `date_start` year). Within each era, up to 5 events were drawn from a non-contested pool and the rest (10 or more) from a "contested" pool (first country Israel/Palestine, Lebanon, Syria, Iran, Egypt, Bahrain or Kuwait, or a keyword in the title/first 200 characters of the extract: armenian, kurd, cyprus, gulf, bahrain, hamas, gaza, intifada, palestin, israel, hezbollah, lebanon, syria, iran, egypt, turk). Inside each pool the draw rotates through Wikidata category labels in a random order, so categories are stratified. Result: in every era 10 events came from the contested pool and 5 from the non-contested pool (40 and 20 overall; see the JSON `contested_pool` field). The contested pool is broad (it covers most of the dataset), so "contested" here means "tagged by these keywords/countries", not a judgement that the event is disputed.

**Known sampling gap:** the seeded draw happened to include no Armenian-genocide event and no Cyprus event. The dataset has no Cyprus events at all (Cyprus is not among the 15 tracked countries). I therefore added a **separate, non-random supplementary set** of 10 Armenian, Kurdish and Egypt/Turkey items (section "Supplementary contested items"), not counted in any table.

**Live lead.** English Wikipedia API `action=query&prop=extracts&exintro&explaintext&redirects`, User-Agent `AtlasWiki/0.1 (contact: contact address removed)`, 0.5 s between requests, fetched 2026-09-26. "Full lead" means the API's intro extract (all paragraphs before the first heading), plain text. The Wikipedia articles can change after that date, and several (2026 events) are changing quickly.

**Comparison of shown extract and full lead.** I read both, then computed how much live-lead text follows the stored extract. For 3 events the stored extract and live lead differ in small wording (a date in brackets removed, an edit since retrieval), so the "material beyond the extract" figure for those is approximate (flagged in the JSON).

## Rubric

For each event I assessed the displayed extract, and separately the full lead, on six items:

1. Loaded or contested labels used in Wikipedia's own voice (terrorist, massacre, genocide, regime, occupation/occupied, invasion/liberation, militants/fighters, martyr, settler and similar) versus attributed to a named party.
2. Casualty and number claims: sourced or attributed versus bare; ranges; whose figures come first.
3. Causal and blame framing: who is the grammatical subject or agent; passive voice hiding actors.
4. Perspective omitted that the lead of a reasonable article would include.
5. Tone words (brutal, heroic, remarkable, raged and similar).
6. Where the difference between the shown extract and the full lead changes the balance.

Ratings for each event: **no concerns found**, **notable** (a checkable wording, number, omission or label point exists), **worth a human look** (more than one such point, or the point changes the picture of who did what, or there is a data mismatch). These are my thresholds and are subjective. "No concerns found" means I found none in the text I read, not that none exist. Each finding has its own quotation in the JSON; the table below shows the first one.

## Aggregate counts (n = 60; do not read these as prevalence in the dataset)

Rating of the **shown extract**:

| Stratum | n | no concerns found | notable | worth a human look |
|---|---|---|---|---|
| <1948 | 15 | 9 | 6 | 0 |
| 1948-1990 | 15 | 6 | 7 | 2 |
| 1991-2010 | 15 | 3 | 8 | 4 |
| 2011+ | 15 | 4 | 5 | 6 |
| contested pool | 40 | 10 | 19 | 11 |
| non-contested pool | 20 | 12 | 7 | 1 |
| ALL | 60 | 22 | 26 | 12 |

Rating of the **full live lead** (same events):

| Stratum | n | no concerns found | notable | worth a human look |
|---|---|---|---|---|
| <1948 | 15 | 9 | 6 | 0 |
| 1948-1990 | 15 | 5 | 8 | 2 |
| 1991-2010 | 15 | 3 | 8 | 4 |
| 2011+ | 15 | 4 | 5 | 6 |
| ALL | 60 | 21 | 27 | 12 |

Events with at least one finding under each rubric item (an event can appear under several):

| Rubric item | events with at least one finding (of 60) |
|---|---|
| 1. loaded/contested label or "occupied/invaded"-type word in own voice | 29 |
| 2. number claims (bare, ranged, or attributed) | 16 |
| 3. causal/agent/passive framing | 11 |
| 4. omitted perspective | 14 |
| 5. tone word | 9 |
| 6. extract vs full lead difference (truncation) | 29 |

10 of 60 sampled extracts are the whole live lead (nothing beyond them); for the other 50 the live lead has material after the extract (median 1405 characters).

Cautions: strata have 15 events each (contested/non-contested 40/20); a single event moves a percentage by about 7 points; the contested pool is contested by construction, so its higher flag rate is partly a consequence of the sampling and of my own attention going where I was told to look. The rise across eras (more "worth a look" in later eras) partly reflects that later Wikipedia leads are longer, more source-attributed and more recent, and that the recent contested items (2023-2026) are concentrated in Israel/Palestine and Iran.

## Per-event table (all 60)

| # | Era | Event (Wikidata category) | Shown extract | Full lead | Reason and key quote |
|---|---|---|---|---|---|
| 1 | <1948 | Operation Abstention (military operation) | no concerns found | no concerns found | Neutral operational description; actor is grammatical subject. Quote (extract): "a British invasion of the Italian island of Kastelorizo" |
| 2 | <1948 | King David Hotel bombing (terrorist attack) | notable | notable | "terrorist attack" is used in Wikipedia's own voice with the perpetrator named; the 91 dead are a bare figure; the extract omits the live lead's account of the disputed warnings. Quote (extract): "were bombed in a terrorist attack on 22 July 1946, by the militant right-wing Zionist underground organization Irgun" |
| 3 | <1948 | 1936–39 Arab revolt in Palestine (uprising) | notable | notable | Extract gives only the Palestinian Arab movement's stated aims; the full lead adds the Jewish-civilian and intra-Arab dimensions, casualty figures and a tone word ("brutally") in Wikipedia voice. Quote (extract): "The movement sought independence from British colonial rule and the end of British support for Zionism, including Jewish immigration and land sales to Jews." |
| 4 | <1948 | Italo-Turkish War (war) | no concerns found | no concerns found | Neutral; actors are grammatical subjects. |
| 5 | <1948 | National Pact (political) | notable | notable | Extract omits the sectarian allocation of offices that is the pact's substance and the full lead's own-voice claim about disproportionate Christian power. Quote (live lead beyond extract): "The president of the Republic and the commander of the Lebanese Armed Forces must be Maronite Catholic." |
| 6 | <1948 | First Battle of Gaza (battle) | no concerns found | no concerns found | Neutral military narrative. Full lead contains an unattributed evaluative aside. Quote (live lead beyond extract): "It has been suggested that this move snatched defeat from the jaws of victory." |
| 7 | <1948 | Armistice of Mudanya (treaty) | no concerns found | no concerns found | Neutral. |
| 8 | <1948 | United Nations Partition Plan for Palestine (diplomatic) | notable | notable | Extract neutrally describes the plan but omits both sides' positions; the full lead contains contested claims in Wikipedia voice, including a bare 85% figure. Quote (live lead beyond extract): "The Arab Higher Committee, the Arab League and other Arab leaders and governments rejected the Plan" |
| 9 | <1948 | Simele massacre (massacre) | notable | notable | "massacre" in own voice, state perpetrator named; the perpetrator general's ethnicity is foregrounded; no casualty figure appears anywhere in the lead. Quote (extract): "was a massacre committed by the Kingdom of Iraq under the leadership of Kurdish army general Bakr Sidqi" |
| 10 | <1948 | Operation Skorpion (military operation) | no concerns found | no concerns found | Neutral. |
| 11 | <1948 | Treaty of Sèvres (treaty) | no concerns found | no concerns found | Neutral; "occupation zones" describes treaty provisions. |
| 12 | <1948 | Operation Excess (military operation) | no concerns found | no concerns found | Neutral. |
| 13 | <1948 | McMahon–Hussein Correspondence (diplomatic) | no concerns found | no concerns found | Neutral; disputes are mentioned only in the full lead. Quote (live lead beyond extract): "conflicting interpretations of this description were to cause great controversy in subsequent years" |
| 14 | <1948 | Iraqi revolt against the British (uprising) | notable | notable | Tone word for one party ("embittered") and no mention of the British suppression in the extract. Quote (extract): "protests by embittered officers from the old Ottoman Army" |
| 15 | <1948 | Battle of Ardahan (battle) | no concerns found | no concerns found | Neutral. |
| 16 | 1948-1990 | Palestinian expulsion from Lydda and Ramle (population transfer) | worth a human look | worth a human look | Extract uses "violently expelled" and an unsourced "Hundreds ... killed" in Wikipedia voice and omits the Israeli military rationale and the range given in the full lead; Arabic/Persian leads give an expellee figure that the English lead does not. Quote (extract): "their residents were violently expelled" |
| 17 | 1948-1990 | Sabena Flight 571 (aircraft hijacking) | notable | notable | "terrorist group" in Wikipedia voice; extract omits how it ended (Israeli raid). Quote (extract): "four members of the Black September Organization, a Palestinian terrorist group" |
| 18 | 1948-1990 | Karantina massacre (massacre) | worth a human look | worth a human look | A "massacre" article whose displayed extract never says who committed it or how many died; the perpetrator and toll (600-1,500) are only in the truncated part, and the extract puts PLO-controlled territory in subject position. Quote (extract): "was a Muslim-inhabited district in mostly Christian East Beirut controlled by forces of the Palestine Liberation Organization (PLO) and the Lebanese National Movement (LNM)" |
| 19 | 1948-1990 | 1982 Lebanon War (war) | notable | notable | "invaded" in own voice; extract attributes the casus belli to Begin, but omits the siege of Beirut, Sabra and Shatila and the occupation that are in the full lead. Quote (extract): "when Israel invaded southern Lebanon" |
| 20 | 1948-1990 | 1973 oil crisis (economic) | no concerns found | no concerns found | States purposes in Wikipedia voice ("attempt to recover the territories that they had lost") but neutral in tone. Quote (extract): "Egypt and Syria launched a large-scale surprise attack in an ultimately unsuccessful attempt to recover the territories that they had lost to Israel" |
| 21 | 1948-1990 | Iranian Revolution (uprising) | no concerns found | notable | Displayed extract is neutral. The full lead contains many own-voice evaluations and claims that the extract does not show. Quote (live lead beyond extract): "the Cinema Rex fire by Islamic militants killed around 400 people. However a large portion of the public believed it was a false flag operation by SAVAK" |
| 22 | 1948-1990 | Ramsar Convention (treaty) | no concerns found | no concerns found | Neutral treaty description. |
| 23 | 1948-1990 | 1983 Beirut barracks bombings (terrorism) | notable | notable | Passive voice: the extract does not say who carried out the bombings; the count includes the attackers among the dead; Wikidata category is "terrorism" although the extract does not use the word. Quote (extract): "two truck bombs were detonated at buildings in Beirut, Lebanon" |
| 24 | 1948-1990 | Assassination of Anwar Sadat (assassination) | notable | notable | "victory over Israel" is Egypt's framing of a contested war outcome stated in Wikipedia voice. Quote (extract): "held in Cairo to celebrate the victory over Israel in the Yom Kippur War" |
| 25 | 1948-1990 | 1966 attack on Samu (military operation) | notable | notable | Extract omits both Israel's stated justification and the UN censure that the full lead includes. Quote (live lead beyond extract): "Israel stated that the attack was in response to a Palestinian fedayeen guerrilla land mine attack two days earlier" |
| 26 | 1948-1990 | Khartoum Resolution (diplomatic) | no concerns found | no concerns found | Neutral. |
| 27 | 1948-1990 | 1968 Iraqi coup d'état (political) | notable | notable | Internal tension: "bloodless coup" in own voice, then executions on "fabricated" charges in own voice; also tests the extract-length (1,215 characters, no truncation). Quote (extract): "publicly executing 14 people including 9 Iraqi Jews on fabricated espionage charges" |
| 28 | 1948-1990 | Grand Mosque seizure (terrorism) | no concerns found | no concerns found | Numbers hedged ("up to 600"); label is "militants". Quote (extract): "carried out by up to 600 militants led by Juhayman al-Otaybi" |
| 29 | 1948-1990 | 14 July Revolution (uprising) | no concerns found | no concerns found | Neutral; note Wikidata class "uprising" versus the article's "military coup". |
| 30 | 1948-1990 | North Yemen Civil War (war) | notable | notable | Extract credits the republican side ("abolished slavery") and omits foreign intervention (Egypt, Saudi Arabia, Israel), which is in the full lead. Quote (extract): "His government abolished slavery in Yemen." |
| 31 | 1991-2010 | Oslo Accords (treaty) | no concerns found | no concerns found | Extract neutral; both-sided opposition only in the full lead. Quote (live lead beyond extract): "Far-right Israelis also opposed the Oslo Accords, and Israeli prime minister Yitzhak Rabin was assassinated in 1995 by a right-wing Israeli extremist for signing them." |
| 32 | 1991-2010 | Gaza War (2008–09) (war) | worth a human look | worth a human look | Extract lists "the Gaza Massacre" among names, gives an unattributed casualty range with Palestinian figure first and omits the rocket-fire background, both sides' accusations and the Goldstone dispute. Quote (extract): "also known as the First Gaza War, Operation Cast Lead, or the Gaza Massacre, and referred to as the Battle of al-Furqan by Hamas" |
| 33 | 1991-2010 | Battle of Jenin (2002) (battle) | worth a human look | worth a human look | "Israeli-occupied" and "invaded" in own voice with no casualty figures, no Israeli account and no mention of the contested massacre claim, all of which are in the truncated part; Arabic article is titled "Jenin massacre". Quote (extract): "The Israeli military invaded the camp, and other areas under the administration of the Palestinian Authority" |
| 34 | 1991-2010 | Assassination of Rafic Hariri (assassination) | notable | notable | Passive voice: extract does not say who is blamed; the tribunal findings and Hezbollah's denial are only in the truncated text. Quote (extract): "was assassinated along with 21 others in an explosion in Beirut" |
| 35 | 1991-2010 | Israeli withdrawal from Lebanon (political) | worth a human look | worth a human look | Data issue: the record's title is "Israeli withdrawal from Lebanon" but the extract (and wikipedia_url) is the South Lebanon conflict article; it uses "Israeli-occupied" in own voice. Quote (extract): "an armed conflict that took place in Israeli-occupied southern Lebanon from 1982 or 1985 until Israel's withdrawal in 2000" |
| 36 | 1991-2010 | Cedar Revolution (uprising) | notable | notable | Approving tone in own voice ("remarkable for its avoidance of violence"); "occupied" appears in the full lead. Quote (extract): "The popular movement was remarkable for its avoidance of violence, peaceful approach, and its total reliance on methods of civil resistance." |
| 37 | 1991-2010 | Operation Viking Hammer (military operation) | notable | notable | Extract does not say who carried out the operation; goal stated from the operators' perspective ("eliminate", "dismantle"). Quote (extract): "The goal of the operation was to eliminate Ansar al-Islam and dismantle the Islamic Emirate of Kurdistan." |
| 38 | 1991-2010 | Siege of the Church of the Nativity (siege) | notable | notable | Extract says "suspected Palestinian militants" but omits the hostage dispute (Israel versus Franciscans) that the full lead records. Quote (live lead beyond extract): "The Franciscan Order maintained no hostages were held, while Israeli sources claimed the monks and others were being held hostage by gunmen." |
| 39 | 1991-2010 | 2005 Sharm El Sheikh bombings (terrorist attack) | notable | notable | "terrorist action" in own voice; passive "committed by" with named group; bare figures. Quote (extract): "making the attack the deadliest terrorist action in the history of Egypt" |
| 40 | 1991-2010 | Qana massacre (massacre) | worth a human look | worth a human look | Extract states in own voice that the Israeli military "fired artillery shells at a United Nations compound" and gives 106 dead with no Israeli explanation; Israel's claim and the UN finding it was deliberate are only in the truncated text. Quote (extract): "when the Israeli military fired artillery shells at a United Nations compound, which was sheltering around 800 Lebanese civilians, killing 106" |
| 41 | 1991-2010 | Iraqi insurgency (2003–2011) (rebellion) | no concerns found | no concerns found | Neutral; "invasion" and "insurgency" are conventional. Omits sectarian dimensions that the full lead covers. Quote (extract): "beginning shortly after the 2003 American invasion deposed longtime leader Saddam Hussein" |
| 42 | 1991-2010 | Abu Ghraib torture and prisoner abuse (war crime) | notable | notable | "war crimes" in own voice with the US Army and CIA as named agents; the US government's position and the prosecutions are only in the truncated text. Quote (extract): "members of the United States Army and the Central Intelligence Agency committed a series of human rights violations and war crimes against detainees" |
| 43 | 1991-2010 | Nisour Square massacre (massacre) | notable | notable | "massacre" in Wikipedia voice with active agent; extract omits Blackwater's ambush claim (present in full lead) but includes convictions and pardons. Quote (extract): "shot at Iraqi civilians, killing 17 and injuring 20" |
| 44 | 1991-2010 | Battle off the coast of Abkhazia (battle) | no concerns found | no concerns found | Hedged ("supposed naval engagement"). Data note: record lists country Turkey for a Black Sea engagement off Abkhazia. Quote (extract): "was a supposed naval engagement between warships of the Russian Black Sea Fleet and Georgian patrol boats" |
| 45 | 1991-2010 | Arab Spring (uprising) | notable | notable | "pro-democracy" is an evaluative descriptor in own voice; the full lead also uses "counter-revolutionary". Quote (extract): "a series of pro-democracy anti-government protests, uprisings, and armed rebellions" |
| 46 | 2011+ | Battle of Aleppo (2012–2016) (war) | worth a human look | worth a human look | A "battle" article whose displayed extract has no civilian-harm content at all and uses the epithet "Ba'athist" repeatedly; the full lead has extensive both-sided atrocity content and a UN quote. Quote (extract): "Ba'athist Syrian government and army" |
| 47 | 2011+ | Assassination of Ali Khamenei (assassination) | worth a human look | worth a human look | Very recent, fast-moving article; extract states "assassinated" in own voice, omits Iranian reactions ("mixed") and the sourcing of the account. Quote (extract): "Ali Khamenei, the supreme leader of Iran, was assassinated in Tehran as part of a series of Israeli airstrikes aimed at high-ranking Iranian officials" |
| 48 | 2011+ | Sinai insurgency (rebellion) | notable | notable | Extract presents insurgents as actors and civilians as victims; the state's demolitions and displacement are only in the truncated text. Quote (extract): "launched by Islamist militants against Egyptian security forces, which also included attacks on civilians" |
| 49 | 2011+ | Ahvaz military parade attack (terrorist attack) | notable | notable | "terrorist attack" in own voice; the claim of responsibility and Iran's accusation are only in the truncated text; Turkish-language lead attributes the label to Iran. Quote (extract): "It was the deadliest terrorist attack in Iran since the Chabahar suicide bombing in December 2010." |
| 50 | 2011+ | Tel al-Sultan attack (massacre) | worth a human look | worth a human look | Extract: "massacre" alias, an unattributed 45-50 range, "displacement camp" in own voice, Israel's stated target and claim of accident only in truncated text. Hebrew lead frames it differently (see cross-language). Quote (extract): "Sometimes referred to as the Rafah tent massacre or as the Tent Massacre" |
| 51 | 2011+ | Battle of Idlib (2015) (battle) | no concerns found | no concerns found | Neutral. |
| 52 | 2011+ | Fall of the Assad regime (political) | worth a human look | worth a human look | "regime" and "totalitarian hereditary dictatorship" in Wikipedia's own voice; HTS is named without any note of how it is designated by others. Extract's "1971" differs from the live lead's "1970" (stale extract). Quote (extract): "which had governed Syria as a totalitarian hereditary dictatorship since Hafez al-Assad assumed power in 1971 after a successful coup d'état" |
| 53 | 2011+ | Yemeni Revolution (uprising) | notable | notable | Tone word ("raged") and "authoritarian regime" in own voice; the election figure is reported as "A report claims". Quote (extract): "a series of major anti-government protests and armed uprisings that raged through Yemen" |
| 54 | 2011+ | Church of Saint Porphyrius airstrike (war crime) | worth a human look | worth a human look | Wikidata class is "war crime" but the extract does not use that phrase and the lead contains no Israeli response; numbers are bare, with an unsourced range. Quote (extract): "killing 18 Palestinian civilians and injuring between 12 and "at least 20"" |
| 55 | 2011+ | Abraham Accords (treaty) | notable | notable | Extract covers expansion of the accords; the Arab public/Palestinian objection is only in the truncated text. Quote (live lead beyond extract): "public opinion in many countries remained opposed, particularly due to the Accords' lack of progress on resolving the Israeli–Palestinian conflict" |
| 56 | 2011+ | Sinjar massacre (massacre) | notable | notable | "genocide" in own voice (no attribution to the UN or others in the extract); Peshmerga "abandoned" is a causal claim in own voice; "thousands" is unquantified. Quote (extract): "marked the beginning of the genocide of Yazidis by ISIL" |
| 57 | 2011+ | Fall of Mosul (military operation) | no concerns found | no concerns found | Extract neutral ("captured"); full lead uses "liberation" in own voice for the later recapture; Wikidata class is "military operation". Quote (live lead beyond extract): "ended in its liberation in July the following year" |
| 58 | 2011+ | Saudi Arabian–led intervention in Yemen (war) | worth a human look | worth a human look | Coalition's legal basis ("at the request of") and "Houthi insurgents" in the extract; civilian casualties and criticism are only in the truncated text. Quote (extract): "staged a military intervention in Yemen at the request of Yemeni president Abdrabbuh Mansur Hadi, who had been ousted from the capital, Sanaa, in September 2014 by Houthi insurgents" |
| 59 | 2011+ | Istanbul Convention (treaty) | no concerns found | no concerns found | Neutral. |
| 60 | 2011+ | Houthi insurgency (rebellion) | no concerns found | no concerns found | Causal framing points to the government's action; neutral tone. Quote (extract): "The conflict was sparked in 2004 by the government's attempt to arrest Hussein al-Houthi" |

## The ten most notable items, with quotes

Chosen by how much the displayed text differs from what the full lead or the record itself shows, not by which party is involved. Other events rated "worth a human look" are in the table: Khamenei assassination (#47), Saudi-led intervention in Yemen (#58).

### 1. Battle of Jenin (2002) (1991-2010, battle)

"Israeli-occupied" and "invaded" in own voice with no casualty figures, no Israeli account and no mention of the contested massacre claim, all of which are in the truncated part; Arabic article is titled "Jenin massacre".
- Rubric 1 ("occupied" and "invaded" in own voice), from extract: "The Israeli military invaded the camp, and other areas under the administration of the Palestinian Authority"
- Rubric 6 (truncation drops the massacre allegation and the investigations), from live lead beyond extract: "Despite reports of a widespread massacre numbering hundreds of casualties by some Palestinian officials, subsequent investigations found no evidence to substantiate it"
- Rubric 2 (casualty figures only in truncated text), from live lead beyond extract: "official totals from Palestinian and Israeli sources confirmed between 52 and 54 Palestinians, including civilians, and 23 Israeli soldiers"
- Rubric 4 (Israeli account of the fighting only in truncated text), from live lead beyond extract: "Palestinian militants had prepared for a fight, booby trapping locations throughout the camp"

### 2. Qana massacre (1991-2010, massacre)

Extract states in own voice that the Israeli military "fired artillery shells at a United Nations compound" and gives 106 dead with no Israeli explanation; Israel's claim and the UN finding it was deliberate are only in the truncated text.
- Rubric 3 (active agent, own voice), from extract: "when the Israeli military fired artillery shells at a United Nations compound, which was sheltering around 800 Lebanese civilians, killing 106"
- Rubric 6 (truncation drops Israel's account), from live lead beyond extract: "According to Israel, it had launched the artillery barrage to cover an Israeli special forces unit after it had come under mortar fire"
- Rubric 6 (and the UN finding, stated with "refuted" in Wikipedia voice), from live lead beyond extract: "Israel's claims were refuted by a United Nations investigation which later found that the Israeli shelling was deliberate"
- Rubric 1 ("occupied" in own voice), from extract: "a village in then Israeli-occupied Southern Lebanon"

### 3. Tel al-Sultan attack (2011+, massacre)

Extract: "massacre" alias, an unattributed 45-50 range, "displacement camp" in own voice, Israel's stated target and claim of accident only in truncated text. Hebrew lead frames it differently (see cross-language).
- Rubric 1 (alternative names including "massacre"), from extract: "Sometimes referred to as the Rafah tent massacre or as the Tent Massacre"
- Rubric 2 (range, no source), from extract: "killed between 45 and 50 Palestinians and injured more than 200"
- Rubric 6 (truncation drops Israel's account), from live lead beyond extract: "It claimed it attacked an outer "Hamas compound" and accidentally set off the fire."
- Rubric 4 (and the counter-evidence, attributed to Amnesty and unnamed sources), from live lead beyond extract: "An investigation by Amnesty International concluded that militants were in the camp, but that Israel knowingly put civilians at risk."

### 4. Gaza War (2008–09) (1991-2010, war)

Extract lists "the Gaza Massacre" among names, gives an unattributed casualty range with Palestinian figure first and omits the rocket-fire background, both sides' accusations and the Goldstone dispute.
- Rubric 1 (contested name presented as alias), from extract: "also known as the First Gaza War, Operation Cast Lead, or the Gaza Massacre, and referred to as the Battle of al-Furqan by Hamas"
- Rubric 2 (range without source; Palestinian deaths first, no civilian/combatant split), from extract: "The conflict resulted in 1,166–1,417 Palestinian and 13 Israeli deaths."
- Rubric 6 (truncation drops rocket fire and war-crimes findings on both sides), from live lead beyond extract: "a UN special mission, headed by the South African Justice Richard Goldstone, produced a report accusing both Palestinian militants and the Israeli army of war crimes"
- Rubric 6 (and the later Goldstone statement), from live lead beyond extract: "In 2011, Goldstone wrote that he did not believe that Israel intentionally targeted civilians in Gaza as a matter of policy."

### 5. Palestinian expulsion from Lydda and Ramle (1948-1990, population transfer)

Extract uses "violently expelled" and an unsourced "Hundreds ... killed" in Wikipedia voice and omits the Israeli military rationale and the range given in the full lead; Arabic/Persian leads give an expellee figure that the English lead does not.
- Rubric 5 (adverb in own voice), from extract: "their residents were violently expelled"
- Rubric 2 (bare figure, no source, no range), from extract: "Hundreds of Palestinians were killed in multiple mass killings, including the Lydda massacre"
- Rubric 6 (truncation drops the Israeli-side rationale (attributed to Benny Morris) and the death-toll range), from live lead beyond extract: "From the Israeli perspective, the conquest of the towns, designed, according to Benny Morris, "to induce civilian panic and flight", averted an Arab threat to Tel Aviv"
- Rubric 2 (range appears only in full lead), from live lead beyond extract: "with estimates ranging from a handful to a figure of 500"

### 6. Karantina massacre (1948-1990, massacre)

A "massacre" article whose displayed extract never says who committed it or how many died; the perpetrator and toll (600-1,500) are only in the truncated part, and the extract puts PLO-controlled territory in subject position.
- Rubric 3 (extract names the victims' district and its PLO/LNM control but no perpetrator), from extract: "was a Muslim-inhabited district in mostly Christian East Beirut controlled by forces of the Palestine Liberation Organization (PLO) and the Lebanese National Movement (LNM)"
- Rubric 6 (perpetrator and range only in truncated text), from live lead beyond extract: "Karantina was overrun by militias of the right-wing and mostly Christian Lebanese Front, primarily the Kataeb Regulatory Forces (KRF) militia of the Kataeb Party (a.k.a. Phalangists), resulting in the deaths of approximately 600–1,500 people"
- Rubric 4 (full lead adds the PLO/LNM-perpetrated Damour massacre (context)), from live lead beyond extract: "Mass killings of civilians continued in Damour leading to the Damour massacre, which the LNM and the PLO perpetrated after the Karantina massacre"

### 7. Battle of Aleppo (2012–2016) (2011+, war)

A "battle" article whose displayed extract has no civilian-harm content at all and uses the epithet "Ba'athist" repeatedly; the full lead has extensive both-sided atrocity content and a UN quote.
- Rubric 1 ("Ba'athist" as repeated modifier for one party), from extract: "Ba'athist Syrian government and army"
- Rubric 4 (extract omits civilian harm entirely), from live lead beyond extract: "marked by widespread violence against civilians, repeated targeting of hospitals and schools (mostly by pro-government air forces but also to a lesser extent by the rebels)"
- Rubric 2 (bare figure in full lead), from live lead beyond extract: "leaving over 31,000 people dead in the city and the rest of the province"
- Rubric 6 (truncation drops the balanced condemnation), from live lead beyond extract: "All parties to the battle have been widely condemned by the UN and human rights organizations for engaging in atrocities"

### 8. Israeli withdrawal from Lebanon (1991-2010, political)

Data issue: the record's title is "Israeli withdrawal from Lebanon" but the extract (and wikipedia_url) is the South Lebanon conflict article; it uses "Israeli-occupied" in own voice.
- Rubric 1 ("occupied" in own voice), from extract: "an armed conflict that took place in Israeli-occupied southern Lebanon from 1982 or 1985 until Israel's withdrawal in 2000"
- Rubric 4 (title/extract mismatch (record wikipedia_url is South_Lebanon_conflict_(1985-2000))), from extract: "The South Lebanon conflict was an armed conflict"
- Rubric 6 (the withdrawal itself (the titled event) is only in the truncated text), from live lead beyond extract: "the new Israeli prime minister Ehud Barak unilaterally withdrew Israeli forces from southern Lebanon on 25 May 2000"

### 9. Fall of the Assad regime (2011+, political)

"regime" and "totalitarian hereditary dictatorship" in Wikipedia's own voice; HTS is named without any note of how it is designated by others. Extract's "1971" differs from the live lead's "1970" (stale extract).
- Rubric 1 ("regime" and a strong characterisation in own voice), from extract: "which had governed Syria as a totalitarian hereditary dictatorship since Hafez al-Assad assumed power in 1971 after a successful coup d'état"
- Rubric 1 ("regime" as headline term), from extract: "On 8 December 2024, the Assad regime in Syria collapsed during a major offensive by opposition forces."
- Rubric 6 (live lead differs from stored extract (1970 vs 1971)), from live lead beyond extract: "since Hafez al-Assad assumed power in 1970 after a successful coup d'état"

### 10. Church of Saint Porphyrius airstrike (2011+, war crime)

Wikidata class is "war crime" but the extract does not use that phrase and the lead contains no Israeli response; numbers are bare, with an unsourced range.
- Rubric 2 (bare figures with vague range), from extract: "killing 18 Palestinian civilians and injuring between 12 and "at least 20""
- Rubric 4 (no Israeli account in the lead (the extract is the entire lead)), from extract: "The church building itself was not damaged."
- Rubric 3 (active agent, own voice), from extract: "was destroyed during an Israeli airstrike"


## Label consistency (Wikidata class shown as `category`)

### How the label is produced (checked in the repository)

- `docs/DATA_POLICY.md`: "`category` is Wikidata's own class label for the item ... presented as Wikidata's classification".
- `scripts/enrich-candidates.js` line 78-79: `category: classes[0] ?? candidate.category` with the comment "first class the item was found under". `scripts/discover-events.js` queries classes in the order of `EVENT_CLASSES` (battle, war, military operation, treaty, coup d'etat, assassination, genocide, massacre, terrorist attack, revolution, ...). So an item that Wikidata places under several matching classes is shown under the earliest class in that list. "massacre" precedes "terrorist attack" and "war crime".
- Matching uses `P31/P279*` (instance of, following subclass-of). The displayed label can therefore be an ancestor class, not the class Wikidata states on the item.
- 112 of 394 events have no `wikidata_classes` field; their `category` is a legacy coarse group (political 36, war 36, uprising 15, treaty 12, diplomatic 8, migration 2, terrorism 2, economic 1). No event in the data is labelled "genocide" even though "genocide" is in the class list.

I checked live Wikidata (2026-09-26, `wbgetentities` for P31 and a SPARQL query over `P31/P279*` for the event classes) for 20 items. Results that matter:

| Event | Shown `category` | Item's own Wikidata P31 today | Event classes matched via P31/P279* |
|---|---|---|---|
| Bahr El-Baqar primary school bombing | terrorist attack | bomb attack | terrorist attack |
| 2022 Al-Aqsa clashes | terrorist attack | offensive; attack on mosque | military operation; terrorist attack |
| October 7 attacks | massacre | coordinated terrorist attack; massacre; offensive; military raid; border incident | military operation; terrorist attack; massacre |
| King David Hotel bombing | terrorist attack | terrorist attack; military operation | military operation; terrorist attack |
| Tel al-Sultan attack | massacre | airstrike; conflagration; massacre | military operation; massacre |
| Church of Saint Porphyrius airstrike | war crime | airstrike; war crime | war crime; military operation |
| 1983 Beirut barracks bombings | terrorism (legacy) | suicide attack; suicide car bombing; vehicle-ramming attack | terrorist attack |
| Armenian Genocide | political (legacy) | genocide; ethnic violence; forced displacement | population transfer; genocide |
| Al-Anfal campaign | political (legacy) | military campaign | military operation |
| Killing of Yahya Sinwar | military operation | military operation; shootout | military operation |

### Counts by actor (method stated)

Method: from the 152 events whose category is one of terrorist attack, terrorism, massacre, war crime, aircraft hijacking, military operation, assassination or population transfer, I hand-assigned an actor for those in the Israeli-Palestinian/Lebanon/Iran-Israel context using the extract's own attribution (list in `docs/bias-review/label-side-mapping.json`). "Israeli state forces or pre-state Zionist groups" (Haganah, Irgun) is one group; "Palestinian/Arab/Islamist non-state actors attacking Israelis or Jews" (including the Japanese Red Army at Lod, Hezbollah's Majdal Shams excluded because responsibility there is disputed) is the other. Not classified: events where the actor is a third party, or mutual clashes. This is my judgement, one reviewer, and n is small; 10 of the 26 in the second group are sub-events of one day (7 October 2023), which inflates the "massacre" count there.

| Wikidata category | Israeli state forces / pre-state Zionist groups as actor (n=34) | Palestinian/Arab/Islamist non-state actors attacking Israelis or Jews (n=26) |
|---|---|---|
| massacre | 13 | 17 |
| terrorist attack | 3 | 6 |
| military operation | 10 | 1 |
| war crime | 1 | 0 |
| assassination | 6 | 0 |
| population transfer | 1 | 0 |
| aircraft hijacking | 0 | 2 |

| Wikidata classes stored for the same events (`wikidata_classes`, any position) | Israeli-actor group | Palestinian/Arab/Islamist non-state group |
|---|---|---|
| includes "terrorist attack" | 3 of 34 | 20 of 26 |
| includes "war crime" | 6 of 34 | 0 of 26 |
| includes "military operation" | 12 of 34 | 1 of 26 |

Reading of the tables (observations, not conclusions):

- The displayed label for the Israeli-actor group is spread over more labels than for the non-state group: "military operation" 10 of 34 versus 1 of 26; "terrorist attack" 3 of 34 versus 6 of 26; "massacre" 13 of 34 versus 17 of 26 (10 of those from 7 October).
- The **hidden** classes differ: 20 of the 26 non-state items also carry "terrorist attack" in `wikidata_classes` (most display "massacre" because it is queried first), while 6 of 34 Israeli-actor items carry "war crime" (most display "massacre"). A reader of the site sees "massacre" for both, while the underlying Wikidata classification differs by side. If the site ever displayed all classes, the asymmetry would become visible.
- Comparable pairs that get different labels: Israeli attacks that killed many civilians, Qibya 1953 "massacre", Samu 1966 "military operation", Bahr El-Baqar 1970 "terrorist attack" (the article says "significant dispute ... over the intentionality and motive of the attack and, consequently, its appropriate designation"). Palestinian attacks on Israeli children: Ma'alot 1974 "massacre", Avivim 1970 "terrorist attack", Coastal Road 1978 "terrorist attack" (the article title says "massacre"). Killings of Hamas leaders: Haniyeh, al-Arouri "assassination"; Sinwar "military operation" (the article describes a chance encounter during a patrol).
- Article title and label disagree: Tel al-Sultan "attack" is shown as "massacre"; Nir Oz, Nirim, Holit "attack" are "massacre"; Coastal road "massacre" is "terrorist attack"; 14 July Revolution and Iranian Revolution are "uprising" (legacy) while the leads say "coup" / "revolution".
- Outside Israel/Palestine the split follows actor type more cleanly: non-state suicide or bomb attacks in Turkey, Egypt, Iraq, Iran, Yemen, Kuwait, Lebanon are almost all "terrorist attack"; state forces killing civilians are "massacre" (Hama 1982, Dujail, Halabja, Rabaa 2013, Ghouta, Zilan, 2012 Homs offensive); US forces at Haditha, Nisour Square, Amiriyah, Minab are "massacre", at Abu Ghraib and Mahmudiyah "war crime". I did not find another state-actor event shown as "terrorist attack" apart from the Bahr El-Baqar item. I did not exhaustively check the 54 "terrorist attack" events.
- Odd fits: Fall of Mosul (ISIL capture) and Operation Euphrates Shield (whose own extract says it "led to the Turkish occupation") are "military operation"; Cinema Rex fire (arson) and 2012 Homs offensive are "massacre"; Killing of Hind Rajab (one victim) is "massacre"; Nahal Oz attack is "battle" although Wikidata also lists massacre and terrorist attack.
- Within the legacy set: 1983 US embassy bombing "terrorist attack", 1983 Beirut barracks bombings "terrorism", Grand Mosque seizure "terrorism".

## Supplementary contested items (not random; not in tables above)

Armenian, Kurdish and other items that the seeded draw missed. Same method (shown extract versus live lead).

- **Armenian Genocide** (shown category "political"). Extract: "The Armenian genocide was the systematic destruction of the Armenian people and identity" and "the mass murder of around one million Armenians" in Wikipedia's own voice. The extract stops after the first paragraph; the third paragraph, absent from the display, contains: "The Turkish government maintains that the deportation of Armenians was a legitimate action that cannot be described as genocide. As of 2026, 36 countries have recognized the genocide, concurring with the academic consensus." So the displayed text has no reference to the denial or to the number of recognising states.
- **Al-Anfal campaign** ("political"; Wikidata P31 today "military campaign"). Extract attributes: "described by many scholars and human rights groups as a genocide or ethnic cleansing". The live lead adds: "This characterization of the Anfal campaign was disputed by a 2007 Hague court ruling" and a death estimate "between 50,000 and 100,000" by HRW; both are absent from the extract.
- **Adana massacre** ("massacre"). Extract gives "Between 20,000 and 30,000 ethnic Armenians and 1,300 Assyrians were killed and tortured". The live lead ends: "the modern Turkish government and certain Turkish nationalists, deny the massacre happened."
- **Zilan massacre** ("massacre"). Extract: "the massacre of thousands of Kurdish civilians by the Turkish Land Forces". Live lead adds "The number of people killed in the massacre ranges from 4,500 women and elderly to 15,000 rebels per Cumhuriyet."
- **Defense of Van (1915)** ("battle"). Extract states, in Wikipedia's voice after "Several contemporaneous observers and later historians have concluded", that "Witness reports agree that the Armenian posture at Van was defensive", and that the event is "frequently cited in Armenian genocide denial literature". The extract is the whole lead.
- **Operation Olive Branch** ("battle"; Wikidata also lists military operation). Extract: "an invasion by the Turkish Armed Forces and Syrian National Army (SNA) in the Kurdish-majority Afrin District". Live lead adds "Between 395 and 510 civilians were reported killed in the invasion" and reports of war crimes by SNA and Turkish forces. `date_start` in the data is 2019-08-09 while the extract says the city was entered on 18 March 2018.
- **Halabja massacre** ("massacre"). Extract attributes findings (UN, BBC, DIA) and names the perpetrator's government; the full lead adds the 3,200-5,000 death range and the 2010 tribunal finding.
- **Ankara Esenboga Airport attack** ("terrorist attack"). Extract: "perpetrated by the Armenian Secret Army for the Liberation of Armenia (ASALA). Nine people were killed and 72 injured". No causal or motive statement.
- **Assassination of Hrant Dink** ("assassination"). Extract notes he was on trial for "denigrating Turkishness"; the live lead adds the convictions.
- **Rabaa massacre** ("massacre"). Extract avoids the word "massacre" in the sentence and uses "used lethal force to clear two camps of protesters" and a range "from 600 to 2,600" without attribution; the live lead adds HRW ("crimes against humanity"), the government figure (595 protesters, 43 police) and "widespread violent acts of retaliation by the Islamist groups".

## Cross-language comparison (10 contested events from the sample, plus 2 supplementary)

Method: for each event I took the interlanguage links from the English article and fetched the intro of the Hebrew, Arabic, Turkish and Persian article where one exists (`he`, `ar`, `tr`, `fa` Wikipedia), 0.5 s between requests, 2026-09-26. Not every language has every article; missing ones are stated. **My reading ability:** Arabic, Turkish and Hebrew moderate for short news-style sentences, Persian more limited; glosses are mine and could be wrong on nuance. I read only the first 1,000-1,100 characters of longer leads, so absence of a term below means "not in the part I read". Full text is in `docs/bias-review/_xlang.json`.

| Event | Language | Excerpt | English gloss | Difference from English lead |
|---|---|---|---|---|
| King David Hotel bombing | he | "פיצוץ מלון המלך דוד היה פיגוע תופת שבוצע על ידי אנשי האצ"ל" | "The King David Hotel bombing was a bomb attack carried out by Irgun members" | Uses the Hebrew word for a terror-attack type (`pigua`); gives 91 dead as "mostly Arabs and British, and 17 Jews", a breakdown the English extract lacks. |
| | ar | "منظمة صهيونية مسلحة يمينية متطرفة" | "an armed extremist right-wing Zionist organization" | No "terrorist" in the part I read; says "bombing" and names the organization with adjectives. |
| | fa | "سازمان تروریستی یهودی" ... "این اقدام تروریستی" | "a Jewish terrorist organization" ... "this terrorist act" | Uses "terrorist" repeatedly, stronger than English ("terrorist attack" once). |
| | tr | "militan Siyonist yeraltı kuruluşu olan Irgun ... terörist bombalı saldırı" | "militant Zionist underground organization Irgun ... terrorist bomb attack" | Close translation of the English. |
| Palestinian expulsion from Lydda and Ramle | ar | "طردت القوات الصهيونية ما بين 50,000 و70,000 فلسطيني" | "Zionist forces expelled between 50,000 and 70,000 Palestinians" | Gives an expellee figure and "Zionist forces"; English lead names the IDF and gives no expellee number. |
| | fa | "نیروهای نظامی اسرائیل ... میان ۵۰٬۰۰۰ تا ۷۰٬۰۰۰ تن ... به‌زور بیرون راندند" | "Israeli military forces ... forcibly expelled between 50,000 and 70,000" | Same figure, uses "Israeli military forces". No Hebrew article in the interlanguage links. |
| Battle of Jenin (2002) | he | "מבצע חומת מגן ... למיגור הטרור הפלסטיני" ... "האשמות של הפלסטינים (שהופרכו בסופו של דבר) על טבח" ... "רובם מחבלים חמושים" | "Operation Defensive Shield to eradicate Palestinian terror" ... "the Palestinians' accusations (which were ultimately refuted) of a massacre" ... "most of them armed terrorists" | Frames the operation as counter-terror, states in its own voice that the massacre claim was refuted, and labels most of the dead "terrorists"; English attributes findings to "subsequent investigations" and says "Palestinian militants". |
| | ar | title "مجزرة جنين" ... "منحازا بشكل واضح للكيان الصهيوني" | "Jenin massacre" ... "clearly biased toward the Zionist entity" | Article title says massacre; the lead itself calls the UN report clearly biased. |
| | fa | "نبرد جنین" ... "۲۳ نظامی اسرائیلی و ۱۵۲ فلسطینی که اکثرأ شهروندان غیرنظامی بودند" | "Battle of Jenin" ... "23 Israeli soldiers and 152 Palestinians who were mostly civilians" | Title says battle (as English), but the casualty figure and civilian share differ from English (52-54 Palestinians, "including civilians"); the figure looks like an older or different source. |
| Gaza War (2008-09) | ar | "الهجوم على غزة أو بقعة الزيت اللاهب أو مجزرة غزة" ... "خرق التهدئة من قبل الجانب الإسرائيلي" | "The attack on Gaza, or Hot Oil Spot, or the Gaza massacre" ... "violation of the truce by the Israeli side" | Presents the truce violation as Israeli in its own voice; the English lead gives both sides' claims. |
| | he | "מבצע עופרת יצוקה ... בעקבות ירי רקטות מהרצועה על אזרחים" | "Operation Cast Lead ... following rocket fire from the Strip on civilians" | Uses the Israeli operation name as title and gives rocket fire as the cause. |
| | tr | "İsrail'in harekât süresince sadece 3 vatandaşı hayatını kaybederken ... Gazze'de 1133 kişi ölmüş" | "While Israel lost only 3 citizens ... 1,133 died in Gaza" | Casualty framing with "only" and different number from English (1,166-1,417). |
| Qana massacre | ar | "قوات الاحتلال الإسرائيلي" ... "استشهاد 106 من المدنيين" | "Israeli occupation forces" ... "the martyrdom of 106 civilians" | Uses "occupation forces" and the religiously marked "martyrdom"; adds that the US vetoed a Security Council resolution. |
| | fa | "ارتش اسرائیل ... زیر آتش سنگین توپخانه‌ای قرار داد" | "the Israeli army put ... under heavy artillery fire" | Mirrors English including the UN finding of deliberate shelling. |
| Tel al-Sultan attack | ar | "مجزرة ارتكبها سلاح الجو الإسرائيلي" | "a massacre committed by the Israeli Air Force" | Massacre in own voice, agent named, "one of dozens of massacres". |
| | he | "אסון תל א-סולטאן" ... "שני בכירים ב'מטה הגדה' של ארגון הטרור חמאס" | "The Tel al-Sultan disaster" ... "two senior officials of the 'West Bank HQ' of the terror organization Hamas" | Title uses "disaster"; leads with the Israeli-stated target and the IDF assessment that a Hamas weapons store may have caused the fire. |
| | fa | "اسرائیل مدعی شد ... به‌طور تصادفی آتش را شروع کرده است" | "Israel claimed ... it started the fire accidentally" | Mirrors English. |
| Ahvaz military parade attack | tr | "İran bu olayı bir terör saldırı olarak açıkladı" | "Iran described this event as a terror attack" | Attributes the label to Iran; English uses "deadliest terrorist attack in Iran" in own voice. |
| | fa | "ضمن تروریستی نامیدن این حمله ... محکوم کردند" | "while calling this attack terrorist, condemned it" | Lists countries and bodies that condemned it as terrorism. |
| | ar | "قام مسلحون بإطلاق النار" | "gunmen opened fire" | No terrorism vocabulary in the part I read. |
| Assassination of Ali Khamenei | he | "תקיפה אווירית ממוקדת ... חוסל" | "a targeted air strike ... was eliminated" | Names the operation ("Roaring Lion" in my reading), describes a strike; no mention of celebration in the part I read. |
| | ar / fa / tr | "اغتيل" / "کشته شد" / "suikaste uğrayarak öldü" | "was assassinated" / "was killed" / "died after being assassinated" | Arabic and Turkish use "assassinated", Persian uses "killed"; all three carry the celebrations-and-mourning sentence. |
| 1982 Lebanon War | he | "מלחמה בין ישראל לסוריה וארגוני טרור פלסטיניים" | "a war between Israel and Syria and Palestinian terror organizations" | "Terror organizations" for PLO groups; gives 655 Israeli soldiers and about 10,000 Lebanese-side deaths, numbers absent from the English extract. |
| | ar | "الغزو الإسرائيلي للبنان" ... "قامت إسرائيل باحتلال جنوب لبنان" | "the Israeli invasion of Lebanon" ... "Israel occupied south Lebanon" | Lists "invasion" as an alternate name and "occupation" in own voice. |
| | tr | "güney Lübnan'ı işgal etmesiyle" | "with its occupation of southern Lebanon" | Uses "occupation" verb form. |
| Sabena Flight 571 | he | "מחבלים מארגון 'ספטמבר השחור'" | "terrorists from the 'Black September' organization" | Hebrew uses "terrorists" for individuals; English "Palestinian terrorist group". |
| | ar | "جماعة فلسطينية مسلحة" | "an armed Palestinian group" | No "terrorist"; both languages otherwise agree on the facts. |
| Armenian genocide (bonus) | tr | "Ermeni Kırımı, 1915 Olayları, Ermeni Tehciri veya Ermeni Soykırımı" ... "sayı ... 600.000 ile 1,5 milyon arasında" | "Armenian Massacre, the 1915 Events, the Armenian Deportation or the Armenian Genocide" ... "number between 600,000 and 1.5 million" | Lists "1915 Events" and "Deportation" alongside "Genocide", calls the number disputed; English lead gives "around one million" and says genocide in own voice. |
| | ar / fa / he | "الإبادة الجماعية" / "نسل‌کشی" / "רצח עם" | "genocide" | All three say genocide in the first words. |
| Al-Anfal (bonus) | fa | "بیش از ۱۸۰٬۰۰۰ نفر ... قتل‌عام کردند" | "massacred more than 180,000" | Bare figure in own voice, versus English "between 50,000 and 100,000" attributed to HRW. |

Summary of differences (observations): Hebrew leads use the vocabulary of terror ("terror", "terrorists") for Palestinian actors and often state operational aims in Israeli official terms; Arabic leads more often use "massacre" (title or lead), "occupation" and "martyrdom" and sometimes evaluate a source as biased; Persian leads sometimes carry stronger or larger numbers and "terrorist" for attacks against Iran or Israeli targets alike; Turkish leads are often close translations of English but attribute labels (Ahvaz) or list alternative names (Armenian). The English lead sits between these in the cases above, but this is an impression from 12 events. Caveat: these are the current versions of different volunteer communities' articles; I cannot say which reflect a "true" framing.

## Limitations

- **My own bias.** I am a language model trained on text that overrepresents English-language and Western sources. My reading of what counts as "loaded", "balanced" or "omitted" reflects that. I tried to anchor every finding in a verbatim quotation and to describe features (who is the subject, whether a number is attributed) rather than judge truth, but the choice of which features to look for is mine. The rubric item "omitted perspective" is the most subjective.
- **One reviewer, no inter-rater check.** No second reader, no agreement statistic.
- **Sampling.** n = 60 of 394, seeded but not proportionate; contested topics were oversampled by design. The seeded draw missed Armenian genocide and Cyprus (none exist in the dataset). Israeli-actor events are frequent in the sample because they are frequent in the data (120 of 394 events are tagged Israel/Palestine), so my flagged omissions of "the Israeli account" are numerous partly for that reason; I flagged the mirror omission where I found it (King David Hotel warnings dispute, Karantina, Sabena). I did not test symmetric treatment with a matched-pairs design.
- **Point in time.** Live leads fetched 2026-09-26; the stored extracts were retrieved earlier (2026-09). Some 2026 articles (Khamenei, Iran war, Yemen) change daily.
- **English focus.** The full review is of English text. The cross-language part covers 12 events, first 1,000-1,100 characters, with my limited reading of Persian and moderate reading of Hebrew, Arabic and Turkish. I did not read Kurdish, Armenian or Greek Wikipedia.
- **Label counts.** Actor assignment for the label counts is by my reading of the extract; the categories of small groups (n = 26 and 34) cannot support statistical claims. Ten of the 26 are one day's events. I did not verify the Wikidata items for all 152 events, only 20.
- **Not assessed:** Wikipedia article bodies beyond the lead; images and captions; coordinates; dates (beyond noticing mismatches); whether the events are the right ones to include; the UI (I did not look at how the site renders `category` or the extract); talk-page disputes; source quality of the numbers I quoted; Wikidata edit histories (I did not check whether a class was recently changed or by whom).

## Reproducibility

Scripts in `docs/bias-review/`: `sample.py` (seeded draw), `fetch_leads.py`, `fetch_xlang.py`, `fetch_supp.py`, `wd.py` and `wd2.py` (Wikidata checks), `assess.py` (my hand-written findings), `build.py` (generates the JSON and this file). Intermediate `_*.json/_*.txt` files hold raw API output.
