# Events without a precise location

Generated 2026-10-06T20:42:56.307Z by `node scripts/enrich-candidates.js`.

These events have **no coordinates on Wikipedia or Wikidata**, so middleeast.events can only pin them at a
country-capital fallback (curated events only, labelled "approximate location") or not at all. Candidate events in
the second table ARE included in `data/events.proposed.json` with `location_quality: "none"` and
`coordinates: null` (listed and searchable, but no map marker; a location is never invented).

The fix belongs upstream: if you know the real location of an event, you can add a coordinate location
(property **P625**) to its Wikidata item (linked below) with a reference. This pipeline never invents
coordinates and never edits Wikipedia or Wikidata. Rows are sorted by significance = number of Wikimedia
sitelinks (the same objective signal used for inclusion; it is a proxy, see docs/DATA_POLICY.md).

## 1. Curated events (data/events.json) lacking a precise location - 272

| # | Event | Date | Sitelinks | Current fallback | Wikipedia | Wikidata |
|---|---|---|---|---|---|---|
| 1 | World War II | 1939-09-01 | 291 | no location | [article](https://en.wikipedia.org/wiki/World_War_II) | [Q362](https://www.wikidata.org/wiki/Q362) |
| 2 | World War I | 1914-07-28 | 264 | no location | [article](https://en.wikipedia.org/wiki/World_War_I) | [Q361](https://www.wikidata.org/wiki/Q361) |
| 3 | Saddam Hussein | 1979-07-16 | 171 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Saddam_Hussein) | [Q1316](https://www.wikidata.org/wiki/Q1316) |
| 4 | Islamic State | 2014-06-29 | 160 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Islamic_State) | [Q2429253](https://www.wikidata.org/wiki/Q2429253) |
| 5 | Hamas | 1987-12-14 | 149 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Hamas) | [Q38799](https://www.wikidata.org/wiki/Q38799) |
| 6 | Armenian genocide | 1915-04-24 | 125 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Armenian_genocide) | [Q80034](https://www.wikidata.org/wiki/Q80034) |
| 7 | Gaza war | 2023-10-07 | 119 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Gaza_war) | [Q122962941](https://www.wikidata.org/wiki/Q122962941) |
| 8 | Gulf War | 1990-08-02 | 114 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Gulf_War) | [Q37643](https://www.wikidata.org/wiki/Q37643) |
| 9 | Arab Spring | 2010-12-18 | 112 | no location | [article](https://en.wikipedia.org/wiki/Arab_Spring) | [Q33761](https://www.wikidata.org/wiki/Q33761) |
| 10 | Iraq War | 2003-03-20 | 110 | no location | [article](https://en.wikipedia.org/wiki/Iraq_War) | [Q545449](https://www.wikidata.org/wiki/Q545449) |
| 11 | Six-Day War | 1967-06-05 | 108 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Six-Day_War) | [Q49077](https://www.wikidata.org/wiki/Q49077) |
| 12 | Iranian Revolution | 1978-01-07 | 102 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iranian_Revolution) | [Q126065](https://www.wikidata.org/wiki/Q126065) |
| 13 | 2026 Iran war | 2026-01-01 | 101 | no location | [article](https://en.wikipedia.org/wiki/2026_Iran_war) | [Q138503695](https://www.wikidata.org/wiki/Q138503695) |
| 14 | Hafez al-Assad | 1970-11-13 | 96 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Hafez_al-Assad) | [Q118725](https://www.wikidata.org/wiki/Q118725) |
| 15 | Iran–Iraq War | 1980-09-22 | 96 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93Iraq_War) | [Q82664](https://www.wikidata.org/wiki/Q82664) |
| 16 | Yom Kippur War | 1973-10-06 | 94 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Yom_Kippur_War) | [Q49100](https://www.wikidata.org/wiki/Q49100) |
| 17 | Gaza genocide | 2023-10-07 | 91 | no location | [article](https://en.wikipedia.org/wiki/Gaza_genocide) | [Q124086054](https://www.wikidata.org/wiki/Q124086054) |
| 18 | Palestine Liberation Organization | 1964-05-28 | 90 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Palestine_Liberation_Organization) | [Q26683](https://www.wikidata.org/wiki/Q26683) |
| 19 | Suez Crisis | 1956-10-29 | 87 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Suez_Crisis) | [Q49101](https://www.wikidata.org/wiki/Q49101) |
| 20 | Balfour Declaration | 1917-11-02 | 86 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Balfour_Declaration) | [Q187152](https://www.wikidata.org/wiki/Q187152) |
| 21 | Balkan Wars | 1912-10-08 | 80 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Balkan_Wars) | [Q165725](https://www.wikidata.org/wiki/Q165725) |
| 22 | 2016 Turkish coup d'état attempt | 2016-07-16 | 77 | no location | [article](https://en.wikipedia.org/wiki/2016_Turkish_coup_d'%C3%A9tat_attempt) | [Q25906338](https://www.wikidata.org/wiki/Q25906338) |
| 23 | Twelve-Day War | 2025-06-13 | 76 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Twelve-Day_War) | [Q134900605](https://www.wikidata.org/wiki/Q134900605) |
| 24 | Treaty of Lausanne | 1923-07-24 | 74 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Treaty_of_Lausanne) | [Q193258](https://www.wikidata.org/wiki/Q193258) |
| 25 | 2006 Lebanon War | 2006-07-12 | 74 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/2006_Lebanon_War) | [Q49104](https://www.wikidata.org/wiki/Q49104) |
| 26 | Treaty of Sèvres | 1920-08-10 | 68 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Treaty_of_S%C3%A8vres) | [Q182515](https://www.wikidata.org/wiki/Q182515) |
| 27 | Turkish War of Independence | 1919-05-19 | 68 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Turkish_War_of_Independence) | [Q234738](https://www.wikidata.org/wiki/Q234738) |
| 28 | Sykes–Picot Agreement | 1916-05-16 | 67 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Sykes%E2%80%93Picot_Agreement) | [Q211674](https://www.wikidata.org/wiki/Q211674) |
| 29 | 2025–2026 Iranian protests | 2025-12-28 | 65 | no location | [article](https://en.wikipedia.org/wiki/2025%E2%80%932026_Iranian_protests) | [Q137612545](https://www.wikidata.org/wiki/Q137612545) |
| 30 | 1948 Palestine war | 1947-11-30 | 64 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/1948_Palestine_war) | [Q49097](https://www.wikidata.org/wiki/Q49097) |
| 31 | Lebanese Civil War | 1975-04-13 | 64 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/Lebanese_Civil_War) | [Q208484](https://www.wikidata.org/wiki/Q208484) |
| 32 | Oslo Accords | 1993-09-13 | 63 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Oslo_Accords) | [Q17013132](https://www.wikidata.org/wiki/Q17013132) |
| 33 | Italo-Turkish War | 1911-09-29 | 62 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Italo-Turkish_War) | [Q203824](https://www.wikidata.org/wiki/Q203824) |
| 34 | Gaza War (2008–2009) | 2008-12-27 | 62 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Gaza_War_(2008%E2%80%932009)) | [Q170682](https://www.wikidata.org/wiki/Q170682) |
| 35 | 2014 Gaza War | 2014-01-01 | 61 | no location | [article](https://en.wikipedia.org/wiki/2014_Gaza_War) | [Q17324420](https://www.wikidata.org/wiki/Q17324420) |
| 36 | 1973 oil crisis | 1973-10-17 | 60 | pin at Saudi Arabia capital (approximate) | [article](https://en.wikipedia.org/wiki/1973_oil_crisis) | [Q316817](https://www.wikidata.org/wiki/Q316817) |
| 37 | Yemeni civil war (2014–present) | 2014-09-16 | 59 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/Yemeni_civil_war_(2014%E2%80%93present)) | [Q19686631](https://www.wikidata.org/wiki/Q19686631) |
| 38 | Nakba | 1948-05-15 | 57 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Nakba) | [Q3266633](https://www.wikidata.org/wiki/Q3266633) |
| 39 | Arab Revolt | 1916-06-10 | 56 | pin at Saudi Arabia capital (approximate) | [article](https://en.wikipedia.org/wiki/Arab_Revolt) | [Q239060](https://www.wikidata.org/wiki/Q239060) |
| 40 | 1982 Lebanon War | 1982-06-06 | 55 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/1982_Lebanon_War) | [Q49103](https://www.wikidata.org/wiki/Q49103) |
| 41 | Greco-Turkish War (1919–1922) | 1919-05-15 | 55 | no location | [article](https://en.wikipedia.org/wiki/Greco-Turkish_War_(1919%E2%80%931922)) | [Q87138](https://www.wikidata.org/wiki/Q87138) |
| 42 | Mahsa Amini protests | 2022-09-16 | 53 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Mahsa_Amini_protests) | [Q114065797](https://www.wikidata.org/wiki/Q114065797) |
| 43 | 1953 Iranian coup d'état | 1953-08-15 | 51 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/1953_Iranian_coup_d'%C3%A9tat) | [Q593774](https://www.wikidata.org/wiki/Q593774) |
| 44 | First Intifada | 1987-12-08 | 51 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/First_Intifada) | [Q49105](https://www.wikidata.org/wiki/Q49105) |
| 45 | United Nations Partition Plan for Palestine | 1947-11-29 | 50 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/United_Nations_Partition_Plan_for_Palestine) | [Q846795](https://www.wikidata.org/wiki/Q846795) |
| 46 | Central Treaty Organization | 1955-02-24 | 50 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Central_Treaty_Organization) | [Q379850](https://www.wikidata.org/wiki/Q379850) |
| 47 | Camp David Accords | 1978-09-17 | 50 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Camp_David_Accords) | [Q309204](https://www.wikidata.org/wiki/Q309204) |
| 48 | 1948 Arab–Israeli War | 1948-05-15 | 50 | no location | [article](https://en.wikipedia.org/wiki/1948_Arab%E2%80%93Israeli_War) | [Q49092](https://www.wikidata.org/wiki/Q49092) |
| 49 | Egyptian revolution of 1952 | 1952-07-23 | 49 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Egyptian_revolution_of_1952) | [Q1780431](https://www.wikidata.org/wiki/Q1780431) |
| 50 | 2003 invasion of Iraq | 2003-03-20 | 49 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/2003_invasion_of_Iraq) | [Q107802](https://www.wikidata.org/wiki/Q107802) |
| 51 | Second Intifada | 2000-09-28 | 48 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Second_Intifada) | [Q49106](https://www.wikidata.org/wiki/Q49106) |
| 52 | June 2025 Israeli strikes on Iran | 2025-06-01 | 48 | no location | [article](https://en.wikipedia.org/wiki/List_of_attacks_during_the_Twelve-Day_War) | [Q134884640](https://www.wikidata.org/wiki/Q134884640) |
| 53 | Young Turk Revolution | 1908-07-03 | 46 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Young_Turk_Revolution) | [Q4298662](https://www.wikidata.org/wiki/Q4298662) |
| 54 | Qatar diplomatic crisis | 2017-06-05 | 46 | pin at Qatar capital (approximate) | [article](https://en.wikipedia.org/wiki/Qatar_diplomatic_crisis) | [Q30130610](https://www.wikidata.org/wiki/Q30130610) |
| 55 | 2024 Lebanon electronic device attacks | 2024-09-18 | 46 | no location | [article](https://en.wikipedia.org/wiki/2024_Lebanon_electronic_device_attacks) | [Q130314422](https://www.wikidata.org/wiki/Q130314422) |
| 56 | Black September | 1970-09-16 | 45 | pin at Jordan capital (approximate) | [article](https://en.wikipedia.org/wiki/Black_September) | [Q154288](https://www.wikidata.org/wiki/Q154288) |
| 57 | Iraqi invasion of Kuwait | 2009-08-02 | 45 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_invasion_of_Kuwait) | [Q856650](https://www.wikidata.org/wiki/Q856650) |
| 58 | 2019 Turkish offensive into northeastern Syria | 2019-01-01 | 41 | no location | [article](https://en.wikipedia.org/wiki/2019_Turkish_offensive_into_northeastern_Syria) | [Q70207089](https://www.wikidata.org/wiki/Q70207089) |
| 59 | Anglo-Iraqi War | 1941-05-02 | 40 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Anglo-Iraqi_War) | [Q696848](https://www.wikidata.org/wiki/Q696848) |
| 60 | Yemeni revolution | 2011-01-27 | 40 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/Yemeni_revolution) | [Q210005](https://www.wikidata.org/wiki/Q210005) |
| 61 | Abraham Accords | 2020-09-15 | 40 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Abraham_Accords) | [Q99495661](https://www.wikidata.org/wiki/Q99495661) |
| 62 | Iran nuclear deal | 2015-07-14 | 39 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iran_nuclear_deal) | [Q17001802](https://www.wikidata.org/wiki/Q17001802) |
| 63 | White Revolution | 1963-01-01 | 39 | no location | [article](https://en.wikipedia.org/wiki/White_Revolution) | [Q1068139](https://www.wikidata.org/wiki/Q1068139) |
| 64 | Montreux Convention Regarding the Regime of the Straits | 1936-01-01 | 38 | no location | [article](https://en.wikipedia.org/wiki/Montreux_Convention_Regarding_the_Regime_of_the_Straits) | [Q869500](https://www.wikidata.org/wiki/Q869500) |
| 65 | 2017 Turkish constitutional referendum | 2017-04-16 | 38 | no location | [article](https://en.wikipedia.org/wiki/2017_Turkish_constitutional_referendum) | [Q28062036](https://www.wikidata.org/wiki/Q28062036) |
| 66 | 1936–1939 Arab revolt in Palestine | 1936-04-19 | 36 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/1936%E2%80%931939_Arab_revolt_in_Palestine) | [Q46057](https://www.wikidata.org/wiki/Q46057) |
| 67 | Constitutionalization attempts in Iran | 1905-01-01 | 36 | no location | [article](https://en.wikipedia.org/wiki/Constitutionalization_attempts_in_Iran) | [Q1368440](https://www.wikidata.org/wiki/Q1368440) |
| 68 | 2017 Kurdistan Region independence referendum | 2017-09-25 | 36 | no location | [article](https://en.wikipedia.org/wiki/2017_Kurdistan_Region_independence_referendum) | [Q18206659](https://www.wikidata.org/wiki/Q18206659) |
| 69 | Red Sea crisis | 2023-10-19 | 36 | no location | [article](https://en.wikipedia.org/wiki/Red_Sea_crisis) | [Q123285238](https://www.wikidata.org/wiki/Q123285238) |
| 70 | Mecca Joint Defence Agreement | 2026-08-07 | 36 | no location | [article](https://en.wikipedia.org/wiki/Mecca_Joint_Defence_Agreement) | [Q140932341](https://www.wikidata.org/wiki/Q140932341) |
| 71 | Jordanian independence | 1946-05-25 | 35 | pin at Jordan capital (approximate) | [article](https://en.wikipedia.org/wiki/History_of_Jordan) | [Q1639050](https://www.wikidata.org/wiki/Q1639050) |
| 72 | Jewish exodus from the Muslim world | 1948-01-01 | 34 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Jewish_exodus_from_the_Muslim_world) | [Q276172](https://www.wikidata.org/wiki/Q276172) |
| 73 | Egypt–Israel peace treaty | 1979-03-26 | 34 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Egypt%E2%80%93Israel_peace_treaty) | [Q1129412](https://www.wikidata.org/wiki/Q1129412) |
| 74 | Syria–Lebanon campaign | 1941-06-08 | 33 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Syria%E2%80%93Lebanon_campaign) | [Q770698](https://www.wikidata.org/wiki/Q770698) |
| 75 | 14 July Revolution | 1958-07-14 | 33 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/14_July_Revolution) | [Q2988530](https://www.wikidata.org/wiki/Q2988530) |
| 76 | North Yemen civil war | 1962-09-26 | 33 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/North_Yemen_civil_war) | [Q521199](https://www.wikidata.org/wiki/Q521199) |
| 77 | Fall of the Assad regime | 2024-11-27 | 33 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Fall_of_the_Assad_regime) | [Q131404510](https://www.wikidata.org/wiki/Q131404510) |
| 78 | Israel–Jordan peace treaty | 1994-10-26 | 32 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Israel%E2%80%93Jordan_peace_treaty) | [Q620988](https://www.wikidata.org/wiki/Q620988) |
| 79 | Iran–Saudi Arabia proxy war | 1979-02-11 | 32 | no location | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93Saudi_Arabia_proxy_war) | [Q22948406](https://www.wikidata.org/wiki/Q22948406) |
| 80 | War in Iraq (2013–2017) | 2014-01-01 | 32 | no location | [article](https://en.wikipedia.org/wiki/War_in_Iraq_(2013%E2%80%932017)) | [Q17984356](https://www.wikidata.org/wiki/Q17984356) |
| 81 | 2025–2026 Iran massacres | 2025-12-30 | 32 | no location | [article](https://en.wikipedia.org/wiki/2025%E2%80%932026_Iran_massacres) | [Q137703947](https://www.wikidata.org/wiki/Q137703947) |
| 82 | Hezbollah–Israel conflict (2023–present) | 2024-09-23 | 31 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/Hezbollah%E2%80%93Israel_conflict_(2023%E2%80%93present)) | [Q122974556](https://www.wikidata.org/wiki/Q122974556) |
| 83 | 1980 Turkish coup d'état | 1980-09-12 | 31 | no location | [article](https://en.wikipedia.org/wiki/1980_Turkish_coup_d'%C3%A9tat) | [Q1758028](https://www.wikidata.org/wiki/Q1758028) |
| 84 | Saudi-led intervention in the Yemeni civil war | 2015-03-26 | 30 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/Saudi-led_intervention_in_the_Yemeni_civil_war) | [Q19682450](https://www.wikidata.org/wiki/Q19682450) |
| 85 | Dersim massacre | 1937-05-01 | 30 | no location | [article](https://en.wikipedia.org/wiki/Dersim_massacre) | [Q1327772](https://www.wikidata.org/wiki/Q1327772) |
| 86 | Operation Prosperity Guardian | 2023-12-18 | 30 | no location | [article](https://en.wikipedia.org/wiki/Operation_Prosperity_Guardian) | [Q123912788](https://www.wikidata.org/wiki/Q123912788) |
| 87 | 1919 Egyptian revolution | 1919-01-01 | 29 | no location | [article](https://en.wikipedia.org/wiki/1919_Egyptian_revolution) | [Q1993171](https://www.wikidata.org/wiki/Q1993171) |
| 88 | Arab Winter | 2012-01-01 | 29 | no location | [article](https://en.wikipedia.org/wiki/Arab_Winter) | [Q17512479](https://www.wikidata.org/wiki/Q17512479) |
| 89 | United States–Taliban deal | 2020-02-29 | 29 | no location | [article](https://en.wikipedia.org/wiki/United_States%E2%80%93Taliban_deal) | [Q107354956](https://www.wikidata.org/wiki/Q107354956) |
| 90 | 2024 Lebanon war | 2024-10-01 | 28 | no location | [article](https://en.wikipedia.org/wiki/2024_Lebanon_war) | [Q130388076](https://www.wikidata.org/wiki/Q130388076) |
| 91 | Franco-Syrian War | 1920-04-08 | 27 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Franco-Syrian_War) | [Q2992403](https://www.wikidata.org/wiki/Q2992403) |
| 92 | Cedar Revolution | 2005-02-14 | 27 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/Cedar_Revolution) | [Q184310](https://www.wikidata.org/wiki/Q184310) |
| 93 | Operation Nemesis | 1920-01-01 | 27 | no location | [article](https://en.wikipedia.org/wiki/Operation_Nemesis) | [Q2475091](https://www.wikidata.org/wiki/Q2475091) |
| 94 | Iran–Israel proxy conflict | 1985-02-16 | 27 | no location | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93Israel_proxy_conflict) | [Q15059994](https://www.wikidata.org/wiki/Q15059994) |
| 95 | Great Syrian Revolt | 1925-07-18 | 26 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Great_Syrian_Revolt) | [Q1968718](https://www.wikidata.org/wiki/Q1968718) |
| 96 | 1963 Syrian coup d'état | 1963-03-08 | 26 | no location | [article](https://en.wikipedia.org/wiki/1963_Syrian_coup_d'%C3%A9tat) | [Q2475925](https://www.wikidata.org/wiki/Q2475925) |
| 97 | 1998 bombing of Iraq | 1998-01-01 | 26 | no location | [article](https://en.wikipedia.org/wiki/1998_bombing_of_Iraq) | [Q1327861](https://www.wikidata.org/wiki/Q1327861) |
| 98 | Operation Inherent Resolve | 2014-09-22 | 26 | no location | [article](https://en.wikipedia.org/wiki/Operation_Inherent_Resolve) | [Q18357664](https://www.wikidata.org/wiki/Q18357664) |
| 99 | Black Sea Grain Initiative | 2022-07-22 | 26 | no location | [article](https://en.wikipedia.org/wiki/Black_Sea_Grain_Initiative) | [Q113295397](https://www.wikidata.org/wiki/Q113295397) |
| 100 | Israeli disengagement from the Gaza Strip | 2005-08-15 | 25 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Israeli_disengagement_from_the_Gaza_Strip) | [Q196122](https://www.wikidata.org/wiki/Q196122) |
| 101 | Kurdish–Turkish conflict | 1921-03-06 | 25 | no location | [article](https://en.wikipedia.org/wiki/Kurdish%E2%80%93Turkish_conflict) | [Q6445763](https://www.wikidata.org/wiki/Q6445763) |
| 102 | Sheikh Said rebellion | 1925-02-13 | 25 | no location | [article](https://en.wikipedia.org/wiki/Sheikh_Said_rebellion) | [Q619712](https://www.wikidata.org/wiki/Q619712) |
| 103 | 1960 Turkish coup d'état | 1960-05-27 | 25 | no location | [article](https://en.wikipedia.org/wiki/1960_Turkish_coup_d'%C3%A9tat) | [Q1859259](https://www.wikidata.org/wiki/Q1859259) |
| 104 | Rojava Revolution | 2012-07-19 | 25 | no location | [article](https://en.wikipedia.org/wiki/Rojava_Revolution) | [Q2384201](https://www.wikidata.org/wiki/Q2384201) |
| 105 | Yazidi genocide | 2014-08-01 | 25 | no location | [article](https://en.wikipedia.org/wiki/Yazidi_genocide) | [Q21190910](https://www.wikidata.org/wiki/Q21190910) |
| 106 | Peel Commission | 1936-11-01 | 24 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Peel_Commission) | [Q655894](https://www.wikidata.org/wiki/Q655894) |
| 107 | Treaty of Ankara (1921) | 1921-10-20 | 24 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Ankara_(1921)) | [Q2358950](https://www.wikidata.org/wiki/Q2358950) |
| 108 | Balkan Pact (1953) | 1953-02-28 | 24 | no location | [article](https://en.wikipedia.org/wiki/Balkan_Pact_(1953)) | [Q805061](https://www.wikidata.org/wiki/Q805061) |
| 109 | Gaza war hostage crisis | 2023-10-01 | 24 | no location | [article](https://en.wikipedia.org/wiki/Gaza_war_hostage_crisis) | [Q123005094](https://www.wikidata.org/wiki/Q123005094) |
| 110 | Iraqi Revolt | 1920-05-30 | 23 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Iraqi_Revolt) | [Q616851](https://www.wikidata.org/wiki/Q616851) |
| 111 | White Paper of 1939 | 1939-05-17 | 23 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/White_Paper_of_1939) | [Q1501775](https://www.wikidata.org/wiki/Q1501775) |
| 112 | South Lebanon conflict (1985–2000) | 1985-02-16 | 23 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/South_Lebanon_conflict_(1985%E2%80%932000)) | [Q2479435](https://www.wikidata.org/wiki/Q2479435) |
| 113 | Execution of Saddam Hussein | 2006-12-30 | 23 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Execution_of_Saddam_Hussein) | [Q1193136](https://www.wikidata.org/wiki/Q1193136) |
| 114 | Treaty of Constantinople (1913) | 1913-09-29 | 23 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Constantinople_(1913)) | [Q269606](https://www.wikidata.org/wiki/Q269606) |
| 115 | Franco-Turkish War | 1918-12-01 | 23 | no location | [article](https://en.wikipedia.org/wiki/Franco-Turkish_War) | [Q1450532](https://www.wikidata.org/wiki/Q1450532) |
| 116 | Yemeni civil war (1994) | 1994-05-04 | 23 | no location | [article](https://en.wikipedia.org/wiki/Yemeni_civil_war_(1994)) | [Q2461485](https://www.wikidata.org/wiki/Q2461485) |
| 117 | September 2024 Israeli attacks against Lebanon | 2024-09-23 | 23 | no location | [article](https://en.wikipedia.org/wiki/September_2024_Israeli_attacks_against_Lebanon) | [Q130354504](https://www.wikidata.org/wiki/Q130354504) |
| 118 | Formation of Saudi Arabia | 1932-09-23 | 22 | pin at Saudi Arabia capital (approximate) | [article](https://en.wikipedia.org/wiki/Formation_of_Saudi_Arabia) | [Q251600](https://www.wikidata.org/wiki/Q251600) |
| 119 | National Pact | 1943-11-22 | 22 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/National_Pact) | [Q748819](https://www.wikidata.org/wiki/Q748819) |
| 120 | Treaty of Saadabad | 1937-07-08 | 22 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Saadabad) | [Q537143](https://www.wikidata.org/wiki/Q537143) |
| 121 | Operation Magic Carpet (Yemen) | 1949-06-01 | 22 | no location | [article](https://en.wikipedia.org/wiki/Operation_Magic_Carpet_(Yemen)) | [Q113016](https://www.wikidata.org/wiki/Q113016) |
| 122 | Iraqi insurgency (2011–2013) | 2011-01-01 | 22 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_insurgency_(2011%E2%80%932013)) | [Q2165215](https://www.wikidata.org/wiki/Q2165215) |
| 123 | January 2025 Gaza war ceasefire | 2025-01-15 | 22 | no location | [article](https://en.wikipedia.org/wiki/January_2025_Gaza_war_ceasefire) | [Q131760224](https://www.wikidata.org/wiki/Q131760224) |
| 124 | 1949 Armistice Agreements | 1949-02-24 | 21 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/1949_Armistice_Agreements) | [Q999143](https://www.wikidata.org/wiki/Q999143) |
| 125 | 1948 Palestinian expulsion and flight | 1948-01-01 | 21 | no location | [article](https://en.wikipedia.org/wiki/1948_Palestinian_expulsion_and_flight) | [Q13220089](https://www.wikidata.org/wiki/Q13220089) |
| 126 | 1991 Iraqi uprisings | 1991-01-01 | 21 | no location | [article](https://en.wikipedia.org/wiki/1991_Iraqi_uprisings) | [Q760002](https://www.wikidata.org/wiki/Q760002) |
| 127 | 2022 Gaza–Israel clashes | 2022-08-01 | 21 | no location | [article](https://en.wikipedia.org/wiki/2022_Gaza%E2%80%93Israel_clashes) | [Q113453221](https://www.wikidata.org/wiki/Q113453221) |
| 128 | March 2025 Israeli attacks on the Gaza Strip | 2025-03-18 | 21 | no location | [article](https://en.wikipedia.org/wiki/March_2025_Israeli_attacks_on_the_Gaza_Strip) | [Q133309815](https://www.wikidata.org/wiki/Q133309815) |
| 129 | Reparations Agreement between Israel and the Federal Republic of Germany | 1952-09-10 | 20 | no location | [article](https://en.wikipedia.org/wiki/Reparations_Agreement_between_Israel_and_the_Federal_Republic_of_Germany) | [Q660521](https://www.wikidata.org/wiki/Q660521) |
| 130 | Dhofar rebellion | 1963-06-09 | 20 | no location | [article](https://en.wikipedia.org/wiki/Dhofar_rebellion) | [Q2363565](https://www.wikidata.org/wiki/Q2363565) |
| 131 | Black Friday (1978) | 1978-09-08 | 20 | no location | [article](https://en.wikipedia.org/wiki/Black_Friday_(1978)) | [Q1899132](https://www.wikidata.org/wiki/Q1899132) |
| 132 | Operation Defensive Shield | 2002-03-29 | 20 | no location | [article](https://en.wikipedia.org/wiki/Operation_Defensive_Shield) | [Q2276724](https://www.wikidata.org/wiki/Q2276724) |
| 133 | Israeli blockade of the Gaza Strip (2023–present) | 2023-01-01 | 20 | no location | [article](https://en.wikipedia.org/wiki/Israeli_blockade_of_the_Gaza_Strip_(2023%E2%80%93present)) | [Q122982851](https://www.wikidata.org/wiki/Q122982851) |
| 134 | 1966 Syrian coup d'état | 1966-02-23 | 19 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/1966_Syrian_coup_d'%C3%A9tat) | [Q3560385](https://www.wikidata.org/wiki/Q3560385) |
| 135 | Armistice of Erzincan | 1917-12-18 | 19 | no location | [article](https://en.wikipedia.org/wiki/Armistice_of_Erzincan) | [Q28048694](https://www.wikidata.org/wiki/Q28048694) |
| 136 | 1921 Persian coup d'état | 1921-02-21 | 19 | no location | [article](https://en.wikipedia.org/wiki/1921_Persian_coup_d'%C3%A9tat) | [Q1131857](https://www.wikidata.org/wiki/Q1131857) |
| 137 | Operation Praying Mantis | 1988-04-18 | 19 | no location | [article](https://en.wikipedia.org/wiki/Operation_Praying_Mantis) | [Q2026308](https://www.wikidata.org/wiki/Q2026308) |
| 138 | Operation Grapes of Wrath | 1996-04-27 | 19 | no location | [article](https://en.wikipedia.org/wiki/Operation_Grapes_of_Wrath) | [Q1473919](https://www.wikidata.org/wiki/Q1473919) |
| 139 | Syrian revolution | 2011-03-15 | 19 | no location | [article](https://en.wikipedia.org/wiki/Syrian_revolution) | [Q14746872](https://www.wikidata.org/wiki/Q14746872) |
| 140 | Persecution of the Iraqi Turkmen by the Islamic State | 2014-08-01 | 19 | no location | [article](https://en.wikipedia.org/wiki/Persecution_of_the_Iraqi_Turkmen_by_the_Islamic_State) | [Q116783960](https://www.wikidata.org/wiki/Q116783960) |
| 141 | Gaza Strip famine | 2023-10-01 | 19 | no location | [article](https://en.wikipedia.org/wiki/Gaza_Strip_famine) | [Q124302798](https://www.wikidata.org/wiki/Q124302798) |
| 142 | Gaza peace summit | 2025-10-13 | 19 | no location | [article](https://en.wikipedia.org/wiki/Gaza_peace_summit) | [Q136486580](https://www.wikidata.org/wiki/Q136486580) |
| 143 | Capture of Baghdad (1917) | 1917-03-11 | 18 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Capture_of_Baghdad_(1917)) | [Q2665637](https://www.wikidata.org/wiki/Q2665637) |
| 144 | 31 March incident | 1909-04-13 | 18 | no location | [article](https://en.wikipedia.org/wiki/31_March_incident) | [Q2073490](https://www.wikidata.org/wiki/Q2073490) |
| 145 | German–Ottoman alliance | 1914-08-02 | 18 | no location | [article](https://en.wikipedia.org/wiki/German%E2%80%93Ottoman_alliance) | [Q261982](https://www.wikidata.org/wiki/Q261982) |
| 146 | 1970 Syrian coup d'etat | 1970-11-13 | 18 | no location | [article](https://en.wikipedia.org/wiki/1970_Syrian_coup_d'etat) | [Q14947304](https://www.wikidata.org/wiki/Q14947304) |
| 147 | Operation Badr (1973) | 1973-01-01 | 18 | no location | [article](https://en.wikipedia.org/wiki/Operation_Badr_(1973)) | [Q2704666](https://www.wikidata.org/wiki/Q2704666) |
| 148 | Tel al-Zaatar massacre | 1976-08-12 | 18 | no location | [article](https://en.wikipedia.org/wiki/Tel_al-Zaatar_massacre) | [Q2359563](https://www.wikidata.org/wiki/Q2359563) |
| 149 | 2024 Israel–Lebanon ceasefire agreement | 2024-11-27 | 18 | no location | [article](https://en.wikipedia.org/wiki/2024_Israel%E2%80%93Lebanon_ceasefire_agreement) | [Q131338691](https://www.wikidata.org/wiki/Q131338691) |
| 150 | 17 July Revolution | 1968-07-17 | 17 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/17_July_Revolution) | [Q4120226](https://www.wikidata.org/wiki/Q4120226) |
| 151 | Battle of Aqaba | 1917-07-06 | 17 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Aqaba) | [Q2081944](https://www.wikidata.org/wiki/Q2081944) |
| 152 | Battle of the Sakarya | 1921-08-23 | 17 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_the_Sakarya) | [Q594015](https://www.wikidata.org/wiki/Q594015) |
| 153 | Saudi–Yemeni war (1934) | 1934-03-01 | 17 | no location | [article](https://en.wikipedia.org/wiki/Saudi%E2%80%93Yemeni_war_(1934)) | [Q1367731](https://www.wikidata.org/wiki/Q1367731) |
| 154 | Aden Emergency | 1963-10-14 | 17 | no location | [article](https://en.wikipedia.org/wiki/Aden_Emergency) | [Q3299864](https://www.wikidata.org/wiki/Q3299864) |
| 155 | 1971 Turkish military memorandum | 1971-03-12 | 17 | no location | [article](https://en.wikipedia.org/wiki/1971_Turkish_military_memorandum) | [Q931943](https://www.wikidata.org/wiki/Q931943) |
| 156 | 1979 Iranian Islamic Republic referendum | 1979-03-31 | 17 | no location | [article](https://en.wikipedia.org/wiki/1979_Iranian_Islamic_Republic_referendum) | [Q4231692](https://www.wikidata.org/wiki/Q4231692) |
| 157 | Operation Spring Shield | 2020-02-27 | 17 | no location | [article](https://en.wikipedia.org/wiki/Operation_Spring_Shield) | [Q86832624](https://www.wikidata.org/wiki/Q86832624) |
| 158 | Battle of Sderot | 2023-10-07 | 17 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Sderot) | [Q122972407](https://www.wikidata.org/wiki/Q122972407) |
| 159 | Attempted assassination of Abdul Hamid II | 1905-06-21 | 16 | no location | [article](https://en.wikipedia.org/wiki/Attempted_assassination_of_Abdul_Hamid_II) | [Q3845560](https://www.wikidata.org/wiki/Q3845560) |
| 160 | Battle of Mecca (1916) | 1916-06-10 | 16 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Mecca_(1916)) | [Q2089020](https://www.wikidata.org/wiki/Q2089020) |
| 161 | Battle of Dumlupınar | 1922-08-26 | 16 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Dumlup%C4%B1nar) | [Q2445317](https://www.wikidata.org/wiki/Q2445317) |
| 162 | Operation Dani | 1948-01-01 | 16 | no location | [article](https://en.wikipedia.org/wiki/Operation_Dani) | [Q2916659](https://www.wikidata.org/wiki/Q2916659) |
| 163 | Ankara Agreement | 1963-09-12 | 16 | no location | [article](https://en.wikipedia.org/wiki/Ankara_Agreement) | [Q745136](https://www.wikidata.org/wiki/Q745136) |
| 164 | Operation Southern Watch | 1992-08-27 | 16 | no location | [article](https://en.wikipedia.org/wiki/Operation_Southern_Watch) | [Q2026406](https://www.wikidata.org/wiki/Q2026406) |
| 165 | 2008 Turkish incursion into northern Iraq | 2008-02-21 | 16 | no location | [article](https://en.wikipedia.org/wiki/2008_Turkish_incursion_into_northern_Iraq) | [Q2430581](https://www.wikidata.org/wiki/Q2430581) |
| 166 | Turkish involvement in the Syrian civil war | 2011-01-01 | 16 | no location | [article](https://en.wikipedia.org/wiki/Turkish_involvement_in_the_Syrian_civil_war) | [Q18208094](https://www.wikidata.org/wiki/Q18208094) |
| 167 | Northwestern Syria offensive (2019–2020) | 2019-12-19 | 16 | no location | [article](https://en.wikipedia.org/wiki/Northwestern_Syria_offensive_(2019%E2%80%932020)) | [Q79629688](https://www.wikidata.org/wiki/Q79629688) |
| 168 | Battle of Re'im | 2023-10-07 | 16 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Re'im) | [Q122971969](https://www.wikidata.org/wiki/Q122971969) |
| 169 | Nuseirat rescue and massacre | 2024-06-08 | 16 | no location | [article](https://en.wikipedia.org/wiki/Nuseirat_rescue_and_massacre) | [Q126416493](https://www.wikidata.org/wiki/Q126416493) |
| 170 | United States recognition of Jerusalem as capital of Israel | 2018-05-14 | 15 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/United_States_recognition_of_Jerusalem_as_capital_of_Israel) | [Q45266620](https://www.wikidata.org/wiki/Q45266620) |
| 171 | Treaty of Darin | 1915-12-26 | 15 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Darin) | [Q7837031](https://www.wikidata.org/wiki/Q7837031) |
| 172 | Treaty of Jeddah (1927) | 1927-01-01 | 15 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Jeddah_(1927)) | [Q17035545](https://www.wikidata.org/wiki/Q17035545) |
| 173 | Operation Earnest Will | 1987-07-24 | 15 | no location | [article](https://en.wikipedia.org/wiki/Operation_Earnest_Will) | [Q1687078](https://www.wikidata.org/wiki/Q1687078) |
| 174 | Iraqi conflict | 2003-03-20 | 15 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_conflict) | [Q47015896](https://www.wikidata.org/wiki/Q47015896) |
| 175 | Anbar campaign (2013–2014) | 2013-12-30 | 15 | no location | [article](https://en.wikipedia.org/wiki/Anbar_campaign_(2013%E2%80%932014)) | [Q15553019](https://www.wikidata.org/wiki/Q15553019) |
| 176 | Houthi takeover of Yemen | 2014-09-21 | 15 | no location | [article](https://en.wikipedia.org/wiki/Houthi_takeover_of_Yemen) | [Q18145759](https://www.wikidata.org/wiki/Q18145759) |
| 177 | Mahshahr massacre | 2019-11-16 | 15 | no location | [article](https://en.wikipedia.org/wiki/Mahshahr_massacre) | [Q77513637](https://www.wikidata.org/wiki/Q77513637) |
| 178 | Kidnapping and killing of the Bibas family | 2023-10-07 | 15 | no location | [article](https://en.wikipedia.org/wiki/Kidnapping_and_killing_of_the_Bibas_family) | [Q123907413](https://www.wikidata.org/wiki/Q123907413) |
| 179 | 2025 massacres of Syrian Alawites | 2025-03-06 | 15 | no location | [article](https://en.wikipedia.org/wiki/2025_massacres_of_Syrian_Alawites) | [Q133187598](https://www.wikidata.org/wiki/Q133187598) |
| 180 | Iranian Green Movement | 2009-06-13 | 14 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iranian_Green_Movement) | [Q2626387](https://www.wikidata.org/wiki/Q2626387) |
| 181 | Jungle Movement of Gilan | 1915-10-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Jungle_Movement_of_Gilan) | [Q764038](https://www.wikidata.org/wiki/Q764038) |
| 182 | Iraqi–Kurdish conflict | 1918-01-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Iraqi%E2%80%93Kurdish_conflict) | [Q6068230](https://www.wikidata.org/wiki/Q6068230) |
| 183 | 1920 capture of Damascus | 1920-07-24 | 14 | no location | [article](https://en.wikipedia.org/wiki/1920_capture_of_Damascus) | [Q7509962](https://www.wikidata.org/wiki/Q7509962) |
| 184 | Turkish capture of Smyrna | 1922-09-09 | 14 | no location | [article](https://en.wikipedia.org/wiki/Turkish_capture_of_Smyrna) | [Q12813016](https://www.wikidata.org/wiki/Q12813016) |
| 185 | Uqair Protocol of 1922 | 1922-12-02 | 14 | no location | [article](https://en.wikipedia.org/wiki/Uqair_Protocol_of_1922) | [Q94635](https://www.wikidata.org/wiki/Q94635) |
| 186 | Ararat rebellion | 1927-10-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Ararat_rebellion) | [Q626264](https://www.wikidata.org/wiki/Q626264) |
| 187 | Operation Hiram | 1948-10-29 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Hiram) | [Q2915580](https://www.wikidata.org/wiki/Q2915580) |
| 188 | Operation Accountability | 1993-07-25 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Accountability) | [Q2026496](https://www.wikidata.org/wiki/Q2026496) |
| 189 | Iraqi Kurdish Civil War | 1994-05-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_Kurdish_Civil_War) | [Q1154912](https://www.wikidata.org/wiki/Q1154912) |
| 190 | South Yemen insurgency | 2009-04-27 | 14 | no location | [article](https://en.wikipedia.org/wiki/South_Yemen_insurgency) | [Q632663](https://www.wikidata.org/wiki/Q632663) |
| 191 | May 2023 Gaza–Israel clashes | 2023-05-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/May_2023_Gaza%E2%80%93Israel_clashes) | [Q118234253](https://www.wikidata.org/wiki/Q118234253) |
| 192 | Operation Aspides | 2024-02-19 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Aspides) | [Q124618589](https://www.wikidata.org/wiki/Q124618589) |
| 193 | Southern Syria clashes (July–September 2025) | 2025-07-13 | 14 | no location | [article](https://en.wikipedia.org/wiki/Southern_Syria_clashes_(July%E2%80%93September_2025)) | [Q135319143](https://www.wikidata.org/wiki/Q135319143) |
| 194 | Abolition of the Caliphate | 1924-03-03 | 13 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Abolition_of_the_Caliphate) | [Q2821698](https://www.wikidata.org/wiki/Q2821698) |
| 195 | Naval operations in the Dardanelles campaign | 1915-02-19 | 13 | no location | [article](https://en.wikipedia.org/wiki/Naval_operations_in_the_Dardanelles_campaign) | [Q2778755](https://www.wikidata.org/wiki/Q2778755) |
| 196 | Trebizond Peace Conference | 1918-03-12 | 13 | no location | [article](https://en.wikipedia.org/wiki/Trebizond_Peace_Conference) | [Q3686593](https://www.wikidata.org/wiki/Q3686593) |
| 197 | Operation Musketeer (1956) | 1956-11-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/Operation_Musketeer_(1956)) | [Q2915155](https://www.wikidata.org/wiki/Q2915155) |
| 198 | 1959 Mosul uprising | 1959-03-07 | 13 | no location | [article](https://en.wikipedia.org/wiki/1959_Mosul_uprising) | [Q12203911](https://www.wikidata.org/wiki/Q12203911) |
| 199 | Maraş massacre | 1978-12-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/Mara%C5%9F_massacre) | [Q2096206](https://www.wikidata.org/wiki/Q2096206) |
| 200 | Operation Fath ol-Mobin | 1982-03-22 | 13 | no location | [article](https://en.wikipedia.org/wiki/Operation_Fath_ol-Mobin) | [Q3267722](https://www.wikidata.org/wiki/Q3267722) |
| 201 | May 17 Agreement | 1983-05-17 | 13 | no location | [article](https://en.wikipedia.org/wiki/May_17_Agreement) | [Q321851](https://www.wikidata.org/wiki/Q321851) |
| 202 | 2012 Egyptian constitutional referendum | 2012-12-15 | 13 | no location | [article](https://en.wikipedia.org/wiki/2012_Egyptian_constitutional_referendum) | [Q277144](https://www.wikidata.org/wiki/Q277144) |
| 203 | War crimes in the Gaza war | 2023-01-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/War_crimes_in_the_Gaza_war) | [Q123033523](https://www.wikidata.org/wiki/Q123033523) |
| 204 | March–May 2025 United States attacks in Yemen | 2025-03-15 | 13 | no location | [article](https://en.wikipedia.org/wiki/March%E2%80%93May_2025_United_States_attacks_in_Yemen) | [Q133287207](https://www.wikidata.org/wiki/Q133287207) |
| 205 | August 2025 Israeli attack on Sanaa | 2025-08-28 | 13 | no location | [article](https://en.wikipedia.org/wiki/August_2025_Israeli_attack_on_Sanaa) | [Q136001786](https://www.wikidata.org/wiki/Q136001786) |
| 206 | United States withdrawal from the Iran nuclear deal | 2018-05-08 | 12 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/United_States_withdrawal_from_the_Iran_nuclear_deal) | [Q52836581](https://www.wikidata.org/wiki/Q52836581) |
| 207 | Menemen massacre | 1916-06-16 | 12 | no location | [article](https://en.wikipedia.org/wiki/Menemen_massacre) | [Q4809060](https://www.wikidata.org/wiki/Q4809060) |
| 208 | Second Battle of İnönü | 1921-04-01 | 12 | no location | [article](https://en.wikipedia.org/wiki/Second_Battle_of_%C4%B0n%C3%B6n%C3%BC) | [Q2659746](https://www.wikidata.org/wiki/Q2659746) |
| 209 | Battle for Jerusalem | 1947-12-01 | 12 | no location | [article](https://en.wikipedia.org/wiki/Battle_for_Jerusalem) | [Q2916279](https://www.wikidata.org/wiki/Q2916279) |
| 210 | Operation Nachshon | 1948-04-05 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Nachshon) | [Q1375894](https://www.wikidata.org/wiki/Q1375894) |
| 211 | Operation Yoav | 1948-10-15 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Yoav) | [Q2890420](https://www.wikidata.org/wiki/Q2890420) |
| 212 | Aeroflot Flight 244 | 1970-10-15 | 12 | no location | [article](https://en.wikipedia.org/wiki/Aeroflot_Flight_244) | [Q2045629](https://www.wikidata.org/wiki/Q2045629) |
| 213 | Operation Morvarid | 1980-11-29 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Morvarid) | [Q191577](https://www.wikidata.org/wiki/Q191577) |
| 214 | British Airways Flight 149 | 1990-08-02 | 12 | no location | [article](https://en.wikipedia.org/wiki/British_Airways_Flight_149) | [Q3296462](https://www.wikidata.org/wiki/Q3296462) |
| 215 | 2003 Nasiriyah bombing | 2003-11-12 | 12 | no location | [article](https://en.wikipedia.org/wiki/2003_Nasiriyah_bombing) | [Q3629102](https://www.wikidata.org/wiki/Q3629102) |
| 216 | Operation Hot Winter | 2008-03-03 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Hot_Winter) | [Q2560749](https://www.wikidata.org/wiki/Q2560749) |
| 217 | 2010 Turkish constitutional referendum | 2010-09-12 | 12 | no location | [article](https://en.wikipedia.org/wiki/2010_Turkish_constitutional_referendum) | [Q250826](https://www.wikidata.org/wiki/Q250826) |
| 218 | 2012 Syrian constitutional referendum | 2012-02-26 | 12 | no location | [article](https://en.wikipedia.org/wiki/2012_Syrian_constitutional_referendum) | [Q2119324](https://www.wikidata.org/wiki/Q2119324) |
| 219 | 2014 Egyptian constitutional referendum | 2014-01-14 | 12 | no location | [article](https://en.wikipedia.org/wiki/2014_Egyptian_constitutional_referendum) | [Q15304061](https://www.wikidata.org/wiki/Q15304061) |
| 220 | Sexual and gender-based violence in the October 7 attacks | 2023-10-07 | 12 | no location | [article](https://en.wikipedia.org/wiki/Sexual_and_gender-based_violence_in_the_October_7_attacks) | [Q123615519](https://www.wikidata.org/wiki/Q123615519) |
| 221 | Anglo-Iraqi Treaty of 1930 | 1932-10-03 | 11 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Anglo-Iraqi_Treaty_of_1930) | [Q541372](https://www.wikidata.org/wiki/Q541372) |
| 222 | Battle of Tel Hai | 1920-03-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Tel_Hai) | [Q4872527](https://www.wikidata.org/wiki/Q4872527) |
| 223 | Unilateral Declaration of Egyptian Independence | 1922-02-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/Unilateral_Declaration_of_Egyptian_Independence) | [Q2583161](https://www.wikidata.org/wiki/Q2583161) |
| 224 | Operation Uvda | 1949-03-05 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Uvda) | [Q931576](https://www.wikidata.org/wiki/Q931576) |
| 225 | March 1949 Syrian coup d'état | 1949-03-29 | 11 | no location | [article](https://en.wikipedia.org/wiki/March_1949_Syrian_coup_d'%C3%A9tat) | [Q643510](https://www.wikidata.org/wiki/Q643510) |
| 226 | Seizure of Abu Musa and the Greater and Lesser Tunbs | 1971-11-30 | 11 | no location | [article](https://en.wikipedia.org/wiki/Seizure_of_Abu_Musa_and_the_Greater_and_Lesser_Tunbs) | [Q4115029](https://www.wikidata.org/wiki/Q4115029) |
| 227 | First Yemenite War | 1972-09-26 | 11 | no location | [article](https://en.wikipedia.org/wiki/First_Yemenite_War) | [Q16126368](https://www.wikidata.org/wiki/Q16126368) |
| 228 | 1979 Iranian constitutional referendum | 1979-12-03 | 11 | no location | [article](https://en.wikipedia.org/wiki/1979_Iranian_constitutional_referendum) | [Q4231925](https://www.wikidata.org/wiki/Q4231925) |
| 229 | Operation Kaman 99 | 1980-09-23 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Kaman_99) | [Q1149113](https://www.wikidata.org/wiki/Q1149113) |
| 230 | 1981 Iranian Prime Minister's office bombing | 1981-01-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/1981_Iranian_Prime_Minister's_office_bombing) | [Q5936879](https://www.wikidata.org/wiki/Q5936879) |
| 231 | Haft-e Tir bombing | 1981-06-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/Haft-e_Tir_bombing) | [Q5638475](https://www.wikidata.org/wiki/Q5638475) |
| 232 | Operation Tariq al-Quds | 1981-12-07 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Tariq_al-Quds) | [Q1382298](https://www.wikidata.org/wiki/Q1382298) |
| 233 | Operation Beit ol-Moqaddas | 1982-05-24 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Beit_ol-Moqaddas) | [Q3267731](https://www.wikidata.org/wiki/Q3267731) |
| 234 | Operation Mole Cricket 19 | 1982-06-09 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Mole_Cricket_19) | [Q2918913](https://www.wikidata.org/wiki/Q2918913) |
| 235 | South Yemeni crisis | 1986-01-13 | 11 | no location | [article](https://en.wikipedia.org/wiki/South_Yemeni_crisis) | [Q1276892](https://www.wikidata.org/wiki/Q1276892) |
| 236 | Operation Mersad | 1988-07-26 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Mersad) | [Q2059536](https://www.wikidata.org/wiki/Q2059536) |
| 237 | 1989 Iranian constitutional referendum | 1989-07-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/1989_Iranian_constitutional_referendum) | [Q3207434](https://www.wikidata.org/wiki/Q3207434) |
| 238 | Battle of Norfolk | 1991-02-27 | 11 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Norfolk) | [Q3636553](https://www.wikidata.org/wiki/Q3636553) |
| 239 | Operation Provide Comfort | 1991-03-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Provide_Comfort) | [Q2281470](https://www.wikidata.org/wiki/Q2281470) |
| 240 | Battle of Karbala (2003) | 2003-03-23 | 11 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Karbala_(2003)) | [Q4178089](https://www.wikidata.org/wiki/Q4178089) |
| 241 | Iraqi civil war (2006–2008) | 2006-02-22 | 11 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_civil_war_(2006%E2%80%932008)) | [Q17183365](https://www.wikidata.org/wiki/Q17183365) |
| 242 | Zurich Protocols | 2009-10-10 | 11 | no location | [article](https://en.wikipedia.org/wiki/Zurich_Protocols) | [Q20512994](https://www.wikidata.org/wiki/Q20512994) |
| 243 | Opération Chammal | 2014-09-19 | 11 | no location | [article](https://en.wikipedia.org/wiki/Op%C3%A9ration_Chammal) | [Q18121535](https://www.wikidata.org/wiki/Q18121535) |
| 244 | Iraqi insurgency (2017–present) | 2017-12-09 | 11 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_insurgency_(2017%E2%80%93present)) | [Q57890365](https://www.wikidata.org/wiki/Q57890365) |
| 245 | Gaza Strip evacuations | 2023-10-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/Gaza_Strip_evacuations) | [Q123049614](https://www.wikidata.org/wiki/Q123049614) |
| 246 | 2025 Gaza Strip aid distribution killings | 2025-05-27 | 11 | no location | [article](https://en.wikipedia.org/wiki/2025_Gaza_Strip_aid_distribution_killings) | [Q134642893](https://www.wikidata.org/wiki/Q134642893) |
| 247 | Egyptian Crisis (2011–2014) | 2012-06-30 | 10 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Egyptian_Crisis_(2011%E2%80%932014)) | [Q577539](https://www.wikidata.org/wiki/Q577539) |
| 248 | Battle of Riyadh | 1902-01-13 | 10 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Riyadh) | [Q2943187](https://www.wikidata.org/wiki/Q2943187) |
| 249 | First Saudi–Rashidi War (1903–1907) | 1903-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/First_Saudi%E2%80%93Rashidi_War_(1903%E2%80%931907)) | [Q7427175](https://www.wikidata.org/wiki/Q7427175) |
| 250 | 1912 Ottoman coup d'état | 1912-07-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/1912_Ottoman_coup_d'%C3%A9tat) | [Q7428332](https://www.wikidata.org/wiki/Q7428332) |
| 251 | 20 Hunchakian gallows | 1915-06-15 | 10 | no location | [article](https://en.wikipedia.org/wiki/20_Hunchakian_gallows) | [Q7711827](https://www.wikidata.org/wiki/Q7711827) |
| 252 | Yalova Peninsula massacres | 1920-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Yalova_Peninsula_massacres) | [Q6105724](https://www.wikidata.org/wiki/Q6105724) |
| 253 | Goharshad Mosque rebellion | 1935-08-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Goharshad_Mosque_rebellion) | [Q11161771](https://www.wikidata.org/wiki/Q11161771) |
| 254 | Operation Horev | 1948-12-22 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Horev) | [Q2777473](https://www.wikidata.org/wiki/Q2777473) |
| 255 | Palestinian insurgency in South Lebanon | 1968-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Palestinian_insurgency_in_South_Lebanon) | [Q7127419](https://www.wikidata.org/wiki/Q7127419) |
| 256 | 1979 Khuzestan insurgency | 1979-04-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/1979_Khuzestan_insurgency) | [Q12182813](https://www.wikidata.org/wiki/Q12182813) |
| 257 | Operation Prime Chance | 1987-08-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Prime_Chance) | [Q1118003](https://www.wikidata.org/wiki/Q1118003) |
| 258 | Second Battle of al-Faw | 1988-04-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/Second_Battle_of_al-Faw) | [Q82995](https://www.wikidata.org/wiki/Q82995) |
| 259 | 1996 cruise missile strikes on Iraq | 1996-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/1996_cruise_missile_strikes_on_Iraq) | [Q1781133](https://www.wikidata.org/wiki/Q1781133) |
| 260 | 2004 Ashura massacre | 2004-03-02 | 10 | no location | [article](https://en.wikipedia.org/wiki/2004_Ashura_massacre) | [Q722990](https://www.wikidata.org/wiki/Q722990) |
| 261 | Battle of Samarra (2004) | 2004-10-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Samarra_(2004)) | [Q4087318](https://www.wikidata.org/wiki/Q4087318) |
| 262 | March 2012 Gaza–Israel clashes | 2012-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/March_2012_Gaza%E2%80%93Israel_clashes) | [Q2613676](https://www.wikidata.org/wiki/Q2613676) |
| 263 | 2015–2016 Latakia offensive | 2015-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/2015%E2%80%932016_Latakia_offensive) | [Q21805447](https://www.wikidata.org/wiki/Q21805447) |
| 264 | Aleppo offensive (November–December 2016) | 2016-11-15 | 10 | no location | [article](https://en.wikipedia.org/wiki/Aleppo_offensive_(November%E2%80%93December_2016)) | [Q27894014](https://www.wikidata.org/wiki/Q27894014) |
| 265 | 2019 Egyptian constitutional referendum | 2019-04-20 | 10 | no location | [article](https://en.wikipedia.org/wiki/2019_Egyptian_constitutional_referendum) | [Q63197808](https://www.wikidata.org/wiki/Q63197808) |
| 266 | Operation Claw-Eagle 2 | 2021-02-10 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Claw-Eagle_2) | [Q105525852](https://www.wikidata.org/wiki/Q105525852) |
| 267 | Iran–China 25-year Cooperation Program | 2021-03-27 | 10 | no location | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93China_25-year_Cooperation_Program) | [Q96743196](https://www.wikidata.org/wiki/Q96743196) |
| 268 | 2023 Gaza war ceasefire | 2023-11-24 | 10 | no location | [article](https://en.wikipedia.org/wiki/2023_Gaza_war_ceasefire) | [Q123509933](https://www.wikidata.org/wiki/Q123509933) |
| 269 | 20 September 2024 Beirut attack | 2024-09-20 | 10 | no location | [article](https://en.wikipedia.org/wiki/20_September_2024_Beirut_attack) | [Q130331542](https://www.wikidata.org/wiki/Q130331542) |
| 270 | May 2025 Gaza offensive | 2025-05-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/May_2025_Gaza_offensive) | [Q134352816](https://www.wikidata.org/wiki/Q134352816) |
| 271 | Fall of Aden (2026) | 2026-01-07 | 10 | no location | [article](https://en.wikipedia.org/wiki/Fall_of_Aden_(2026)) | [Q137757212](https://www.wikidata.org/wiki/Q137757212) |
| 272 | Ottoman entry into World War I | 1914-10-29 | 8 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Ottoman_entry_into_World_War_I) | [Q1328496](https://www.wikidata.org/wiki/Q1328496) |

## 2. Discovered candidates (sitelinks >= 10) proposed with location_quality "none" (no real location) - 194

| # | Event | Date | Sitelinks | Current fallback | Wikipedia | Wikidata |
|---|---|---|---|---|---|---|
| 1 | Arab–Israeli conflict | 1948-05-15 | 119 | no location | [article](https://en.wikipedia.org/wiki/Arab%E2%80%93Israeli_conflict) | [Q8669](https://www.wikidata.org/wiki/Q8669) |
| 2 | April 2024 Iranian strikes on Israel | 2024-04-01 | 50 | no location | [article](https://en.wikipedia.org/wiki/April_2024_Iranian_strikes_on_Israel) | [Q125464497](https://www.wikidata.org/wiki/Q125464497) |
| 3 | 2025 United States strikes on Iranian nuclear sites | 2025-06-22 | 45 | no location | [article](https://en.wikipedia.org/wiki/2025_United_States_strikes_on_Iranian_nuclear_sites) | [Q135005864](https://www.wikidata.org/wiki/Q135005864) |
| 4 | Gezi Park protests | 2013-05-28 | 42 | no location | [article](https://en.wikipedia.org/wiki/Gezi_Park_protests) | [Q13410316](https://www.wikidata.org/wiki/Q13410316) |
| 5 | War against the Islamic State | 2014-06-13 | 38 | no location | [article](https://en.wikipedia.org/wiki/War_against_the_Islamic_State) | [Q17507684](https://www.wikidata.org/wiki/Q17507684) |
| 6 | Middle Eastern theatre of World War I | 1914-10-30 | 37 | no location | [article](https://en.wikipedia.org/wiki/Middle_Eastern_theatre_of_World_War_I) | [Q1765465](https://www.wikidata.org/wiki/Q1765465) |
| 7 | 2023 Turkish presidential election | 2023-05-14 | 37 | no location | [article](https://en.wikipedia.org/wiki/2023_Turkish_presidential_election) | [Q55636316](https://www.wikidata.org/wiki/Q55636316) |
| 8 | 2017–2018 Iranian protests | 2017-12-28 | 37 | no location | [article](https://en.wikipedia.org/wiki/2017%E2%80%932018_Iranian_protests) | [Q46999835](https://www.wikidata.org/wiki/Q46999835) |
| 9 | Iran crisis of 1946 | 1946-01-01 | 36 | no location | [article](https://en.wikipedia.org/wiki/Iran_crisis_of_1946) | [Q1132835](https://www.wikidata.org/wiki/Q1132835) |
| 10 | October 2024 Iranian strikes on Israel | 2024-10-01 | 35 | no location | [article](https://en.wikipedia.org/wiki/October_2024_Iranian_strikes_on_Israel) | [Q130391800](https://www.wikidata.org/wiki/Q130391800) |
| 11 | Mesopotamian campaign | 1914-11-06 | 34 | no location | [article](https://en.wikipedia.org/wiki/Mesopotamian_campaign) | [Q18937](https://www.wikidata.org/wiki/Q18937) |
| 12 | Russian intervention in the Syrian civil war | 2015-09-30 | 34 | no location | [article](https://en.wikipedia.org/wiki/Russian_intervention_in_the_Syrian_civil_war) | [Q21032720](https://www.wikidata.org/wiki/Q21032720) |
| 13 | Sinai and Palestine campaign | 1915-01-28 | 34 | no location | [article](https://en.wikipedia.org/wiki/Sinai_and_Palestine_campaign) | [Q727536](https://www.wikidata.org/wiki/Q727536) |
| 14 | Occupation of Constantinople | 1918-11-13 | 34 | no location | [article](https://en.wikipedia.org/wiki/Occupation_of_Constantinople) | [Q2854228](https://www.wikidata.org/wiki/Q2854228) |
| 15 | 2018–2019 Gaza border protests | 2018-03-30 | 33 | no location | [article](https://en.wikipedia.org/wiki/2018%E2%80%932019_Gaza_border_protests) | [Q51139646](https://www.wikidata.org/wiki/Q51139646) |
| 16 | 1978 South Lebanon conflict | 1978-01-01 | 33 | no location | [article](https://en.wikipedia.org/wiki/1978_South_Lebanon_conflict) | [Q1121402](https://www.wikidata.org/wiki/Q1121402) |
| 17 | Gaza–Israel conflict | 1948-05-15 | 33 | no location | [article](https://en.wikipedia.org/wiki/Gaza%E2%80%93Israel_conflict) | [Q553184](https://www.wikidata.org/wiki/Q553184) |
| 18 | 2024 Syrian opposition offensives | 2024-11-27 | 33 | no location | [article](https://en.wikipedia.org/wiki/2024_Syrian_opposition_offensives) | [Q131342170](https://www.wikidata.org/wiki/Q131342170) |
| 19 | Kurdistan Workers' Party insurgency | 1978-11-01 | 31 | no location | [article](https://en.wikipedia.org/wiki/Kurdistan_Workers'_Party_insurgency) | [Q619749](https://www.wikidata.org/wiki/Q619749) |
| 20 | 2026 Lebanon war | 2026-03-02 | 30 | no location | [article](https://en.wikipedia.org/wiki/2026_Lebanon_war) | [Q138521081](https://www.wikidata.org/wiki/Q138521081) |
| 21 | 2024 Iranian presidential election | 2024-07-05 | 29 | no location | [article](https://en.wikipedia.org/wiki/2024_Iranian_presidential_election) | [Q111588743](https://www.wikidata.org/wiki/Q111588743) |
| 22 | June 2015 Turkish general election | 2015-06-07 | 29 | no location | [article](https://en.wikipedia.org/wiki/June_2015_Turkish_general_election) | [Q12808193](https://www.wikidata.org/wiki/Q12808193) |
| 23 | 2009 Iranian presidential election | 2009-06-14 | 29 | no location | [article](https://en.wikipedia.org/wiki/2009_Iranian_presidential_election) | [Q143304](https://www.wikidata.org/wiki/Q143304) |
| 24 | Israeli–Lebanese conflict | 2000-01-01 | 28 | no location | [article](https://en.wikipedia.org/wiki/Israeli%E2%80%93Lebanese_conflict) | [Q3241199](https://www.wikidata.org/wiki/Q3241199) |
| 25 | Israeli invasion of Syria (2024–present) | 2024-12-08 | 28 | no location | [article](https://en.wikipedia.org/wiki/Israeli_invasion_of_Syria_(2024%E2%80%93present)) | [Q131405504](https://www.wikidata.org/wiki/Q131405504) |
| 26 | US–UK airstrikes on Yemen | 2024-01-12 | 28 | no location | [article](https://en.wikipedia.org/wiki/US%E2%80%93UK_airstrikes_on_Yemen) | [Q124254493](https://www.wikidata.org/wiki/Q124254493) |
| 27 | Farhud | 1941-06-01 | 28 | no location | [article](https://en.wikipedia.org/wiki/Farhud) | [Q2352263](https://www.wikidata.org/wiki/Q2352263) |
| 28 | 2015 Israeli legislative election | 2015-03-17 | 28 | no location | [article](https://en.wikipedia.org/wiki/2015_Israeli_legislative_election) | [Q17012412](https://www.wikidata.org/wiki/Q17012412) |
| 29 | 2014 Turkish presidential election | 2014-08-10 | 28 | no location | [article](https://en.wikipedia.org/wiki/2014_Turkish_presidential_election) | [Q7855396](https://www.wikidata.org/wiki/Q7855396) |
| 30 | 2022 Israeli legislative election | 2022-11-01 | 27 | no location | [article](https://en.wikipedia.org/wiki/2022_Israeli_legislative_election) | [Q106181016](https://www.wikidata.org/wiki/Q106181016) |
| 31 | April 2019 Israeli legislative election | 2019-04-09 | 27 | no location | [article](https://en.wikipedia.org/wiki/April_2019_Israeli_legislative_election) | [Q24909108](https://www.wikidata.org/wiki/Q24909108) |
| 32 | Operation Atalanta | 2008-12-08 | 26 | no location | [article](https://en.wikipedia.org/wiki/Operation_Atalanta) | [Q698771](https://www.wikidata.org/wiki/Q698771) |
| 33 | June 2025 Iranian strikes on Israel | 2025-06-01 | 26 | no location | [article](https://en.wikipedia.org/wiki/List_of_attacks_during_the_Twelve-Day_War) | [Q134890505](https://www.wikidata.org/wiki/Q134890505) |
| 34 | 2025–2026 Turkish protests | 2025-03-19 | 26 | no location | [article](https://en.wikipedia.org/wiki/2025%E2%80%932026_Turkish_protests) | [Q133441461](https://www.wikidata.org/wiki/Q133441461) |
| 35 | 2009 Israeli legislative election | 2009-02-10 | 25 | no location | [article](https://en.wikipedia.org/wiki/2009_Israeli_legislative_election) | [Q911180](https://www.wikidata.org/wiki/Q911180) |
| 36 | 2012 Egyptian presidential election | 2012-06-16 | 25 | no location | [article](https://en.wikipedia.org/wiki/2012_Egyptian_presidential_election) | [Q861684](https://www.wikidata.org/wiki/Q861684) |
| 37 | 2013 Israeli legislative election | 2013-01-23 | 25 | no location | [article](https://en.wikipedia.org/wiki/2013_Israeli_legislative_election) | [Q2334537](https://www.wikidata.org/wiki/Q2334537) |
| 38 | 2009 Iranian presidential election protests | 2010-02-11 | 25 | no location | [article](https://en.wikipedia.org/wiki/2009_Iranian_presidential_election_protests) | [Q854206](https://www.wikidata.org/wiki/Q854206) |
| 39 | 2019–2020 Iranian protests | 2019-11-15 | 25 | no location | [article](https://en.wikipedia.org/wiki/2019%E2%80%932020_Iranian_protests) | [Q75161062](https://www.wikidata.org/wiki/Q75161062) |
| 40 | 2020 Israeli legislative election | 2020-03-02 | 24 | no location | [article](https://en.wikipedia.org/wiki/2020_Israeli_legislative_election) | [Q77929387](https://www.wikidata.org/wiki/Q77929387) |
| 41 | 2018 Turkish presidential election | 2018-06-24 | 24 | no location | [article](https://en.wikipedia.org/wiki/2018_Turkish_presidential_election) | [Q51955238](https://www.wikidata.org/wiki/Q51955238) |
| 42 | 2021 Israeli legislative election | 2021-03-23 | 23 | no location | [article](https://en.wikipedia.org/wiki/2021_Israeli_legislative_election) | [Q96395543](https://www.wikidata.org/wiki/Q96395543) |
| 43 | September 2019 Israeli legislative election | 2019-09-17 | 23 | no location | [article](https://en.wikipedia.org/wiki/September_2019_Israeli_legislative_election) | [Q64159775](https://www.wikidata.org/wiki/Q64159775) |
| 44 | 2014 Egyptian presidential election | 2014-05-28 | 23 | no location | [article](https://en.wikipedia.org/wiki/2014_Egyptian_presidential_election) | [Q14303464](https://www.wikidata.org/wiki/Q14303464) |
| 45 | Battle of the Mediterranean | 1940-06-10 | 22 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_the_Mediterranean) | [Q702176](https://www.wikidata.org/wiki/Q702176) |
| 46 | U-boat campaign | 1914-07-28 | 22 | no location | [article](https://en.wikipedia.org/wiki/U-boat_campaign) | [Q2316150](https://www.wikidata.org/wiki/Q2316150) |
| 47 | Middle Eastern crisis (2023–present) | 2023-10-07 | 22 | no location | [article](https://en.wikipedia.org/wiki/Middle_Eastern_crisis_(2023%E2%80%93present)) | [Q124373310](https://www.wikidata.org/wiki/Q124373310) |
| 48 | 2021 Iranian presidential election | 2021-06-18 | 22 | no location | [article](https://en.wikipedia.org/wiki/2021_Iranian_presidential_election) | [Q30640701](https://www.wikidata.org/wiki/Q30640701) |
| 49 | 2013 Iranian presidential election | 2013-06-14 | 22 | no location | [article](https://en.wikipedia.org/wiki/2013_Iranian_presidential_election) | [Q626198](https://www.wikidata.org/wiki/Q626198) |
| 50 | 2019–2021 Iraqi protests | 2019-10-01 | 22 | no location | [article](https://en.wikipedia.org/wiki/2019%E2%80%932021_Iraqi_protests) | [Q72367808](https://www.wikidata.org/wiki/Q72367808) |
| 51 | Operation Focus | 1967-06-05 | 21 | no location | [article](https://en.wikipedia.org/wiki/Operation_Focus) | [Q63863](https://www.wikidata.org/wiki/Q63863) |
| 52 | October 2024 Israeli strikes on Iran | 2024-10-26 | 21 | no location | [article](https://en.wikipedia.org/wiki/October_2024_Israeli_strikes_on_Iran) | [Q130647458](https://www.wikidata.org/wiki/Q130647458) |
| 53 | 2017 Iranian presidential election | 2017-05-19 | 21 | no location | [article](https://en.wikipedia.org/wiki/2017_Iranian_presidential_election) | [Q16052966](https://www.wikidata.org/wiki/Q16052966) |
| 54 | 2006 Palestinian legislative election | 2006-01-25 | 21 | no location | [article](https://en.wikipedia.org/wiki/2006_Palestinian_legislative_election) | [Q977390](https://www.wikidata.org/wiki/Q977390) |
| 55 | Operation Barkhane | 2014-08-01 | 20 | no location | [article](https://en.wikipedia.org/wiki/Operation_Barkhane) | [Q17354007](https://www.wikidata.org/wiki/Q17354007) |
| 56 | 2006 Gaza–Israel conflict | 2006-01-01 | 20 | no location | [article](https://en.wikipedia.org/wiki/2006_Gaza%E2%80%93Israel_conflict) | [Q1316163](https://www.wikidata.org/wiki/Q1316163) |
| 57 | 1949 Israeli Constituent Assembly election | 1949-01-25 | 20 | no location | [article](https://en.wikipedia.org/wiki/1949_Israeli_Constituent_Assembly_election) | [Q1674684](https://www.wikidata.org/wiki/Q1674684) |
| 58 | 2006 Israeli legislative election | 2006-03-28 | 20 | no location | [article](https://en.wikipedia.org/wiki/2006_Israeli_legislative_election) | [Q2720560](https://www.wikidata.org/wiki/Q2720560) |
| 59 | Israeli occupation of the West Bank | 1967-06-05 | 19 | no location | [article](https://en.wikipedia.org/wiki/Israeli_occupation_of_the_West_Bank) | [Q60753669](https://www.wikidata.org/wiki/Q60753669) |
| 60 | Naval warfare in World War I | 1914-07-28 | 19 | no location | [article](https://en.wikipedia.org/wiki/Naval_warfare_in_World_War_I) | [Q695497](https://www.wikidata.org/wiki/Q695497) |
| 61 | Turkish occupation of northern Syria | 2016-08-01 | 19 | no location | [article](https://en.wikipedia.org/wiki/Turkish_occupation_of_northern_Syria) | [Q27628424](https://www.wikidata.org/wiki/Q27628424) |
| 62 | 2026 Israeli legislative election | 2026-10-27 | 19 | no location | [article](https://en.wikipedia.org/wiki/2026_Israeli_legislative_election) | [Q115632366](https://www.wikidata.org/wiki/Q115632366) |
| 63 | 2018 Egyptian presidential election | 2018-03-26 | 19 | no location | [article](https://en.wikipedia.org/wiki/2018_Egyptian_presidential_election) | [Q28162717](https://www.wikidata.org/wiki/Q28162717) |
| 64 | 2011 Turkish general election | 2011-06-12 | 19 | no location | [article](https://en.wikipedia.org/wiki/2011_Turkish_general_election) | [Q740451](https://www.wikidata.org/wiki/Q740451) |
| 65 | Arab Cold War | 1979-02-11 | 18 | no location | [article](https://en.wikipedia.org/wiki/Arab_Cold_War) | [Q4783165](https://www.wikidata.org/wiki/Q4783165) |
| 66 | 2016 Saudi Arabia bombings | 2016-07-04 | 18 | no location | [article](https://en.wikipedia.org/wiki/2016_Saudi_Arabia_bombings) | [Q25343325](https://www.wikidata.org/wiki/Q25343325) |
| 67 | 2021 Syrian presidential election | 2021-05-26 | 18 | no location | [article](https://en.wikipedia.org/wiki/2021_Syrian_presidential_election) | [Q84026411](https://www.wikidata.org/wiki/Q84026411) |
| 68 | 2023 Turkish parliamentary election | 2023-05-14 | 18 | no location | [article](https://en.wikipedia.org/wiki/2023_Turkish_parliamentary_election) | [Q55625115](https://www.wikidata.org/wiki/Q55625115) |
| 69 | November 2015 Turkish general election | 2015-11-01 | 18 | no location | [article](https://en.wikipedia.org/wiki/November_2015_Turkish_general_election) | [Q20818057](https://www.wikidata.org/wiki/Q20818057) |
| 70 | Iranian protests against compulsory hijab | 2017-12-27 | 18 | no location | [article](https://en.wikipedia.org/wiki/Iranian_protests_against_compulsory_hijab) | [Q47489345](https://www.wikidata.org/wiki/Q47489345) |
| 71 | Operation Active Endeavour | 2001-10-26 | 17 | no location | [article](https://en.wikipedia.org/wiki/Operation_Active_Endeavour) | [Q684446](https://www.wikidata.org/wiki/Q684446) |
| 72 | 2026 Iranian supreme leader election | 2026-03-08 | 17 | no location | [article](https://en.wikipedia.org/wiki/2026_Iranian_supreme_leader_election) | [Q23043491](https://www.wikidata.org/wiki/Q23043491) |
| 73 | 2025 Syrian parliamentary election | 2025-10-05 | 17 | no location | [article](https://en.wikipedia.org/wiki/2025_Syrian_parliamentary_election) | [Q135265257](https://www.wikidata.org/wiki/Q135265257) |
| 74 | 2018 Turkish general election | 2018-06-24 | 17 | no location | [article](https://en.wikipedia.org/wiki/2018_Turkish_general_election) | [Q30588330](https://www.wikidata.org/wiki/Q30588330) |
| 75 | 2010 Iraqi parliamentary election | 2010-03-07 | 17 | no location | [article](https://en.wikipedia.org/wiki/2010_Iraqi_parliamentary_election) | [Q1398554](https://www.wikidata.org/wiki/Q1398554) |
| 76 | 2018 Turkish parliamentary election | 2018-06-24 | 17 | no location | [article](https://en.wikipedia.org/wiki/2018_Turkish_parliamentary_election) | [Q21469665](https://www.wikidata.org/wiki/Q21469665) |
| 77 | 2005 Iranian presidential election | 2005-06-17 | 17 | no location | [article](https://en.wikipedia.org/wiki/2005_Iranian_presidential_election) | [Q251830](https://www.wikidata.org/wiki/Q251830) |
| 78 | 17 October Revolution | 2019-10-17 | 17 | no location | [article](https://en.wikipedia.org/wiki/17_October_Revolution) | [Q71443275](https://www.wikidata.org/wiki/Q71443275) |
| 79 | 2023 Afghanistan–Iran clash | 2023-05-01 | 16 | no location | [article](https://en.wikipedia.org/wiki/2023_Afghanistan%E2%80%93Iran_clash) | [Q118779713](https://www.wikidata.org/wiki/Q118779713) |
| 80 | United States intervention in Syria | 2014-09-22 | 16 | no location | [article](https://en.wikipedia.org/wiki/United_States_intervention_in_Syria) | [Q18121212](https://www.wikidata.org/wiki/Q18121212) |
| 81 | April 2024 Israeli strikes on Iran | 2024-04-19 | 16 | no location | [article](https://en.wikipedia.org/wiki/April_2024_Israeli_strikes_on_Iran) | [Q125521954](https://www.wikidata.org/wiki/Q125521954) |
| 82 | 2024 Hama offensive | 2024-11-30 | 16 | no location | [article](https://en.wikipedia.org/wiki/2024_Hama_offensive) | [Q131363430](https://www.wikidata.org/wiki/Q131363430) |
| 83 | 2025 Iranian strikes on Al Udeid Air Base | 2025-06-23 | 16 | no location | [article](https://en.wikipedia.org/wiki/2025_Iranian_strikes_on_Al_Udeid_Air_Base) | [Q135034691](https://www.wikidata.org/wiki/Q135034691) |
| 84 | 2014 Syrian presidential election | 2014-06-03 | 16 | no location | [article](https://en.wikipedia.org/wiki/2014_Syrian_presidential_election) | [Q16335811](https://www.wikidata.org/wiki/Q16335811) |
| 85 | 2011–12 Egyptian parliamentary election | 2011-11-28 | 16 | no location | [article](https://en.wikipedia.org/wiki/2011%E2%80%9312_Egyptian_parliamentary_election) | [Q1382040](https://www.wikidata.org/wiki/Q1382040) |
| 86 | January 2005 Iraqi parliamentary election | 2005-01-30 | 16 | no location | [article](https://en.wikipedia.org/wiki/January_2005_Iraqi_parliamentary_election) | [Q2297120](https://www.wikidata.org/wiki/Q2297120) |
| 87 | 2018 Iraqi parliamentary election | 2018-05-12 | 16 | no location | [article](https://en.wikipedia.org/wiki/2018_Iraqi_parliamentary_election) | [Q47353571](https://www.wikidata.org/wiki/Q47353571) |
| 88 | 1979 International Women's Day protests in Tehran | 1979-03-08 | 16 | no location | [article](https://en.wikipedia.org/wiki/1979_International_Women's_Day_protests_in_Tehran) | [Q5955315](https://www.wikidata.org/wiki/Q5955315) |
| 89 | 2015 G20 Antalya summit | 2015-11-15 | 16 | no location | [article](https://en.wikipedia.org/wiki/2015_G20_Antalya_summit) | [Q4630304](https://www.wikidata.org/wiki/Q4630304) |
| 90 | Raid on the Suez Canal | 1915-01-26 | 15 | no location | [article](https://en.wikipedia.org/wiki/Raid_on_the_Suez_Canal) | [Q2382729](https://www.wikidata.org/wiki/Q2382729) |
| 91 | 2024 Iranian missile strikes in Iraq and Syria | 2024-01-15 | 15 | no location | [article](https://en.wikipedia.org/wiki/2024_Iranian_missile_strikes_in_Iraq_and_Syria) | [Q124295087](https://www.wikidata.org/wiki/Q124295087) |
| 92 | 2007 Turkish general election | 2007-07-22 | 15 | no location | [article](https://en.wikipedia.org/wiki/2007_Turkish_general_election) | [Q2053599](https://www.wikidata.org/wiki/Q2053599) |
| 93 | 1996 Israeli general election | 1996-05-29 | 15 | no location | [article](https://en.wikipedia.org/wiki/1996_Israeli_general_election) | [Q2917048](https://www.wikidata.org/wiki/Q2917048) |
| 94 | 2003 Israeli legislative election | 2003-01-28 | 15 | no location | [article](https://en.wikipedia.org/wiki/2003_Israeli_legislative_election) | [Q782051](https://www.wikidata.org/wiki/Q782051) |
| 95 | December 2005 Iraqi parliamentary election | 2005-12-15 | 15 | no location | [article](https://en.wikipedia.org/wiki/December_2005_Iraqi_parliamentary_election) | [Q182532](https://www.wikidata.org/wiki/Q182532) |
| 96 | 2011 Iraqi protests | 2011-01-01 | 15 | no location | [article](https://en.wikipedia.org/wiki/2011_Iraqi_protests) | [Q1149030](https://www.wikidata.org/wiki/Q1149030) |
| 97 | Operation Unified Protector | 2011-03-23 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Unified_Protector) | [Q3269455](https://www.wikidata.org/wiki/Q3269455) |
| 98 | 2026 Yemen offensives | 2026-09-03 | 14 | no location | [article](https://en.wikipedia.org/wiki/2026_Yemen_offensives) | [Q141349562](https://www.wikidata.org/wiki/Q141349562) |
| 99 | Attacks on US bases during the Middle Eastern crisis (2023–present) | 2023-10-18 | 14 | no location | [article](https://en.wikipedia.org/wiki/Attacks_on_US_bases_during_the_Middle_Eastern_crisis_(2023%E2%80%93present)) | [Q123124528](https://www.wikidata.org/wiki/Q123124528) |
| 100 | Tanker war | 1984-02-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Tanker_war) | [Q6414580](https://www.wikidata.org/wiki/Q6414580) |
| 101 | 2025–2026 southern Yemen campaign | 2025-12-02 | 14 | no location | [article](https://en.wikipedia.org/wiki/2025%E2%80%932026_southern_Yemen_campaign) | [Q137209864](https://www.wikidata.org/wiki/Q137209864) |
| 102 | 2023 Egyptian presidential election | 2023-12-10 | 14 | no location | [article](https://en.wikipedia.org/wiki/2023_Egyptian_presidential_election) | [Q121842916](https://www.wikidata.org/wiki/Q121842916) |
| 103 | 1980 Iranian presidential election | 1980-01-25 | 14 | no location | [article](https://en.wikipedia.org/wiki/1980_Iranian_presidential_election) | [Q4121027](https://www.wikidata.org/wiki/Q4121027) |
| 104 | 2019 Turkish local elections | 2019-03-31 | 14 | no location | [article](https://en.wikipedia.org/wiki/2019_Turkish_local_elections) | [Q28219941](https://www.wikidata.org/wiki/Q28219941) |
| 105 | 2002 Turkish general election | 2002-11-03 | 14 | no location | [article](https://en.wikipedia.org/wiki/2002_Turkish_general_election) | [Q1858615](https://www.wikidata.org/wiki/Q1858615) |
| 106 | 2012 Syrian parliamentary election | 2012-05-07 | 14 | no location | [article](https://en.wikipedia.org/wiki/2012_Syrian_parliamentary_election) | [Q1781416](https://www.wikidata.org/wiki/Q1781416) |
| 107 | 2009 Lebanese general election | 2009-06-07 | 14 | no location | [article](https://en.wikipedia.org/wiki/2009_Lebanese_general_election) | [Q1507312](https://www.wikidata.org/wiki/Q1507312) |
| 108 | 1981 Israeli legislative election | 1981-06-30 | 14 | no location | [article](https://en.wikipedia.org/wiki/1981_Israeli_legislative_election) | [Q2917008](https://www.wikidata.org/wiki/Q2917008) |
| 109 | 1951 Israeli legislative election | 1951-07-30 | 14 | no location | [article](https://en.wikipedia.org/wiki/1951_Israeli_legislative_election) | [Q2915671](https://www.wikidata.org/wiki/Q2915671) |
| 110 | 2026 Ankara NATO summit | 2026-07-07 | 14 | no location | [article](https://en.wikipedia.org/wiki/2026_Ankara_NATO_summit) | [Q127370522](https://www.wikidata.org/wiki/Q127370522) |
| 111 | Rif Dimashq offensive (February–April 2018) | 2018-04-14 | 13 | no location | [article](https://en.wikipedia.org/wiki/Rif_Dimashq_offensive_(February%E2%80%93April_2018)) | [Q49413597](https://www.wikidata.org/wiki/Q49413597) |
| 112 | Israeli occupation of Southern Lebanon (1982–2000) | 1985-02-16 | 13 | no location | [article](https://en.wikipedia.org/wiki/Israeli_occupation_of_Southern_Lebanon_(1982%E2%80%932000)) | [Q2910225](https://www.wikidata.org/wiki/Q2910225) |
| 113 | Bombing of Bahrain in World War II | 1940-10-19 | 13 | no location | [article](https://en.wikipedia.org/wiki/Bombing_of_Bahrain_in_World_War_II) | [Q4940685](https://www.wikidata.org/wiki/Q4940685) |
| 114 | 1968 Israeli raid on Beirut Airport | 1968-12-28 | 13 | no location | [article](https://en.wikipedia.org/wiki/1968_Israeli_raid_on_Beirut_Airport) | [Q2655859](https://www.wikidata.org/wiki/Q2655859) |
| 115 | 2022 Abu Dhabi attack | 2022-01-17 | 13 | no location | [article](https://en.wikipedia.org/wiki/2022_Abu_Dhabi_attack) | [Q110602012](https://www.wikidata.org/wiki/Q110602012) |
| 116 | 2026 northeastern Syria offensive | 2026-01-13 | 13 | no location | [article](https://en.wikipedia.org/wiki/2026_northeastern_Syria_offensive) | [Q137802844](https://www.wikidata.org/wiki/Q137802844) |
| 117 | 1934 Thrace pogroms | 1934-06-21 | 13 | no location | [article](https://en.wikipedia.org/wiki/1934_Thrace_pogroms) | [Q1129968](https://www.wikidata.org/wiki/Q1129968) |
| 118 | 2004 Qamishli riots | 2004-03-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/2004_Qamishli_riots) | [Q4068978](https://www.wikidata.org/wiki/Q4068978) |
| 119 | Sofagate | 2021-04-06 | 13 | no location | [article](https://en.wikipedia.org/wiki/Sofagate) | [Q106434951](https://www.wikidata.org/wiki/Q106434951) |
| 120 | 2024 Turkish local elections | 2024-03-31 | 13 | no location | [article](https://en.wikipedia.org/wiki/2024_Turkish_local_elections) | [Q113648279](https://www.wikidata.org/wiki/Q113648279) |
| 121 | 2016 Syrian parliamentary election | 2016-04-13 | 13 | no location | [article](https://en.wikipedia.org/wiki/2016_Syrian_parliamentary_election) | [Q22918891](https://www.wikidata.org/wiki/Q22918891) |
| 122 | 2014 Iraqi parliamentary election | 2014-04-30 | 13 | no location | [article](https://en.wikipedia.org/wiki/2014_Iraqi_parliamentary_election) | [Q15743062](https://www.wikidata.org/wiki/Q15743062) |
| 123 | 2007 Turkish presidential election | 2007-08-28 | 13 | no location | [article](https://en.wikipedia.org/wiki/2007_Turkish_presidential_election) | [Q1076754](https://www.wikidata.org/wiki/Q1076754) |
| 124 | 1999 Israeli general election | 1999-05-17 | 13 | no location | [article](https://en.wikipedia.org/wiki/1999_Israeli_general_election) | [Q2480394](https://www.wikidata.org/wiki/Q2480394) |
| 125 | 2005 Palestinian presidential election | 2005-01-09 | 13 | no location | [article](https://en.wikipedia.org/wiki/2005_Palestinian_presidential_election) | [Q1965086](https://www.wikidata.org/wiki/Q1965086) |
| 126 | 1977 Israeli legislative election | 1977-05-17 | 13 | no location | [article](https://en.wikipedia.org/wiki/1977_Israeli_legislative_election) | [Q2917062](https://www.wikidata.org/wiki/Q2917062) |
| 127 | 1965 Israeli legislative election | 1965-11-02 | 13 | no location | [article](https://en.wikipedia.org/wiki/1965_Israeli_legislative_election) | [Q2917013](https://www.wikidata.org/wiki/Q2917013) |
| 128 | 2015 Saudi Arabian municipal elections | 2015-12-12 | 13 | no location | [article](https://en.wikipedia.org/wiki/2015_Saudi_Arabian_municipal_elections) | [Q7427110](https://www.wikidata.org/wiki/Q7427110) |
| 129 | 2001 Israeli prime ministerial election | 2001-02-06 | 13 | no location | [article](https://en.wikipedia.org/wiki/2001_Israeli_prime_ministerial_election) | [Q2733907](https://www.wikidata.org/wiki/Q2733907) |
| 130 | 1961 Israeli legislative election | 1961-08-15 | 13 | no location | [article](https://en.wikipedia.org/wiki/1961_Israeli_legislative_election) | [Q2916994](https://www.wikidata.org/wiki/Q2916994) |
| 131 | 2021–2022 Iranian protests | 2021-07-15 | 13 | no location | [article](https://en.wikipedia.org/wiki/2021%E2%80%932022_Iranian_protests) | [Q107573559](https://www.wikidata.org/wiki/Q107573559) |
| 132 | 1999 Iranian student protests | 1999-07-08 | 13 | no location | [article](https://en.wikipedia.org/wiki/1999_Iranian_student_protests) | [Q523141](https://www.wikidata.org/wiki/Q523141) |
| 133 | Anbar campaign (2003–2011) | 2003-03-20 | 12 | no location | [article](https://en.wikipedia.org/wiki/Anbar_campaign_(2003%E2%80%932011)) | [Q6067801](https://www.wikidata.org/wiki/Q6067801) |
| 134 | 1991 Iraqi missile attacks against Israel | 1991-01-17 | 12 | no location | [article](https://en.wikipedia.org/wiki/1991_Iraqi_missile_attacks_against_Israel) | [Q97860712](https://www.wikidata.org/wiki/Q97860712) |
| 135 | 1947 anti-Jewish riots in Aden | 1947-12-04 | 12 | no location | [article](https://en.wikipedia.org/wiki/1947_anti-Jewish_riots_in_Aden) | [Q1270130](https://www.wikidata.org/wiki/Q1270130) |
| 136 | Shiraz pogrom | 1910-10-30 | 12 | no location | [article](https://en.wikipedia.org/wiki/Shiraz_pogrom) | [Q2458508](https://www.wikidata.org/wiki/Q2458508) |
| 137 | Prelude to the 2026 Iran war | 2026-01-13 | 12 | no location | [article](https://en.wikipedia.org/wiki/Prelude_to_the_2026_Iran_war) | [Q138300045](https://www.wikidata.org/wiki/Q138300045) |
| 138 | Chanak crisis | 1922-09-01 | 12 | no location | [article](https://en.wikipedia.org/wiki/Chanak_crisis) | [Q198658](https://www.wikidata.org/wiki/Q198658) |
| 139 | 2016 Iranian legislative election | 2016-02-25 | 12 | no location | [article](https://en.wikipedia.org/wiki/2016_Iranian_legislative_election) | [Q16052983](https://www.wikidata.org/wiki/Q16052983) |
| 140 | 2007 Syrian presidential election | 2007-05-27 | 12 | no location | [article](https://en.wikipedia.org/wiki/2007_Syrian_presidential_election) | [Q1369417](https://www.wikidata.org/wiki/Q1369417) |
| 141 | 1955 Israeli legislative election | 1955-07-26 | 12 | no location | [article](https://en.wikipedia.org/wiki/1955_Israeli_legislative_election) | [Q2917065](https://www.wikidata.org/wiki/Q2917065) |
| 142 | 1992 Israeli legislative election | 1992-06-23 | 12 | no location | [article](https://en.wikipedia.org/wiki/1992_Israeli_legislative_election) | [Q2917044](https://www.wikidata.org/wiki/Q2917044) |
| 143 | 1973 Israeli legislative election | 1973-12-31 | 12 | no location | [article](https://en.wikipedia.org/wiki/1973_Israeli_legislative_election) | [Q2890132](https://www.wikidata.org/wiki/Q2890132) |
| 144 | 1969 Israeli legislative election | 1969-10-28 | 12 | no location | [article](https://en.wikipedia.org/wiki/1969_Israeli_legislative_election) | [Q2890121](https://www.wikidata.org/wiki/Q2890121) |
| 145 | 1988 Israeli legislative election | 1988-11-01 | 12 | no location | [article](https://en.wikipedia.org/wiki/1988_Israeli_legislative_election) | [Q2917001](https://www.wikidata.org/wiki/Q2917001) |
| 146 | 1959 Israeli legislative election | 1959-11-03 | 12 | no location | [article](https://en.wikipedia.org/wiki/1959_Israeli_legislative_election) | [Q2916954](https://www.wikidata.org/wiki/Q2916954) |
| 147 | War in the Sahel | 2011-02-15 | 11 | no location | [article](https://en.wikipedia.org/wiki/War_in_the_Sahel) | [Q86831539](https://www.wikidata.org/wiki/Q86831539) |
| 148 | Syrian occupation of Lebanon | 1976-05-31 | 11 | no location | [article](https://en.wikipedia.org/wiki/Syrian_occupation_of_Lebanon) | [Q64876](https://www.wikidata.org/wiki/Q64876) |
| 149 | 2023 Iran drone attacks | 2023-01-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/2023_Iran_drone_attacks) | [Q116468222](https://www.wikidata.org/wiki/Q116468222) |
| 150 | Iranian intervention in the Syrian civil war | 2013-06-09 | 11 | no location | [article](https://en.wikipedia.org/wiki/Iranian_intervention_in_the_Syrian_civil_war) | [Q15803217](https://www.wikidata.org/wiki/Q15803217) |
| 151 | Southern Syria offensive (2024) | 2024-11-29 | 11 | no location | [article](https://en.wikipedia.org/wiki/Southern_Syria_offensive_(2024)) | [Q131366416](https://www.wikidata.org/wiki/Q131366416) |
| 152 | 1964 Hama riot | 1964-04-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/1964_Hama_riot) | [Q617883](https://www.wikidata.org/wiki/Q617883) |
| 153 | 2017 Dutch–Turkish diplomatic incident | 2017-03-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/2017_Dutch%E2%80%93Turkish_diplomatic_incident) | [Q28936523](https://www.wikidata.org/wiki/Q28936523) |
| 154 | 2023 Turkish general election | 2023-05-14 | 11 | no location | [article](https://en.wikipedia.org/wiki/2023_Turkish_general_election) | [Q111594736](https://www.wikidata.org/wiki/Q111594736) |
| 155 | June 2019 Istanbul mayoral election | 2019-06-23 | 11 | no location | [article](https://en.wikipedia.org/wiki/June_2019_Istanbul_mayoral_election) | [Q63639179](https://www.wikidata.org/wiki/Q63639179) |
| 156 | 2021 Qatari general election | 2021-10-02 | 11 | no location | [article](https://en.wikipedia.org/wiki/2021_Qatari_general_election) | [Q7267158](https://www.wikidata.org/wiki/Q7267158) |
| 157 | 2014 Israeli presidential election | 2014-06-10 | 11 | no location | [article](https://en.wikipedia.org/wiki/2014_Israeli_presidential_election) | [Q15630907](https://www.wikidata.org/wiki/Q15630907) |
| 158 | 2014 Turkish local elections | 2014-03-30 | 11 | no location | [article](https://en.wikipedia.org/wiki/2014_Turkish_local_elections) | [Q1710058](https://www.wikidata.org/wiki/Q1710058) |
| 159 | July 1981 Iranian presidential election | 1981-07-24 | 11 | no location | [article](https://en.wikipedia.org/wiki/July_1981_Iranian_presidential_election) | [Q1672406](https://www.wikidata.org/wiki/Q1672406) |
| 160 | 2018 Lebanese general election | 2018-05-06 | 11 | no location | [article](https://en.wikipedia.org/wiki/2018_Lebanese_general_election) | [Q6510981](https://www.wikidata.org/wiki/Q6510981) |
| 161 | 1984 Israeli legislative election | 1984-07-23 | 11 | no location | [article](https://en.wikipedia.org/wiki/1984_Israeli_legislative_election) | [Q2917025](https://www.wikidata.org/wiki/Q2917025) |
| 162 | 2011 Lebanese protests | 2011-01-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/2011_Lebanese_protests) | [Q2995643](https://www.wikidata.org/wiki/Q2995643) |
| 163 | George W. Bush shoe-throwing incident | 2008-12-14 | 11 | no location | [article](https://en.wikipedia.org/wiki/George_W._Bush_shoe-throwing_incident) | [Q18236869](https://www.wikidata.org/wiki/Q18236869) |
| 164 | 2015–2018 Iraqi protests | 2018-09-07 | 11 | no location | [article](https://en.wikipedia.org/wiki/2015%E2%80%932018_Iraqi_protests) | [Q69783941](https://www.wikidata.org/wiki/Q69783941) |
| 165 | 1999 Istanbul summit | 1999-01-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/1999_Istanbul_summit) | [Q4594808](https://www.wikidata.org/wiki/Q4594808) |
| 166 | 2004 Istanbul NATO summit | 2004-06-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/2004_Istanbul_NATO_summit) | [Q3489918](https://www.wikidata.org/wiki/Q3489918) |
| 167 | Operation Juniper Shield | 2007-02-06 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Juniper_Shield) | [Q2602154](https://www.wikidata.org/wiki/Q2602154) |
| 168 | Operation House of Cards | 2018-05-10 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_House_of_Cards) | [Q52971355](https://www.wikidata.org/wiki/Q52971355) |
| 169 | United Arab Emirates occupation of Socotra | 2018-04-30 | 10 | no location | [article](https://en.wikipedia.org/wiki/United_Arab_Emirates_occupation_of_Socotra) | [Q52770979](https://www.wikidata.org/wiki/Q52770979) |
| 170 | Turkey–Islamic State conflict | 2013-05-11 | 10 | no location | [article](https://en.wikipedia.org/wiki/Turkey%E2%80%93Islamic_State_conflict) | [Q20743978](https://www.wikidata.org/wiki/Q20743978) |
| 171 | Russian occupation of Tabriz | 1911-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Russian_occupation_of_Tabriz) | [Q19906312](https://www.wikidata.org/wiki/Q19906312) |
| 172 | Political violence in Turkey (1976–1980) | 1968-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Political_violence_in_Turkey_(1976%E2%80%931980)) | [Q7225137](https://www.wikidata.org/wiki/Q7225137) |
| 173 | Stalemate in Southern Palestine | 1917-04-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Stalemate_in_Southern_Palestine) | [Q16932897](https://www.wikidata.org/wiki/Q16932897) |
| 174 | 2021 Afghanistan–Iran clashes | 2021-12-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/2021_Afghanistan%E2%80%93Iran_clashes) | [Q109860738](https://www.wikidata.org/wiki/Q109860738) |
| 175 | United Arab Emirates in the 2026 Iran war | 2026-02-28 | 10 | no location | [article](https://en.wikipedia.org/wiki/United_Arab_Emirates_in_the_2026_Iran_war) | [Q138514385](https://www.wikidata.org/wiki/Q138514385) |
| 176 | 1947 anti-Jewish riots in Aleppo | 1947-12-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/1947_anti-Jewish_riots_in_Aleppo) | [Q1630411](https://www.wikidata.org/wiki/Q1630411) |
| 177 | 2021–2022 Iraqi political crisis | 2021-11-05 | 10 | no location | [article](https://en.wikipedia.org/wiki/2021%E2%80%932022_Iraqi_political_crisis) | [Q112762654](https://www.wikidata.org/wiki/Q112762654) |
| 178 | Levant Crisis | 1945-05-19 | 10 | no location | [article](https://en.wikipedia.org/wiki/Levant_Crisis) | [Q42955668](https://www.wikidata.org/wiki/Q42955668) |
| 179 | 2025 Iraqi parliamentary election | 2025-11-11 | 10 | no location | [article](https://en.wikipedia.org/wiki/2025_Iraqi_parliamentary_election) | [Q110160763](https://www.wikidata.org/wiki/Q110160763) |
| 180 | 2020 Syrian parliamentary election | 2020-07-19 | 10 | no location | [article](https://en.wikipedia.org/wiki/2020_Syrian_parliamentary_election) | [Q84081002](https://www.wikidata.org/wiki/Q84081002) |
| 181 | 2021 Iraqi parliamentary election | 2021-10-10 | 10 | no location | [article](https://en.wikipedia.org/wiki/2021_Iraqi_parliamentary_election) | [Q84080555](https://www.wikidata.org/wiki/Q84080555) |
| 182 | 2002 Iraqi presidential referendum | 2002-10-16 | 10 | no location | [article](https://en.wikipedia.org/wiki/2002_Iraqi_presidential_referendum) | [Q3454894](https://www.wikidata.org/wiki/Q3454894) |
| 183 | 2016 Jordanian general election | 2016-09-20 | 10 | no location | [article](https://en.wikipedia.org/wiki/2016_Jordanian_general_election) | [Q24701991](https://www.wikidata.org/wiki/Q24701991) |
| 184 | 1946 Turkish general election | 1946-07-21 | 10 | no location | [article](https://en.wikipedia.org/wiki/1946_Turkish_general_election) | [Q1162921](https://www.wikidata.org/wiki/Q1162921) |
| 185 | 1985 Iranian presidential election | 1985-08-16 | 10 | no location | [article](https://en.wikipedia.org/wiki/1985_Iranian_presidential_election) | [Q968607](https://www.wikidata.org/wiki/Q968607) |
| 186 | 2024 Syrian parliamentary election | 2024-07-15 | 10 | no location | [article](https://en.wikipedia.org/wiki/2024_Syrian_parliamentary_election) | [Q125935043](https://www.wikidata.org/wiki/Q125935043) |
| 187 | 2020 Iranian legislative election | 2020-09-11 | 10 | no location | [article](https://en.wikipedia.org/wiki/2020_Iranian_legislative_election) | [Q56367484](https://www.wikidata.org/wiki/Q56367484) |
| 188 | 1996 Palestinian general election | 1996-01-20 | 10 | no location | [article](https://en.wikipedia.org/wiki/1996_Palestinian_general_election) | [Q2380927](https://www.wikidata.org/wiki/Q2380927) |
| 189 | 2005 Egyptian presidential election | 2005-09-07 | 10 | no location | [article](https://en.wikipedia.org/wiki/2005_Egyptian_presidential_election) | [Q2115151](https://www.wikidata.org/wiki/Q2115151) |
| 190 | October 1981 Iranian presidential election | 1981-10-02 | 10 | no location | [article](https://en.wikipedia.org/wiki/October_1981_Iranian_presidential_election) | [Q1672408](https://www.wikidata.org/wiki/Q1672408) |
| 191 | 2001 Iranian presidential election | 2001-06-08 | 10 | no location | [article](https://en.wikipedia.org/wiki/2001_Iranian_presidential_election) | [Q660173](https://www.wikidata.org/wiki/Q660173) |
| 192 | 2015 Egyptian parliamentary election | 2015-10-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/2015_Egyptian_parliamentary_election) | [Q627548](https://www.wikidata.org/wiki/Q627548) |
| 193 | 2015–2016 Lebanese protests | 2015-08-22 | 10 | no location | [article](https://en.wikipedia.org/wiki/2015%E2%80%932016_Lebanese_protests) | [Q20859038](https://www.wikidata.org/wiki/Q20859038) |
| 194 | Kuwaiti protests (2011–2012) | 2011-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Kuwaiti_protests_(2011%E2%80%932012)) | [Q428733](https://www.wikidata.org/wiki/Q428733) |
