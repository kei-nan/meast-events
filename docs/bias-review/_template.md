# Wording and label review: what atlas.wiki displays versus what Wikipedia and Wikidata say

Reviewer: one AI model (Claude), read-only research, 2026-09-26. This document surfaces quoted passages and checkable observations for the human owner to judge. It does not say who is right about any conflict. Ratings are prompts for a human look, not verdicts. Every quoted passage below was machine-checked to be a verbatim substring of the extract stored in `data/events.json` or of the live English Wikipedia lead fetched on 2026-09-26.

Companion file: `docs/bias-review/sample-wording.json` (all 60 events with the shown extract, the fetched live lead, findings and quotes).

## Headline findings (read this first)

1. **The displayed extract is usually shorter than the live lead, and what is cut is frequently the other side's account.** 50 of 60 sampled extracts stop before the end of the live lead. For {{TRUNCSHORT}} of the 12 events rated "worth a human look" I recorded at least one item of material content (a second party's account, a denial, a casualty range, a UN finding) that appears only in the part after the extract; the clearest cases are (Jenin 2002, Qana 1996, Tel al-Sultan 2024, Gaza War 2008-09, Lydda/Ramle 1948, Karantina 1976, Aleppo 2012-16). This is not a 545-character cut: there is no 545 limit in the stored data (max stored extract {{EXTMAX}} characters, median {{EXTMED}}, {{EXTOVER}} of 394 over 545). In the cases I read, the stored `extract` ends at a sentence or paragraph boundary and looks like Wikipedia's summary text; I did not inspect how the front end truncates or renders it.
2. **The `category` shown on the site is often not "Wikidata's class for the item" in the sense DATA_POLICY.md describes.** (a) {{LEG}} events (curated/legacy set, no `wikidata_classes` field) carry coarse legacy labels ({{LEGC}}), not Wikidata classes; for example the Armenian genocide is shown as "political" although Wikidata's own P31 for it today includes "genocide". (b) For the other events, `category` is "the first class the item was found under" (`scripts/enrich-candidates.js`, line 78-79), i.e. it depends on the order of the query loop, not on Wikidata. {{MULTI}} events have two or more stored classes and only the first is displayed (details in the label section). (c) Classes are matched through subclass chains (`P31/P279*`), so an item whose own Wikidata class is "bomb attack" is displayed as "terrorist attack".
3. **Label pattern by actor type, not by side alone, but with visible asymmetries** (section "Label consistency"). In the Israeli-Palestinian set I could classify by actor, non-state Palestinian/Arab/Islamist attacks on Israelis or Jews are shown as "massacre" (17 of 26), "terrorist attack" (6), "aircraft hijacking" (2) or "military operation" (1). Israeli state or pre-state Zionist actions are shown as "massacre" (13 of 34), "military operation" (10), "assassination" (6), "terrorist attack" (3), "war crime" (1) and "population transfer" (1). The "terrorist attack" label appears once for an Israeli air strike (Bahr El-Baqar school, 1970), where Wikipedia\'s lead itself says the designation is disputed, and once for the 2022 Al-Aqsa clashes, whose extract describes clashes rather than an attack.
4. **Own-voice loaded terms are present in about half the sample**, spread across sides and regions: "terrorist attack/group/action" (King David Hotel, Sabena 571, Sharm el-Sheikh, Ahvaz), "massacre" (Simele, Nisour Square), "genocide" (Sinjar), "war crimes" (Abu Ghraib), "regime" and "totalitarian hereditary dictatorship" (Assad), "Ba\'athist" (Aleppo), "occupied" and "invaded" (Jenin, Qana, South Lebanon, 1982 war). Wikipedia usually names the actor when it uses them. The sample is too small to say whether one side is favoured.
5. **A data problem, not a bias problem:** the record titled "Israeli withdrawal from Lebanon" displays the extract of the "South Lebanon conflict (1985-2000)" article (its `wikipedia_url`); "Operation Olive Branch" has `date_start` 2019-08-09 while its extract says the operation ended 18 March 2018; the "Fall of the Assad regime" extract says "1971" where the live lead now says "1970" (stale extract); "Battle off the coast of Abkhazia" is filed under Turkey.
6. **Cross-language leads differ in ways worth a look** (section "Cross-language comparison"): e.g. Hebrew leads use "terror" vocabulary for Palestinian actors and state Israeli aims; Arabic leads use "massacre" titles and "occupation forces" and in one case call a UN report "clearly biased"; Turkish and Persian leads often mirror the English lead. Details and my reading limits below.

