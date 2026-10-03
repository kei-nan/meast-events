# Title refresh report (2026-10-03)

Each event's `title` is the current English Wikipedia article title (docs/DATA_POLICY.md). Checked 571 events against the live MediaWiki API (`redirects=1`). **27** titles are out of date, 0 more only need their URL updated, 6 are held for a person to look at. Event ids never change.

Proposals are in `data/title-changes.proposed.json`. Nothing here has been written to `data/events.json`. To apply them:

```
node scripts/merge-proposed.js --titles          # dry run: lists what would change
node scripts/merge-proposed.js --titles --apply  # writes title / wikipedia_url into data/events.json
```

## Article renamed (stored URL redirects) - curated: 2

| id | old title | new title | URL update | redirected from |
|---|---|---|---|---|
| `fall-of-baghdad-1917` | Fall of Baghdad (1917) | Capture of Baghdad (1917) | https://en.wikipedia.org/wiki/Fall_of_Baghdad_(1917) -> https://en.wikipedia.org/wiki/Capture_of_Baghdad_(1917) | Fall of Baghdad (1917) |
| `iraqi-turkmen-genocide` | Iraqi Turkmen genocide | Persecution of the Iraqi Turkmen by the Islamic State | https://en.wikipedia.org/wiki/Iraqi_Turkmen_genocide -> https://en.wikipedia.org/wiki/Persecution_of_the_Iraqi_Turkmen_by_the_Islamic_State | Iraqi Turkmen genocide |

## Title out of date (URL already current; Wikipedia redirects the stored title to the article) - curated: 25

| id | old title | new title | URL update | redirected from |
|---|---|---|---|---|
| `1936-39-arab-revolt-in-palestine` | 1936–39 Arab revolt in Palestine | 1936–1939 Arab revolt in Palestine | no | - |
| `1968-iraqi-coup-d-tat` | 1968 Iraqi coup d'état | 17 July Revolution | no | - |
| `2023-israel-hamas-war` | 2023 Israel–Hamas war | Gaza war | no | - |
| `2024-israel-hezbollah-conflict` | 2024 Israel–Hezbollah conflict | Hezbollah–Israel conflict (2023–present) | no | - |
| `abolition-of-the-ottoman-caliphate` | Abolition of the Ottoman Caliphate | Abolition of the Caliphate | no | - |
| `anglo-iraqi-treaty-1930` | Anglo-Iraqi Treaty (1930) | Anglo-Iraqi Treaty of 1930 | no | - |
| `armenian-genocide` | Armenian Genocide | Armenian genocide | no | - |
| `baghdad-pact` | Baghdad Pact | Central Treaty Organization | no | - |
| `battle-of-jerusalem-1917` | Battle of Jerusalem (1917) | Battle of Jerusalem | no | - |
| `black-september-in-jordan` | Black September in Jordan | Black September | no | - |
| `egyptian-crisis-2011-2014` | Egyptian crisis (2011–2014) | Egyptian Crisis (2011–2014) | no | - |
| `egyptian-revolution-of-2011` | Egyptian revolution of 2011 | 2011 Egyptian revolution | no | - |
| `gaza-war-2008-09` | Gaza War (2008–09) | Gaza War (2008–2009) | no | - |
| `invasion-of-iraq` | Invasion of Iraq | 2003 invasion of Iraq | no | - |
| `iraqi-revolt-against-the-british` | Iraqi revolt against the British | Iraqi Revolt | no | - |
| `israeli-disengagement-from-gaza` | Israeli disengagement from Gaza | Israeli disengagement from the Gaza Strip | no | - |
| `joint-comprehensive-plan-of-action` | Joint Comprehensive Plan of Action | Iran nuclear deal | no | - |
| `killing-of-jamal-khashoggi` | Killing of Jamal Khashoggi | Assassination of Jamal Khashoggi | no | - |
| `mcmahon-hussein-correspondence` | McMahon–Hussein Correspondence | McMahon–Hussein correspondence | no | - |
| `north-yemen-civil-war` | North Yemen Civil War | North Yemen civil war | no | - |
| `saudi-arabian-led-intervention-in-yemen` | Saudi Arabian–led intervention in Yemen | Saudi-led intervention in the Yemeni civil war | no | - |
| `unification-of-saudi-arabia` | Unification of Saudi Arabia | Formation of Saudi Arabia | no | - |
| `united-states-recognition-of-jerusalem-as-the-capital-of-israel` | United States recognition of Jerusalem as the capital of Israel | United States recognition of Jerusalem as capital of Israel | no | - |
| `united-states-withdrawal-from-the-joint-comprehensive-plan-of-action` | United States withdrawal from the Joint Comprehensive Plan of Action | United States withdrawal from the Iran nuclear deal | no | - |
| `yemeni-revolution` | Yemeni Revolution | Yemeni revolution | no | - |

## Held - not proposed: 6

These are not changed by the merge. A redirect to another subject or to a section usually means the article was merged into a larger one; a stored title that Wikipedia does not redirect to the article is usually a hand-picked label for an event whose URL points at a broader article.

| id | file | stored title | reason | detail |
|---|---|---|---|---|
| `al-anfal-campaign` | curated | Al-Anfal campaign | Stored title does not redirect to the article | Wikipedia does not redirect the stored title to "Anfal campaign": "Al-Anfal campaign" redirects to a section: Anfal campaign#The campaign |
| `jordanian-independence` | curated | Jordanian independence | Stored title does not redirect to the article | Wikipedia does not redirect the stored title to "History of Jordan": "Jordanian independence" redirects to a section: History of Jordan#Establishment |
| `june-2025-israeli-strikes-on-iran` | curated | June 2025 Israeli strikes on Iran | Article belongs to a different Wikidata item | article "List of attacks during the Twelve-Day War" is Wikidata Q134961914, the event is Q134884640 |
| `musa-dagh-resistance` | curated | Musa Dagh Resistance | Article belongs to a different Wikidata item | article "Musa Dagh" is Wikidata Q1953975, the event is Q19831524 |
| `operation-marg-bar-sarmachar` | curated | Operation Marg Bar Sarmachar | Article belongs to a different Wikidata item | article "2024 Iranian missile strikes in Pakistan" is Wikidata Q124306685, the event is Q124309366 |
| `syrian-independence` | curated | Syrian independence | Stored title does not redirect to the article | Wikipedia does not redirect the stored title to "Second Syrian Republic": "Syrian independence" redirects to a section: Second Syrian Republic#Independence |
