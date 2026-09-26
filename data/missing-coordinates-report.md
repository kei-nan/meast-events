# Events without a precise location

Generated 2026-09-26T17:45:03.652Z by `node scripts/enrich-candidates.js`.

These events have **no coordinates on Wikipedia or Wikidata**, so atlas.wiki can only pin them at a
country-capital fallback (curated events only, labelled "approximate location") or not at all. Candidate events in
the second table ARE included in `data/events.proposed.json` with `location_quality: "none"` and
`coordinates: null` (listed and searchable, but no map marker; a location is never invented).

The fix belongs upstream: if you know the real location of an event, you can add a coordinate location
(property **P625**) to its Wikidata item (linked below) with a reference. This pipeline never invents
coordinates and never edits Wikipedia or Wikidata. Rows are sorted by significance = number of Wikimedia
sitelinks (the same objective signal used for inclusion; it is a proxy, see docs/DATA_POLICY.md).

## 1. Curated events (data/events.json) lacking a precise location - 81

| # | Event | Date | Sitelinks | Current fallback | Wikipedia | Wikidata |
|---|---|---|---|---|---|---|
| 1 | Saddam Hussein | 1979-07-16 | 170 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Saddam_Hussein) | [Q1316](https://www.wikidata.org/wiki/Q1316) |
| 2 | Islamic State | 2014-06-29 | 160 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Islamic_State) | [Q2429253](https://www.wikidata.org/wiki/Q2429253) |
| 3 | Hamas | 1987-12-14 | 149 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Hamas) | [Q38799](https://www.wikidata.org/wiki/Q38799) |
| 4 | Armenian Genocide | 1915-04-24 | 125 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Armenian_genocide) | [Q80034](https://www.wikidata.org/wiki/Q80034) |
| 5 | 2023 Israel–Hamas war | 2023-10-07 | 119 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Gaza_war) | [Q122962941](https://www.wikidata.org/wiki/Q122962941) |
| 6 | Gulf War | 1990-08-02 | 114 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Gulf_War) | [Q37643](https://www.wikidata.org/wiki/Q37643) |
| 7 | Arab Spring | 2010-12-18 | 112 | no location | [article](https://en.wikipedia.org/wiki/Arab_Spring) | [Q33761](https://www.wikidata.org/wiki/Q33761) |
| 8 | Six-Day War | 1967-06-05 | 108 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Six-Day_War) | [Q49077](https://www.wikidata.org/wiki/Q49077) |
| 9 | Iranian Revolution | 1978-01-07 | 102 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iranian_Revolution) | [Q126065](https://www.wikidata.org/wiki/Q126065) |
| 10 | Hafez al-Assad | 1970-11-13 | 96 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Hafez_al-Assad) | [Q118725](https://www.wikidata.org/wiki/Q118725) |
| 11 | Iran–Iraq War | 1980-09-22 | 96 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93Iraq_War) | [Q82664](https://www.wikidata.org/wiki/Q82664) |
| 12 | Yom Kippur War | 1973-10-06 | 93 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Yom_Kippur_War) | [Q49100](https://www.wikidata.org/wiki/Q49100) |
| 13 | Palestine Liberation Organization | 1964-05-28 | 90 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Palestine_Liberation_Organization) | [Q26683](https://www.wikidata.org/wiki/Q26683) |
| 14 | Suez Crisis | 1956-10-29 | 87 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Suez_Crisis) | [Q49101](https://www.wikidata.org/wiki/Q49101) |
| 15 | Balfour Declaration | 1917-11-02 | 86 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Balfour_Declaration) | [Q187152](https://www.wikidata.org/wiki/Q187152) |
| 16 | Balkan Wars | 1912-10-08 | 80 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Balkan_Wars) | [Q165725](https://www.wikidata.org/wiki/Q165725) |
| 17 | Twelve-Day War | 2025-06-13 | 76 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Twelve-Day_War) | [Q134900605](https://www.wikidata.org/wiki/Q134900605) |
| 18 | Treaty of Lausanne | 1923-07-24 | 74 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Treaty_of_Lausanne) | [Q193258](https://www.wikidata.org/wiki/Q193258) |
| 19 | 2006 Lebanon War | 2006-07-12 | 74 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/2006_Lebanon_War) | [Q49104](https://www.wikidata.org/wiki/Q49104) |
| 20 | Treaty of Sèvres | 1920-08-10 | 68 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Treaty_of_S%C3%A8vres) | [Q182515](https://www.wikidata.org/wiki/Q182515) |
| 21 | Turkish War of Independence | 1919-05-19 | 68 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Turkish_War_of_Independence) | [Q234738](https://www.wikidata.org/wiki/Q234738) |
| 22 | Sykes–Picot Agreement | 1916-05-16 | 67 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Sykes%E2%80%93Picot_Agreement) | [Q211674](https://www.wikidata.org/wiki/Q211674) |
| 23 | 1948 Palestine war | 1947-11-30 | 64 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/1948_Palestine_war) | [Q49097](https://www.wikidata.org/wiki/Q49097) |
| 24 | Lebanese Civil War | 1975-04-13 | 64 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/Lebanese_Civil_War) | [Q208484](https://www.wikidata.org/wiki/Q208484) |
| 25 | Oslo Accords | 1993-09-13 | 63 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Oslo_Accords) | [Q17013132](https://www.wikidata.org/wiki/Q17013132) |
| 26 | Italo-Turkish War | 1911-09-29 | 62 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Italo-Turkish_War) | [Q203824](https://www.wikidata.org/wiki/Q203824) |
| 27 | Gaza War (2008–09) | 2008-12-27 | 62 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Gaza_War_(2008%E2%80%932009)) | [Q170682](https://www.wikidata.org/wiki/Q170682) |
| 28 | 1973 oil crisis | 1973-10-17 | 60 | pin at Saudi Arabia capital (approximate) | [article](https://en.wikipedia.org/wiki/1973_oil_crisis) | [Q316817](https://www.wikidata.org/wiki/Q316817) |
| 29 | Yemeni civil war (2014–present) | 2014-09-16 | 59 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/Yemeni_civil_war_(2014%E2%80%93present)) | [Q19686631](https://www.wikidata.org/wiki/Q19686631) |
| 30 | Nakba | 1948-05-15 | 57 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Nakba) | [Q3266633](https://www.wikidata.org/wiki/Q3266633) |
| 31 | Arab Revolt | 1916-06-10 | 56 | pin at Saudi Arabia capital (approximate) | [article](https://en.wikipedia.org/wiki/Arab_Revolt) | [Q239060](https://www.wikidata.org/wiki/Q239060) |
| 32 | 1982 Lebanon War | 1982-06-06 | 54 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/1982_Lebanon_War) | [Q49103](https://www.wikidata.org/wiki/Q49103) |
| 33 | Mahsa Amini protests | 2022-09-16 | 53 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Mahsa_Amini_protests) | [Q114065797](https://www.wikidata.org/wiki/Q114065797) |
| 34 | 1953 Iranian coup d'état | 1953-08-15 | 51 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/1953_Iranian_coup_d'%C3%A9tat) | [Q593774](https://www.wikidata.org/wiki/Q593774) |
| 35 | First Intifada | 1987-12-08 | 51 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/First_Intifada) | [Q49105](https://www.wikidata.org/wiki/Q49105) |
| 36 | United Nations Partition Plan for Palestine | 1947-11-29 | 50 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/United_Nations_Partition_Plan_for_Palestine) | [Q846795](https://www.wikidata.org/wiki/Q846795) |
| 37 | Baghdad Pact | 1955-02-24 | 50 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Central_Treaty_Organization) | [Q379850](https://www.wikidata.org/wiki/Q379850) |
| 38 | Camp David Accords | 1978-09-17 | 50 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Camp_David_Accords) | [Q309204](https://www.wikidata.org/wiki/Q309204) |
| 39 | Egyptian revolution of 1952 | 1952-07-23 | 49 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Egyptian_revolution_of_1952) | [Q1780431](https://www.wikidata.org/wiki/Q1780431) |
| 40 | Invasion of Iraq | 2003-03-20 | 49 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/2003_invasion_of_Iraq) | [Q107802](https://www.wikidata.org/wiki/Q107802) |
| 41 | Second Intifada | 2000-09-28 | 48 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Second_Intifada) | [Q49106](https://www.wikidata.org/wiki/Q49106) |
| 42 | Young Turk Revolution | 1908-07-03 | 46 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Young_Turk_Revolution) | [Q4298662](https://www.wikidata.org/wiki/Q4298662) |
| 43 | Qatar diplomatic crisis | 2017-06-05 | 46 | pin at Qatar capital (approximate) | [article](https://en.wikipedia.org/wiki/Qatar_diplomatic_crisis) | [Q30130610](https://www.wikidata.org/wiki/Q30130610) |
| 44 | Black September in Jordan | 1970-09-16 | 45 | pin at Jordan capital (approximate) | [article](https://en.wikipedia.org/wiki/Black_September) | [Q154288](https://www.wikidata.org/wiki/Q154288) |
| 45 | Anglo-Iraqi War | 1941-05-02 | 40 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Anglo-Iraqi_War) | [Q696848](https://www.wikidata.org/wiki/Q696848) |
| 46 | Yemeni Revolution | 2011-01-27 | 40 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/Yemeni_revolution) | [Q210005](https://www.wikidata.org/wiki/Q210005) |
| 47 | Joint Comprehensive Plan of Action | 2015-07-14 | 40 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iran_nuclear_deal) | [Q17001802](https://www.wikidata.org/wiki/Q17001802) |
| 48 | Abraham Accords | 2020-09-15 | 40 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Abraham_Accords) | [Q99495661](https://www.wikidata.org/wiki/Q99495661) |
| 49 | 1936–39 Arab revolt in Palestine | 1936-04-19 | 36 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/1936%E2%80%931939_Arab_revolt_in_Palestine) | [Q46057](https://www.wikidata.org/wiki/Q46057) |
| 50 | Jordanian independence | 1946-05-25 | 35 | pin at Jordan capital (approximate) | [article](https://en.wikipedia.org/wiki/History_of_Jordan) | [Q1639050](https://www.wikidata.org/wiki/Q1639050) |
| 51 | Jewish exodus from the Muslim world | 1948-01-01 | 34 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Jewish_exodus_from_the_Muslim_world) | [Q276172](https://www.wikidata.org/wiki/Q276172) |
| 52 | Egypt–Israel peace treaty | 1979-03-26 | 34 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Egypt%E2%80%93Israel_peace_treaty) | [Q1129412](https://www.wikidata.org/wiki/Q1129412) |
| 53 | Syria–Lebanon campaign | 1941-06-08 | 33 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Syria%E2%80%93Lebanon_campaign) | [Q770698](https://www.wikidata.org/wiki/Q770698) |
| 54 | 14 July Revolution | 1958-07-14 | 33 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/14_July_Revolution) | [Q2988530](https://www.wikidata.org/wiki/Q2988530) |
| 55 | North Yemen Civil War | 1962-09-26 | 33 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/North_Yemen_civil_war) | [Q521199](https://www.wikidata.org/wiki/Q521199) |
| 56 | Fall of the Assad regime | 2024-11-27 | 33 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Fall_of_the_Assad_regime) | [Q131404510](https://www.wikidata.org/wiki/Q131404510) |
| 57 | Israel–Jordan peace treaty | 1994-10-26 | 32 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Israel%E2%80%93Jordan_peace_treaty) | [Q620988](https://www.wikidata.org/wiki/Q620988) |
| 58 | Saudi Arabian–led intervention in Yemen | 2015-03-26 | 30 | pin at Yemen capital (approximate) | [article](https://en.wikipedia.org/wiki/Saudi-led_intervention_in_the_Yemeni_civil_war) | [Q19682450](https://www.wikidata.org/wiki/Q19682450) |
| 59 | 2024 Israel–Hezbollah conflict | 2024-09-23 | 30 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/Hezbollah%E2%80%93Israel_conflict_(2023%E2%80%93present)) | [Q122974556](https://www.wikidata.org/wiki/Q122974556) |
| 60 | Franco-Syrian War | 1920-04-08 | 27 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Franco-Syrian_War) | [Q2992403](https://www.wikidata.org/wiki/Q2992403) |
| 61 | Cedar Revolution | 2005-02-14 | 27 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/Cedar_Revolution) | [Q184310](https://www.wikidata.org/wiki/Q184310) |
| 62 | Great Syrian Revolt | 1925-07-18 | 26 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/Great_Syrian_Revolt) | [Q1968718](https://www.wikidata.org/wiki/Q1968718) |
| 63 | Israeli disengagement from Gaza | 2005-08-15 | 25 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Israeli_disengagement_from_the_Gaza_Strip) | [Q196122](https://www.wikidata.org/wiki/Q196122) |
| 64 | Peel Commission | 1936-11-01 | 24 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/Peel_Commission) | [Q655894](https://www.wikidata.org/wiki/Q655894) |
| 65 | Iraqi revolt against the British | 1920-05-30 | 23 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Iraqi_Revolt) | [Q616851](https://www.wikidata.org/wiki/Q616851) |
| 66 | White Paper of 1939 | 1939-05-17 | 23 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/White_Paper_of_1939) | [Q1501775](https://www.wikidata.org/wiki/Q1501775) |
| 67 | South Lebanon conflict (1985–2000) | 1985-02-16 | 23 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/South_Lebanon_conflict_(1985%E2%80%932000)) | [Q2479435](https://www.wikidata.org/wiki/Q2479435) |
| 68 | Execution of Saddam Hussein | 2006-12-30 | 23 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Execution_of_Saddam_Hussein) | [Q1193136](https://www.wikidata.org/wiki/Q1193136) |
| 69 | Unification of Saudi Arabia | 1932-09-23 | 22 | pin at Saudi Arabia capital (approximate) | [article](https://en.wikipedia.org/wiki/Formation_of_Saudi_Arabia) | [Q251600](https://www.wikidata.org/wiki/Q251600) |
| 70 | National Pact | 1943-11-22 | 22 | pin at Lebanon capital (approximate) | [article](https://en.wikipedia.org/wiki/National_Pact) | [Q748819](https://www.wikidata.org/wiki/Q748819) |
| 71 | 1949 Armistice Agreements | 1949-02-24 | 21 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/1949_Armistice_Agreements) | [Q999143](https://www.wikidata.org/wiki/Q999143) |
| 72 | 1966 Syrian coup d'état | 1966-02-23 | 19 | pin at Syria capital (approximate) | [article](https://en.wikipedia.org/wiki/1966_Syrian_coup_d'%C3%A9tat) | [Q3560385](https://www.wikidata.org/wiki/Q3560385) |
| 73 | Fall of Baghdad (1917) | 1917-03-11 | 18 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Fall_of_Baghdad_(1917)) | [Q2665637](https://www.wikidata.org/wiki/Q2665637) |
| 74 | 1968 Iraqi coup d'état | 1968-07-17 | 17 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/17_July_Revolution) | [Q4120226](https://www.wikidata.org/wiki/Q4120226) |
| 75 | United States recognition of Jerusalem as the capital of Israel | 2018-05-14 | 15 | pin at Israel/Palestine capital (approximate) | [article](https://en.wikipedia.org/wiki/United_States_recognition_of_Jerusalem_as_capital_of_Israel) | [Q45266620](https://www.wikidata.org/wiki/Q45266620) |
| 76 | Iranian Green Movement | 2009-06-13 | 14 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/Iranian_Green_Movement) | [Q2626387](https://www.wikidata.org/wiki/Q2626387) |
| 77 | Abolition of the Ottoman Caliphate | 1924-03-03 | 13 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Abolition_of_the_Caliphate) | [Q2821698](https://www.wikidata.org/wiki/Q2821698) |
| 78 | United States withdrawal from the Joint Comprehensive Plan of Action | 2018-05-08 | 12 | pin at Iran capital (approximate) | [article](https://en.wikipedia.org/wiki/United_States_withdrawal_from_the_Iran_nuclear_deal) | [Q52836581](https://www.wikidata.org/wiki/Q52836581) |
| 79 | Anglo-Iraqi Treaty (1930) | 1932-10-03 | 11 | pin at Iraq capital (approximate) | [article](https://en.wikipedia.org/wiki/Anglo-Iraqi_Treaty_of_1930) | [Q541372](https://www.wikidata.org/wiki/Q541372) |
| 80 | Egyptian crisis (2011–2014) | 2012-06-30 | 10 | pin at Egypt capital (approximate) | [article](https://en.wikipedia.org/wiki/Egyptian_Crisis_(2011%E2%80%932014)) | [Q577539](https://www.wikidata.org/wiki/Q577539) |
| 81 | Ottoman entry into World War I | 1914-10-29 | 8 | pin at Turkey capital (approximate) | [article](https://en.wikipedia.org/wiki/Ottoman_entry_into_World_War_I) | [Q1328496](https://www.wikidata.org/wiki/Q1328496) |

## 2. Discovered candidates (sitelinks >= 10) proposed with location_quality "none" (no real location) - 197

| # | Event | Date | Sitelinks | Current fallback | Wikipedia | Wikidata |
|---|---|---|---|---|---|---|
| 1 | World War II | 1939-09-01 | 291 | no location | [article](https://en.wikipedia.org/wiki/World_War_II) | [Q362](https://www.wikidata.org/wiki/Q362) |
| 2 | World War I | 1914-07-28 | 264 | no location | [article](https://en.wikipedia.org/wiki/World_War_I) | [Q361](https://www.wikidata.org/wiki/Q361) |
| 3 | Iraq War | 2003-03-20 | 110 | no location | [article](https://en.wikipedia.org/wiki/Iraq_War) | [Q545449](https://www.wikidata.org/wiki/Q545449) |
| 4 | 2026 Iran war | 2026-01-01 | 101 | no location | [article](https://en.wikipedia.org/wiki/2026_Iran_war) | [Q138503695](https://www.wikidata.org/wiki/Q138503695) |
| 5 | Gaza genocide | 2023-10-07 | 91 | no location | [article](https://en.wikipedia.org/wiki/Gaza_genocide) | [Q124086054](https://www.wikidata.org/wiki/Q124086054) |
| 6 | 2016 Turkish coup d'état attempt | 2016-07-16 | 77 | no location | [article](https://en.wikipedia.org/wiki/2016_Turkish_coup_d'%C3%A9tat_attempt) | [Q25906338](https://www.wikidata.org/wiki/Q25906338) |
| 7 | 2025–2026 Iranian protests | 2020-01-01 | 65 | no location | [article](https://en.wikipedia.org/wiki/2025%E2%80%932026_Iranian_protests) | [Q137612545](https://www.wikidata.org/wiki/Q137612545) |
| 8 | 2014 Gaza War | 2014-01-01 | 61 | no location | [article](https://en.wikipedia.org/wiki/2014_Gaza_War) | [Q17324420](https://www.wikidata.org/wiki/Q17324420) |
| 9 | Greco-Turkish War (1919–1922) | 1919-05-15 | 55 | no location | [article](https://en.wikipedia.org/wiki/Greco-Turkish_War_(1919%E2%80%931922)) | [Q87138](https://www.wikidata.org/wiki/Q87138) |
| 10 | 1948 Arab–Israeli War | 1940-01-01 | 50 | no location | [article](https://en.wikipedia.org/wiki/1948_Arab%E2%80%93Israeli_War) | [Q49092](https://www.wikidata.org/wiki/Q49092) |
| 11 | June 2025 Israeli strikes on Iran | 2025-06-01 | 48 | no location | [article](https://en.wikipedia.org/wiki/List_of_attacks_during_the_Twelve-Day_War) | [Q134884640](https://www.wikidata.org/wiki/Q134884640) |
| 12 | 2024 Lebanon electronic device attacks | 2024-09-18 | 46 | no location | [article](https://en.wikipedia.org/wiki/2024_Lebanon_electronic_device_attacks) | [Q130314422](https://www.wikidata.org/wiki/Q130314422) |
| 13 | Iraqi invasion of Kuwait | 2009-08-02 | 45 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_invasion_of_Kuwait) | [Q856650](https://www.wikidata.org/wiki/Q856650) |
| 14 | 2019 Turkish offensive into northeastern Syria | 2019-01-01 | 41 | no location | [article](https://en.wikipedia.org/wiki/2019_Turkish_offensive_into_northeastern_Syria) | [Q70207089](https://www.wikidata.org/wiki/Q70207089) |
| 15 | White Revolution | 1963-01-01 | 39 | no location | [article](https://en.wikipedia.org/wiki/White_Revolution) | [Q1068139](https://www.wikidata.org/wiki/Q1068139) |
| 16 | Montreux Convention Regarding the Regime of the Straits | 1936-01-01 | 38 | no location | [article](https://en.wikipedia.org/wiki/Montreux_Convention_Regarding_the_Regime_of_the_Straits) | [Q869500](https://www.wikidata.org/wiki/Q869500) |
| 17 | 2017 Turkish constitutional referendum | 2017-04-16 | 38 | no location | [article](https://en.wikipedia.org/wiki/2017_Turkish_constitutional_referendum) | [Q28062036](https://www.wikidata.org/wiki/Q28062036) |
| 18 | Constitutionalization attempts in Iran | 1905-01-01 | 36 | no location | [article](https://en.wikipedia.org/wiki/Constitutionalization_attempts_in_Iran) | [Q1368440](https://www.wikidata.org/wiki/Q1368440) |
| 19 | Red Sea crisis | 2023-10-19 | 36 | no location | [article](https://en.wikipedia.org/wiki/Red_Sea_crisis) | [Q123285238](https://www.wikidata.org/wiki/Q123285238) |
| 20 | 2017 Kurdistan Region independence referendum | 2017-09-25 | 36 | no location | [article](https://en.wikipedia.org/wiki/2017_Kurdistan_Region_independence_referendum) | [Q18206659](https://www.wikidata.org/wiki/Q18206659) |
| 21 | Mecca Joint Defence Agreement | 2026-08-07 | 35 | no location | [article](https://en.wikipedia.org/wiki/Mecca_Joint_Defence_Agreement) | [Q140932341](https://www.wikidata.org/wiki/Q140932341) |
| 22 | Iran–Saudi Arabia proxy war | 1979-02-11 | 32 | no location | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93Saudi_Arabia_proxy_war) | [Q22948406](https://www.wikidata.org/wiki/Q22948406) |
| 23 | War in Iraq (2013–2017) | 2014-01-01 | 32 | no location | [article](https://en.wikipedia.org/wiki/War_in_Iraq_(2013%E2%80%932017)) | [Q17984356](https://www.wikidata.org/wiki/Q17984356) |
| 24 | 2025–2026 Iran massacres | 2025-12-30 | 32 | no location | [article](https://en.wikipedia.org/wiki/2025%E2%80%932026_Iran_massacres) | [Q137703947](https://www.wikidata.org/wiki/Q137703947) |
| 25 | 1980 Turkish coup d'état | 1980-09-12 | 31 | no location | [article](https://en.wikipedia.org/wiki/1980_Turkish_coup_d'%C3%A9tat) | [Q1758028](https://www.wikidata.org/wiki/Q1758028) |
| 26 | Dersim massacre | 1937-05-01 | 30 | no location | [article](https://en.wikipedia.org/wiki/Dersim_massacre) | [Q1327772](https://www.wikidata.org/wiki/Q1327772) |
| 27 | Operation Prosperity Guardian | 2023-12-18 | 30 | no location | [article](https://en.wikipedia.org/wiki/Operation_Prosperity_Guardian) | [Q123912788](https://www.wikidata.org/wiki/Q123912788) |
| 28 | Arab Winter | 2012-01-01 | 29 | no location | [article](https://en.wikipedia.org/wiki/Arab_Winter) | [Q17512479](https://www.wikidata.org/wiki/Q17512479) |
| 29 | United States–Taliban deal | 2020-02-29 | 29 | no location | [article](https://en.wikipedia.org/wiki/United_States%E2%80%93Taliban_deal) | [Q107354956](https://www.wikidata.org/wiki/Q107354956) |
| 30 | 1919 Egyptian revolution | 1919-01-01 | 29 | no location | [article](https://en.wikipedia.org/wiki/1919_Egyptian_revolution) | [Q1993171](https://www.wikidata.org/wiki/Q1993171) |
| 31 | 2024 Lebanon war | 2020-01-01 | 28 | no location | [article](https://en.wikipedia.org/wiki/2024_Lebanon_war) | [Q130388076](https://www.wikidata.org/wiki/Q130388076) |
| 32 | Iran–Israel proxy conflict | 1985-02-16 | 27 | no location | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93Israel_proxy_conflict) | [Q15059994](https://www.wikidata.org/wiki/Q15059994) |
| 33 | Operation Nemesis | 1920-01-01 | 27 | no location | [article](https://en.wikipedia.org/wiki/Operation_Nemesis) | [Q2475091](https://www.wikidata.org/wiki/Q2475091) |
| 34 | Black Sea Grain Initiative | 2022-07-22 | 26 | no location | [article](https://en.wikipedia.org/wiki/Black_Sea_Grain_Initiative) | [Q113295397](https://www.wikidata.org/wiki/Q113295397) |
| 35 | 1963 Syrian coup d'état | 1963-03-08 | 26 | no location | [article](https://en.wikipedia.org/wiki/1963_Syrian_coup_d'%C3%A9tat) | [Q2475925](https://www.wikidata.org/wiki/Q2475925) |
| 36 | Operation Inherent Resolve | 2014-09-22 | 26 | no location | [article](https://en.wikipedia.org/wiki/Operation_Inherent_Resolve) | [Q18357664](https://www.wikidata.org/wiki/Q18357664) |
| 37 | 1998 bombing of Iraq | 1998-01-01 | 26 | no location | [article](https://en.wikipedia.org/wiki/1998_bombing_of_Iraq) | [Q1327861](https://www.wikidata.org/wiki/Q1327861) |
| 38 | Operation Atalanta | 2008-12-08 | 26 | no location | [article](https://en.wikipedia.org/wiki/Operation_Atalanta) | [Q698771](https://www.wikidata.org/wiki/Q698771) |
| 39 | 1960 Turkish coup d'état | 1960-05-27 | 25 | no location | [article](https://en.wikipedia.org/wiki/1960_Turkish_coup_d'%C3%A9tat) | [Q1859259](https://www.wikidata.org/wiki/Q1859259) |
| 40 | Yazidi genocide | 2014-08-01 | 25 | no location | [article](https://en.wikipedia.org/wiki/Yazidi_genocide) | [Q21190910](https://www.wikidata.org/wiki/Q21190910) |
| 41 | Rojava Revolution | 2012-07-19 | 25 | no location | [article](https://en.wikipedia.org/wiki/Rojava_Revolution) | [Q2384201](https://www.wikidata.org/wiki/Q2384201) |
| 42 | Kurdish–Turkish conflict | 1921-03-06 | 25 | no location | [article](https://en.wikipedia.org/wiki/Kurdish%E2%80%93Turkish_conflict) | [Q6445763](https://www.wikidata.org/wiki/Q6445763) |
| 43 | Sheikh Said rebellion | 1925-02-13 | 25 | no location | [article](https://en.wikipedia.org/wiki/Sheikh_Said_rebellion) | [Q619712](https://www.wikidata.org/wiki/Q619712) |
| 44 | Balkan Pact (1953) | 1953-02-28 | 24 | no location | [article](https://en.wikipedia.org/wiki/Balkan_Pact_(1953)) | [Q805061](https://www.wikidata.org/wiki/Q805061) |
| 45 | Treaty of Ankara (1921) | 1921-10-20 | 24 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Ankara_(1921)) | [Q2358950](https://www.wikidata.org/wiki/Q2358950) |
| 46 | Gaza war hostage crisis | 2023-10-01 | 24 | no location | [article](https://en.wikipedia.org/wiki/Gaza_war_hostage_crisis) | [Q123005094](https://www.wikidata.org/wiki/Q123005094) |
| 47 | Yemeni civil war (1994) | 1994-05-04 | 23 | no location | [article](https://en.wikipedia.org/wiki/Yemeni_civil_war_(1994)) | [Q2461485](https://www.wikidata.org/wiki/Q2461485) |
| 48 | Franco-Turkish War | 1918-12-01 | 23 | no location | [article](https://en.wikipedia.org/wiki/Franco-Turkish_War) | [Q1450532](https://www.wikidata.org/wiki/Q1450532) |
| 49 | Treaty of Constantinople (1913) | 1913-09-29 | 23 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Constantinople_(1913)) | [Q269606](https://www.wikidata.org/wiki/Q269606) |
| 50 | September 2024 Israeli attacks against Lebanon | 2024-09-23 | 23 | no location | [article](https://en.wikipedia.org/wiki/September_2024_Israeli_attacks_against_Lebanon) | [Q130354504](https://www.wikidata.org/wiki/Q130354504) |
| 51 | Treaty of Saadabad | 1937-07-08 | 22 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Saadabad) | [Q537143](https://www.wikidata.org/wiki/Q537143) |
| 52 | Iraqi insurgency (2011–2013) | 2011-01-01 | 22 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_insurgency_(2011%E2%80%932013)) | [Q2165215](https://www.wikidata.org/wiki/Q2165215) |
| 53 | Operation Magic Carpet (Yemen) | 1949-06-01 | 22 | no location | [article](https://en.wikipedia.org/wiki/Operation_Magic_Carpet_(Yemen)) | [Q113016](https://www.wikidata.org/wiki/Q113016) |
| 54 | January 2025 Gaza war ceasefire | 2025-01-15 | 22 | no location | [article](https://en.wikipedia.org/wiki/January_2025_Gaza_war_ceasefire) | [Q131760224](https://www.wikidata.org/wiki/Q131760224) |
| 55 | March 2025 Israeli attacks on the Gaza Strip | 2025-03-18 | 21 | no location | [article](https://en.wikipedia.org/wiki/March_2025_Israeli_attacks_on_the_Gaza_Strip) | [Q133309815](https://www.wikidata.org/wiki/Q133309815) |
| 56 | 1991 Iraqi uprisings | 1991-01-01 | 21 | no location | [article](https://en.wikipedia.org/wiki/1991_Iraqi_uprisings) | [Q760002](https://www.wikidata.org/wiki/Q760002) |
| 57 | 1948 Palestinian expulsion and flight | 1948-01-01 | 21 | no location | [article](https://en.wikipedia.org/wiki/1948_Palestinian_expulsion_and_flight) | [Q13220089](https://www.wikidata.org/wiki/Q13220089) |
| 58 | 2022 Gaza–Israel clashes | 2022-08-01 | 21 | no location | [article](https://en.wikipedia.org/wiki/2022_Gaza%E2%80%93Israel_clashes) | [Q113453221](https://www.wikidata.org/wiki/Q113453221) |
| 59 | Reparations Agreement between Israel and the Federal Republic of Germany | 1952-09-10 | 20 | no location | [article](https://en.wikipedia.org/wiki/Reparations_Agreement_between_Israel_and_the_Federal_Republic_of_Germany) | [Q660521](https://www.wikidata.org/wiki/Q660521) |
| 60 | Israeli blockade of the Gaza Strip (2023–present) | 2023-01-01 | 20 | no location | [article](https://en.wikipedia.org/wiki/Israeli_blockade_of_the_Gaza_Strip_(2023%E2%80%93present)) | [Q122982851](https://www.wikidata.org/wiki/Q122982851) |
| 61 | Black Friday (1978) | 1978-09-08 | 20 | no location | [article](https://en.wikipedia.org/wiki/Black_Friday_(1978)) | [Q1899132](https://www.wikidata.org/wiki/Q1899132) |
| 62 | Dhofar rebellion | 1963-06-09 | 20 | no location | [article](https://en.wikipedia.org/wiki/Dhofar_rebellion) | [Q2363565](https://www.wikidata.org/wiki/Q2363565) |
| 63 | Operation Barkhane | 2014-08-01 | 20 | no location | [article](https://en.wikipedia.org/wiki/Operation_Barkhane) | [Q17354007](https://www.wikidata.org/wiki/Q17354007) |
| 64 | Operation Defensive Shield | 2002-03-29 | 20 | no location | [article](https://en.wikipedia.org/wiki/Operation_Defensive_Shield) | [Q2276724](https://www.wikidata.org/wiki/Q2276724) |
| 65 | Operation Praying Mantis | 1988-04-18 | 19 | no location | [article](https://en.wikipedia.org/wiki/Operation_Praying_Mantis) | [Q2026308](https://www.wikidata.org/wiki/Q2026308) |
| 66 | Operation Grapes of Wrath | 1996-04-27 | 19 | no location | [article](https://en.wikipedia.org/wiki/Operation_Grapes_of_Wrath) | [Q1473919](https://www.wikidata.org/wiki/Q1473919) |
| 67 | Syrian revolution | 2011-03-15 | 19 | no location | [article](https://en.wikipedia.org/wiki/Syrian_revolution) | [Q14746872](https://www.wikidata.org/wiki/Q14746872) |
| 68 | Armistice of Erzincan | 1917-12-18 | 19 | no location | [article](https://en.wikipedia.org/wiki/Armistice_of_Erzincan) | [Q28048694](https://www.wikidata.org/wiki/Q28048694) |
| 69 | 1921 Persian coup d'état | 1921-02-21 | 19 | no location | [article](https://en.wikipedia.org/wiki/1921_Persian_coup_d'%C3%A9tat) | [Q1131857](https://www.wikidata.org/wiki/Q1131857) |
| 70 | Iraqi Turkmen genocide | 2014-08-01 | 19 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_Turkmen_genocide) | [Q116783960](https://www.wikidata.org/wiki/Q116783960) |
| 71 | Gaza Strip famine | 2023-10-01 | 19 | no location | [article](https://en.wikipedia.org/wiki/Gaza_Strip_famine) | [Q124302798](https://www.wikidata.org/wiki/Q124302798) |
| 72 | Gaza peace summit | 2025-10-13 | 19 | no location | [article](https://en.wikipedia.org/wiki/Gaza_peace_summit) | [Q136486580](https://www.wikidata.org/wiki/Q136486580) |
| 73 | German–Ottoman alliance | 1914-08-02 | 18 | no location | [article](https://en.wikipedia.org/wiki/German%E2%80%93Ottoman_alliance) | [Q261982](https://www.wikidata.org/wiki/Q261982) |
| 74 | 1970 Syrian coup d'etat | 1970-11-13 | 18 | no location | [article](https://en.wikipedia.org/wiki/1970_Syrian_coup_d'etat) | [Q14947304](https://www.wikidata.org/wiki/Q14947304) |
| 75 | Tel al-Zaatar massacre | 1976-08-12 | 18 | no location | [article](https://en.wikipedia.org/wiki/Tel_al-Zaatar_massacre) | [Q2359563](https://www.wikidata.org/wiki/Q2359563) |
| 76 | 31 March incident | 1909-04-13 | 18 | no location | [article](https://en.wikipedia.org/wiki/31_March_incident) | [Q2073490](https://www.wikidata.org/wiki/Q2073490) |
| 77 | Operation Badr (1973) | 1973-01-01 | 18 | no location | [article](https://en.wikipedia.org/wiki/Operation_Badr_(1973)) | [Q2704666](https://www.wikidata.org/wiki/Q2704666) |
| 78 | 2024 Israel–Lebanon ceasefire agreement | 2024-11-27 | 18 | no location | [article](https://en.wikipedia.org/wiki/2024_Israel%E2%80%93Lebanon_ceasefire_agreement) | [Q131338691](https://www.wikidata.org/wiki/Q131338691) |
| 79 | Battle of Sderot | 2023-10-07 | 17 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Sderot) | [Q122972407](https://www.wikidata.org/wiki/Q122972407) |
| 80 | Battle of Aqaba | 1917-07-06 | 17 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Aqaba) | [Q2081944](https://www.wikidata.org/wiki/Q2081944) |
| 81 | Battle of the Sakarya | 1921-08-23 | 17 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_the_Sakarya) | [Q594015](https://www.wikidata.org/wiki/Q594015) |
| 82 | Saudi–Yemeni war (1934) | 1934-03-01 | 17 | no location | [article](https://en.wikipedia.org/wiki/Saudi%E2%80%93Yemeni_war_(1934)) | [Q1367731](https://www.wikidata.org/wiki/Q1367731) |
| 83 | 1971 Turkish military memorandum | 1971-03-12 | 17 | no location | [article](https://en.wikipedia.org/wiki/1971_Turkish_military_memorandum) | [Q931943](https://www.wikidata.org/wiki/Q931943) |
| 84 | Aden Emergency | 1963-10-14 | 17 | no location | [article](https://en.wikipedia.org/wiki/Aden_Emergency) | [Q3299864](https://www.wikidata.org/wiki/Q3299864) |
| 85 | Operation Spring Shield | 2020-02-27 | 17 | no location | [article](https://en.wikipedia.org/wiki/Operation_Spring_Shield) | [Q86832624](https://www.wikidata.org/wiki/Q86832624) |
| 86 | Operation Active Endeavour | 2001-10-26 | 17 | no location | [article](https://en.wikipedia.org/wiki/Operation_Active_Endeavour) | [Q684446](https://www.wikidata.org/wiki/Q684446) |
| 87 | 1979 Iranian Islamic Republic referendum | 1979-03-31 | 17 | no location | [article](https://en.wikipedia.org/wiki/1979_Iranian_Islamic_Republic_referendum) | [Q4231692](https://www.wikidata.org/wiki/Q4231692) |
| 88 | Battle of Re'im | 2023-10-07 | 16 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Re'im) | [Q122971969](https://www.wikidata.org/wiki/Q122971969) |
| 89 | Battle of Mecca (1916) | 1916-06-10 | 16 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Mecca_(1916)) | [Q2089020](https://www.wikidata.org/wiki/Q2089020) |
| 90 | Battle of Dumlupınar | 1922-08-26 | 16 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Dumlup%C4%B1nar) | [Q2445317](https://www.wikidata.org/wiki/Q2445317) |
| 91 | Ankara Agreement | 1963-09-12 | 16 | no location | [article](https://en.wikipedia.org/wiki/Ankara_Agreement) | [Q745136](https://www.wikidata.org/wiki/Q745136) |
| 92 | Attempted assassination of Abdul Hamid II | 1905-06-21 | 16 | no location | [article](https://en.wikipedia.org/wiki/Attempted_assassination_of_Abdul_Hamid_II) | [Q3845560](https://www.wikidata.org/wiki/Q3845560) |
| 93 | Nuseirat rescue and massacre | 2024-06-08 | 16 | no location | [article](https://en.wikipedia.org/wiki/Nuseirat_rescue_and_massacre) | [Q126416493](https://www.wikidata.org/wiki/Q126416493) |
| 94 | Turkish involvement in the Syrian civil war | 2011-01-01 | 16 | no location | [article](https://en.wikipedia.org/wiki/Turkish_involvement_in_the_Syrian_civil_war) | [Q18208094](https://www.wikidata.org/wiki/Q18208094) |
| 95 | Operation Southern Watch | 1992-08-27 | 16 | no location | [article](https://en.wikipedia.org/wiki/Operation_Southern_Watch) | [Q2026406](https://www.wikidata.org/wiki/Q2026406) |
| 96 | Northwestern Syria offensive (2019–2020) | 2019-12-19 | 16 | no location | [article](https://en.wikipedia.org/wiki/Northwestern_Syria_offensive_(2019%E2%80%932020)) | [Q79629688](https://www.wikidata.org/wiki/Q79629688) |
| 97 | Operation Dani | 1948-01-01 | 16 | no location | [article](https://en.wikipedia.org/wiki/Operation_Dani) | [Q2916659](https://www.wikidata.org/wiki/Q2916659) |
| 98 | 2008 Turkish incursion into northern Iraq | 2008-02-21 | 16 | no location | [article](https://en.wikipedia.org/wiki/2008_Turkish_incursion_into_northern_Iraq) | [Q2430581](https://www.wikidata.org/wiki/Q2430581) |
| 99 | Anbar campaign (2013–2014) | 2013-12-30 | 15 | no location | [article](https://en.wikipedia.org/wiki/Anbar_campaign_(2013%E2%80%932014)) | [Q15553019](https://www.wikidata.org/wiki/Q15553019) |
| 100 | Operation Earnest Will | 1987-07-24 | 15 | no location | [article](https://en.wikipedia.org/wiki/Operation_Earnest_Will) | [Q1687078](https://www.wikidata.org/wiki/Q1687078) |
| 101 | Iraqi conflict | 2003-03-20 | 15 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_conflict) | [Q47015896](https://www.wikidata.org/wiki/Q47015896) |
| 102 | Treaty of Jeddah (1927) | 1927-01-01 | 15 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Jeddah_(1927)) | [Q17035545](https://www.wikidata.org/wiki/Q17035545) |
| 103 | Treaty of Darin | 1915-12-26 | 15 | no location | [article](https://en.wikipedia.org/wiki/Treaty_of_Darin) | [Q7837031](https://www.wikidata.org/wiki/Q7837031) |
| 104 | Houthi takeover of Yemen | 2014-09-21 | 15 | no location | [article](https://en.wikipedia.org/wiki/Houthi_takeover_of_Yemen) | [Q18145759](https://www.wikidata.org/wiki/Q18145759) |
| 105 | 2025 massacres of Syrian Alawites | 2025-03-06 | 15 | no location | [article](https://en.wikipedia.org/wiki/2025_massacres_of_Syrian_Alawites) | [Q133187598](https://www.wikidata.org/wiki/Q133187598) |
| 106 | Mahshahr massacre | 2019-11-16 | 15 | no location | [article](https://en.wikipedia.org/wiki/Mahshahr_massacre) | [Q77513637](https://www.wikidata.org/wiki/Q77513637) |
| 107 | Kidnapping and killing of the Bibas family | 2023-10-07 | 15 | no location | [article](https://en.wikipedia.org/wiki/Kidnapping_and_killing_of_the_Bibas_family) | [Q123907413](https://www.wikidata.org/wiki/Q123907413) |
| 108 | Southern Syria clashes (July–September 2025) | 2025-07-13 | 14 | no location | [article](https://en.wikipedia.org/wiki/Southern_Syria_clashes_(July%E2%80%93September_2025)) | [Q135319143](https://www.wikidata.org/wiki/Q135319143) |
| 109 | Turkish capture of Smyrna | 1922-09-09 | 14 | no location | [article](https://en.wikipedia.org/wiki/Turkish_capture_of_Smyrna) | [Q12813016](https://www.wikidata.org/wiki/Q12813016) |
| 110 | 1920 capture of Damascus | 1920-07-24 | 14 | no location | [article](https://en.wikipedia.org/wiki/1920_capture_of_Damascus) | [Q7509962](https://www.wikidata.org/wiki/Q7509962) |
| 111 | Iraqi Kurdish Civil War | 1994-05-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_Kurdish_Civil_War) | [Q1154912](https://www.wikidata.org/wiki/Q1154912) |
| 112 | Jungle Movement of Gilan | 1915-10-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Jungle_Movement_of_Gilan) | [Q764038](https://www.wikidata.org/wiki/Q764038) |
| 113 | Uqair Protocol of 1922 | 1922-12-02 | 14 | no location | [article](https://en.wikipedia.org/wiki/Uqair_Protocol_of_1922) | [Q94635](https://www.wikidata.org/wiki/Q94635) |
| 114 | South Yemen insurgency | 2009-04-27 | 14 | no location | [article](https://en.wikipedia.org/wiki/South_Yemen_insurgency) | [Q632663](https://www.wikidata.org/wiki/Q632663) |
| 115 | Iraqi–Kurdish conflict | 1918-01-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Iraqi%E2%80%93Kurdish_conflict) | [Q6068230](https://www.wikidata.org/wiki/Q6068230) |
| 116 | Ararat rebellion | 1927-10-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/Ararat_rebellion) | [Q626264](https://www.wikidata.org/wiki/Q626264) |
| 117 | May 2023 Gaza–Israel clashes | 2023-05-01 | 14 | no location | [article](https://en.wikipedia.org/wiki/May_2023_Gaza%E2%80%93Israel_clashes) | [Q118234253](https://www.wikidata.org/wiki/Q118234253) |
| 118 | Operation Accountability | 1993-07-25 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Accountability) | [Q2026496](https://www.wikidata.org/wiki/Q2026496) |
| 119 | Operation Hiram | 1948-10-29 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Hiram) | [Q2915580](https://www.wikidata.org/wiki/Q2915580) |
| 120 | Operation Unified Protector | 2011-03-23 | 14 | no location | [article](https://en.wikipedia.org/wiki/Operation_Unified_Protector) | [Q3269455](https://www.wikidata.org/wiki/Q3269455) |
| 121 | Naval operations in the Dardanelles campaign | 1915-02-19 | 13 | no location | [article](https://en.wikipedia.org/wiki/Naval_operations_in_the_Dardanelles_campaign) | [Q2778755](https://www.wikidata.org/wiki/Q2778755) |
| 122 | May 17 Agreement | 1983-05-17 | 13 | no location | [article](https://en.wikipedia.org/wiki/May_17_Agreement) | [Q321851](https://www.wikidata.org/wiki/Q321851) |
| 123 | August 2025 Israeli attack on Sanaa | 2025-08-28 | 13 | no location | [article](https://en.wikipedia.org/wiki/August_2025_Israeli_attack_on_Sanaa) | [Q136001786](https://www.wikidata.org/wiki/Q136001786) |
| 124 | Maraş massacre | 1978-12-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/Mara%C5%9F_massacre) | [Q2096206](https://www.wikidata.org/wiki/Q2096206) |
| 125 | 1959 Mosul uprising | 1959-03-07 | 13 | no location | [article](https://en.wikipedia.org/wiki/1959_Mosul_uprising) | [Q12203911](https://www.wikidata.org/wiki/Q12203911) |
| 126 | Operation Aspides | 2024-02-19 | 13 | no location | [article](https://en.wikipedia.org/wiki/Operation_Aspides) | [Q124618589](https://www.wikidata.org/wiki/Q124618589) |
| 127 | March–May 2025 United States attacks in Yemen | 2025-03-15 | 13 | no location | [article](https://en.wikipedia.org/wiki/March%E2%80%93May_2025_United_States_attacks_in_Yemen) | [Q133287207](https://www.wikidata.org/wiki/Q133287207) |
| 128 | Operation Musketeer (1956) | 1956-11-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/Operation_Musketeer_(1956)) | [Q2915155](https://www.wikidata.org/wiki/Q2915155) |
| 129 | Operation Fath ol-Mobin | 1982-03-22 | 13 | no location | [article](https://en.wikipedia.org/wiki/Operation_Fath_ol-Mobin) | [Q3267722](https://www.wikidata.org/wiki/Q3267722) |
| 130 | War crimes in the Gaza war | 2023-01-01 | 13 | no location | [article](https://en.wikipedia.org/wiki/War_crimes_in_the_Gaza_war) | [Q123033523](https://www.wikidata.org/wiki/Q123033523) |
| 131 | Trebizond Peace Conference | 1918-03-12 | 13 | no location | [article](https://en.wikipedia.org/wiki/Trebizond_Peace_Conference) | [Q3686593](https://www.wikidata.org/wiki/Q3686593) |
| 132 | 2012 Egyptian constitutional referendum | 2012-12-15 | 13 | no location | [article](https://en.wikipedia.org/wiki/2012_Egyptian_constitutional_referendum) | [Q277144](https://www.wikidata.org/wiki/Q277144) |
| 133 | Operation Morvarid | 1980-11-29 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Morvarid) | [Q191577](https://www.wikidata.org/wiki/Q191577) |
| 134 | Battle for Jerusalem | 1947-12-01 | 12 | no location | [article](https://en.wikipedia.org/wiki/Battle_for_Jerusalem) | [Q2916279](https://www.wikidata.org/wiki/Q2916279) |
| 135 | Second Battle of İnönü | 1921-04-01 | 12 | no location | [article](https://en.wikipedia.org/wiki/Second_Battle_of_%C4%B0n%C3%B6n%C3%BC) | [Q2659746](https://www.wikidata.org/wiki/Q2659746) |
| 136 | 2003 Nasiriyah bombing | 2003-11-12 | 12 | no location | [article](https://en.wikipedia.org/wiki/2003_Nasiriyah_bombing) | [Q3629102](https://www.wikidata.org/wiki/Q3629102) |
| 137 | Operation Nachshon | 1948-04-05 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Nachshon) | [Q1375894](https://www.wikidata.org/wiki/Q1375894) |
| 138 | Operation Yoav | 1948-10-15 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Yoav) | [Q2890420](https://www.wikidata.org/wiki/Q2890420) |
| 139 | Operation Hot Winter | 2008-03-03 | 12 | no location | [article](https://en.wikipedia.org/wiki/Operation_Hot_Winter) | [Q2560749](https://www.wikidata.org/wiki/Q2560749) |
| 140 | Sexual and gender-based violence in the October 7 attacks | 2023-10-07 | 12 | no location | [article](https://en.wikipedia.org/wiki/Sexual_and_gender-based_violence_in_the_October_7_attacks) | [Q123615519](https://www.wikidata.org/wiki/Q123615519) |
| 141 | British Airways Flight 149 | 1990-08-02 | 12 | no location | [article](https://en.wikipedia.org/wiki/British_Airways_Flight_149) | [Q3296462](https://www.wikidata.org/wiki/Q3296462) |
| 142 | Aeroflot Flight 244 | 1970-10-15 | 12 | no location | [article](https://en.wikipedia.org/wiki/Aeroflot_Flight_244) | [Q2045629](https://www.wikidata.org/wiki/Q2045629) |
| 143 | 2014 Egyptian constitutional referendum | 2014-01-14 | 12 | no location | [article](https://en.wikipedia.org/wiki/2014_Egyptian_constitutional_referendum) | [Q15304061](https://www.wikidata.org/wiki/Q15304061) |
| 144 | 2012 Syrian constitutional referendum | 2012-02-26 | 12 | no location | [article](https://en.wikipedia.org/wiki/2012_Syrian_constitutional_referendum) | [Q2119324](https://www.wikidata.org/wiki/Q2119324) |
| 145 | 2010 Turkish constitutional referendum | 2010-09-12 | 12 | no location | [article](https://en.wikipedia.org/wiki/2010_Turkish_constitutional_referendum) | [Q250826](https://www.wikidata.org/wiki/Q250826) |
| 146 | Battle of Tel Hai | 1920-03-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Tel_Hai) | [Q4872527](https://www.wikidata.org/wiki/Q4872527) |
| 147 | Battle of Karbala (2003) | 2003-03-23 | 11 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Karbala_(2003)) | [Q4178089](https://www.wikidata.org/wiki/Q4178089) |
| 148 | Battle of Norfolk | 1991-02-27 | 11 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Norfolk) | [Q3636553](https://www.wikidata.org/wiki/Q3636553) |
| 149 | Operation Tariq al-Quds | 1981-12-07 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Tariq_al-Quds) | [Q1382298](https://www.wikidata.org/wiki/Q1382298) |
| 150 | Operation Kaman 99 | 1980-09-23 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Kaman_99) | [Q1149113](https://www.wikidata.org/wiki/Q1149113) |
| 151 | War in the Sahel | 2011-02-15 | 11 | no location | [article](https://en.wikipedia.org/wiki/War_in_the_Sahel) | [Q86831539](https://www.wikidata.org/wiki/Q86831539) |
| 152 | Iraqi civil war (2006–2008) | 2006-02-22 | 11 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_civil_war_(2006%E2%80%932008)) | [Q17183365](https://www.wikidata.org/wiki/Q17183365) |
| 153 | First Yemenite War | 1972-09-26 | 11 | no location | [article](https://en.wikipedia.org/wiki/First_Yemenite_War) | [Q16126368](https://www.wikidata.org/wiki/Q16126368) |
| 154 | South Yemeni crisis | 1986-01-13 | 11 | no location | [article](https://en.wikipedia.org/wiki/South_Yemeni_crisis) | [Q1276892](https://www.wikidata.org/wiki/Q1276892) |
| 155 | Zurich Protocols | 2009-10-10 | 11 | no location | [article](https://en.wikipedia.org/wiki/Zurich_Protocols) | [Q20512994](https://www.wikidata.org/wiki/Q20512994) |
| 156 | March 1949 Syrian coup d'état | 1949-03-29 | 11 | no location | [article](https://en.wikipedia.org/wiki/March_1949_Syrian_coup_d'%C3%A9tat) | [Q643510](https://www.wikidata.org/wiki/Q643510) |
| 157 | Menemen massacre | 1916-06-16 | 11 | no location | [article](https://en.wikipedia.org/wiki/Menemen_massacre) | [Q4809060](https://www.wikidata.org/wiki/Q4809060) |
| 158 | 1981 Iranian Prime Minister's office bombing | 1981-01-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/1981_Iranian_Prime_Minister's_office_bombing) | [Q5936879](https://www.wikidata.org/wiki/Q5936879) |
| 159 | Haft-e Tir bombing | 1981-06-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/Haft-e_Tir_bombing) | [Q5638475](https://www.wikidata.org/wiki/Q5638475) |
| 160 | Iraqi insurgency (2017–present) | 2017-12-09 | 11 | no location | [article](https://en.wikipedia.org/wiki/Iraqi_insurgency_(2017%E2%80%93present)) | [Q57890365](https://www.wikidata.org/wiki/Q57890365) |
| 161 | Gaza Strip evacuations | 2023-10-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/Gaza_Strip_evacuations) | [Q123049614](https://www.wikidata.org/wiki/Q123049614) |
| 162 | Opération Chammal | 2014-09-19 | 11 | no location | [article](https://en.wikipedia.org/wiki/Op%C3%A9ration_Chammal) | [Q18121535](https://www.wikidata.org/wiki/Q18121535) |
| 163 | Operation Mersad | 1988-07-26 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Mersad) | [Q2059536](https://www.wikidata.org/wiki/Q2059536) |
| 164 | Operation Uvda | 1949-03-05 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Uvda) | [Q931576](https://www.wikidata.org/wiki/Q931576) |
| 165 | Operation Mole Cricket 19 | 1982-06-09 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Mole_Cricket_19) | [Q2918913](https://www.wikidata.org/wiki/Q2918913) |
| 166 | Operation Provide Comfort | 1991-03-01 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Provide_Comfort) | [Q2281470](https://www.wikidata.org/wiki/Q2281470) |
| 167 | Seizure of Abu Musa and the Greater and Lesser Tunbs | 1971-11-30 | 11 | no location | [article](https://en.wikipedia.org/wiki/Seizure_of_Abu_Musa_and_the_Greater_and_Lesser_Tunbs) | [Q4115029](https://www.wikidata.org/wiki/Q4115029) |
| 168 | Operation Beit ol-Moqaddas | 1982-05-24 | 11 | no location | [article](https://en.wikipedia.org/wiki/Operation_Beit_ol-Moqaddas) | [Q3267731](https://www.wikidata.org/wiki/Q3267731) |
| 169 | 2025 Gaza Strip aid distribution killings | 2025-05-27 | 11 | no location | [article](https://en.wikipedia.org/wiki/2025_Gaza_Strip_aid_distribution_killings) | [Q134642893](https://www.wikidata.org/wiki/Q134642893) |
| 170 | Unilateral Declaration of Egyptian Independence | 1922-02-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/Unilateral_Declaration_of_Egyptian_Independence) | [Q2583161](https://www.wikidata.org/wiki/Q2583161) |
| 171 | 1979 Iranian constitutional referendum | 1979-12-03 | 11 | no location | [article](https://en.wikipedia.org/wiki/1979_Iranian_constitutional_referendum) | [Q4231925](https://www.wikidata.org/wiki/Q4231925) |
| 172 | 1989 Iranian constitutional referendum | 1989-07-28 | 11 | no location | [article](https://en.wikipedia.org/wiki/1989_Iranian_constitutional_referendum) | [Q3207434](https://www.wikidata.org/wiki/Q3207434) |
| 173 | Fall of Aden (2026) | 2026-01-07 | 10 | no location | [article](https://en.wikipedia.org/wiki/Fall_of_Aden_(2026)) | [Q137757212](https://www.wikidata.org/wiki/Q137757212) |
| 174 | Aleppo offensive (November–December 2016) | 2016-11-15 | 10 | no location | [article](https://en.wikipedia.org/wiki/Aleppo_offensive_(November%E2%80%93December_2016)) | [Q27894014](https://www.wikidata.org/wiki/Q27894014) |
| 175 | Battle of Samarra (2004) | 2004-10-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Samarra_(2004)) | [Q4087318](https://www.wikidata.org/wiki/Q4087318) |
| 176 | 2015–2016 Latakia offensive | 2015-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/2015%E2%80%932016_Latakia_offensive) | [Q21805447](https://www.wikidata.org/wiki/Q21805447) |
| 177 | Battle of Riyadh | 1902-01-13 | 10 | no location | [article](https://en.wikipedia.org/wiki/Battle_of_Riyadh) | [Q2943187](https://www.wikidata.org/wiki/Q2943187) |
| 178 | Second Battle of al-Faw | 1988-04-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/Second_Battle_of_al-Faw) | [Q82995](https://www.wikidata.org/wiki/Q82995) |
| 179 | First Saudi–Rashidi War (1903–1907) | 1903-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/First_Saudi%E2%80%93Rashidi_War_(1903%E2%80%931907)) | [Q7427175](https://www.wikidata.org/wiki/Q7427175) |
| 180 | Iran–China 25-year Cooperation Program | 2021-03-27 | 10 | no location | [article](https://en.wikipedia.org/wiki/Iran%E2%80%93China_25-year_Cooperation_Program) | [Q96743196](https://www.wikidata.org/wiki/Q96743196) |
| 181 | 1912 Ottoman coup d'état | 1912-07-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/1912_Ottoman_coup_d'%C3%A9tat) | [Q7428332](https://www.wikidata.org/wiki/Q7428332) |
| 182 | 20 September 2024 Beirut attack | 2024-09-20 | 10 | no location | [article](https://en.wikipedia.org/wiki/20_September_2024_Beirut_attack) | [Q130331542](https://www.wikidata.org/wiki/Q130331542) |
| 183 | 20 Hunchakian gallows | 1915-06-15 | 10 | no location | [article](https://en.wikipedia.org/wiki/20_Hunchakian_gallows) | [Q7711827](https://www.wikidata.org/wiki/Q7711827) |
| 184 | 2004 Ashura massacre | 2004-03-02 | 10 | no location | [article](https://en.wikipedia.org/wiki/2004_Ashura_massacre) | [Q722990](https://www.wikidata.org/wiki/Q722990) |
| 185 | 1979 Khuzestan insurgency | 1979-04-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/1979_Khuzestan_insurgency) | [Q12182813](https://www.wikidata.org/wiki/Q12182813) |
| 186 | Goharshad Mosque rebellion | 1935-08-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Goharshad_Mosque_rebellion) | [Q11161771](https://www.wikidata.org/wiki/Q11161771) |
| 187 | Palestinian insurgency in South Lebanon | 1968-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Palestinian_insurgency_in_South_Lebanon) | [Q7127419](https://www.wikidata.org/wiki/Q7127419) |
| 188 | Yalova Peninsula massacres | 1920-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Yalova_Peninsula_massacres) | [Q6105724](https://www.wikidata.org/wiki/Q6105724) |
| 189 | Operation Claw-Eagle 2 | 2021-02-10 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Claw-Eagle_2) | [Q105525852](https://www.wikidata.org/wiki/Q105525852) |
| 190 | 1996 cruise missile strikes on Iraq | 1996-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/1996_cruise_missile_strikes_on_Iraq) | [Q1781133](https://www.wikidata.org/wiki/Q1781133) |
| 191 | May 2025 Gaza offensive | 2025-05-17 | 10 | no location | [article](https://en.wikipedia.org/wiki/May_2025_Gaza_offensive) | [Q134352816](https://www.wikidata.org/wiki/Q134352816) |
| 192 | Operation Prime Chance | 1987-08-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Prime_Chance) | [Q1118003](https://www.wikidata.org/wiki/Q1118003) |
| 193 | Operation Horev | 1948-12-22 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Horev) | [Q2777473](https://www.wikidata.org/wiki/Q2777473) |
| 194 | March 2012 Gaza–Israel clashes | 2012-01-01 | 10 | no location | [article](https://en.wikipedia.org/wiki/March_2012_Gaza%E2%80%93Israel_clashes) | [Q2613676](https://www.wikidata.org/wiki/Q2613676) |
| 195 | Operation Juniper Shield | 2007-02-06 | 10 | no location | [article](https://en.wikipedia.org/wiki/Operation_Juniper_Shield) | [Q2602154](https://www.wikidata.org/wiki/Q2602154) |
| 196 | 2023 Gaza war ceasefire | 2023-11-24 | 10 | no location | [article](https://en.wikipedia.org/wiki/2023_Gaza_war_ceasefire) | [Q123509933](https://www.wikidata.org/wiki/Q123509933) |
| 197 | 2019 Egyptian constitutional referendum | 2019-04-20 | 10 | no location | [article](https://en.wikipedia.org/wiki/2019_Egyptian_constitutional_referendum) | [Q63197808](https://www.wikidata.org/wiki/Q63197808) |