## Method

**Sample.** 60 events from `data/events.json` (394 events), seeded with Python `random.Random(20260928)` (Mersenne Twister, script `docs/bias-review/sample.py`; event ids sorted before shuffling so the draw is reproducible). Four eras x 15 events: before 1948, 1948-1990, 1991-2010, 2011 onward (by `date_start` year). Within each era, up to 5 events were drawn from a non-contested pool and the rest (10 or more) from a "contested" pool (first country Israel/Palestine, Lebanon, Syria, Iran, Egypt, Bahrain or Kuwait, or a keyword in the title/first 200 characters of the extract: armenian, kurd, cyprus, gulf, bahrain, hamas, gaza, intifada, palestin, israel, hezbollah, lebanon, syria, iran, egypt, turk). Inside each pool the draw rotates through Wikidata category labels in a random order, so categories are stratified. Result: in every era 10 events came from the contested pool and 5 from the non-contested pool (40 and 20 overall; see the JSON `contested_pool` field). The contested pool is broad (it covers most of the dataset), so "contested" here means "tagged by these keywords/countries", not a judgement that the event is disputed.

**Known sampling gap:** the seeded draw happened to include no Armenian-genocide event and no Cyprus event. The dataset has no Cyprus events at all (Cyprus is not among the 15 tracked countries). I therefore added a **separate, non-random supplementary set** of 10 Armenian, Kurdish and Egypt/Turkey items (section "Supplementary contested items"), not counted in any table.

**Live lead.** English Wikipedia API `action=query&prop=extracts&exintro&explaintext&redirects`, User-Agent `AtlasWiki/0.1 (contact: jonkeinan@gmail.com)`, 0.5 s between requests, fetched 2026-09-26. "Full lead" means the API's intro extract (all paragraphs before the first heading), plain text. The Wikipedia articles can change after that date, and several (2026 events) are changing quickly.

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

{{AGG}}

Rating of the **full live lead** (same events):

{{AGGFULL}}

Events with at least one finding under each rubric item (an event can appear under several):

{{RUB}}

{{TRUNC}}

Cautions: strata have 15 events each (contested/non-contested 40/20); a single event moves a percentage by about 7 points; the contested pool is contested by construction, so its higher flag rate is partly a consequence of the sampling and of my own attention going where I was told to look. The rise across eras (more "worth a look" in later eras) partly reflects that later Wikipedia leads are longer, more source-attributed and more recent, and that the recent contested items (2023-2026) are concentrated in Israel/Palestine and Iran.

## Per-event table (all 60)

{{TABLE}}

## The ten most notable items, with quotes

Chosen by how much the displayed text differs from what the full lead or the record itself shows, not by which party is involved. Other events rated "worth a human look" are in the table: Khamenei assassination (#47), Saudi-led intervention in Yemen (#58).

{{TOP10}}
## Label consistency (Wikidata class shown as `category`)

### How the label is produced (checked in the repository)

- `docs/DATA_POLICY.md`: "`category` is Wikidata's own class label for the item ... presented as Wikidata's classification".
- `scripts/enrich-candidates.js` line 78-79: `category: classes[0] ?? candidate.category` with the comment "first class the item was found under". `scripts/discover-events.js` queries classes in the order of `EVENT_CLASSES` (battle, war, military operation, treaty, coup d'etat, assassination, genocide, massacre, terrorist attack, revolution, ...). So an item that Wikidata places under several matching classes is shown under the earliest class in that list. "massacre" precedes "terrorist attack" and "war crime".
- Matching uses `P31/P279*` (instance of, following subclass-of). The displayed label can therefore be an ancestor class, not the class Wikidata states on the item.
- {{LEG}} events have no `wikidata_classes` field; their `category` is a legacy coarse group ({{LEGC}}). No event in the data is labelled "genocide" even though "genocide" is in the class list.

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

{{LABELTABLE}}

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
