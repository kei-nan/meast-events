# Data fixes changelog

Every change made to event data after the bias review (`docs/bias-review/`), with evidence. All checks were made
against live English Wikipedia and Wikidata on 2026-09-26. Fixes live in one ledger, `scripts/lib/fixes.js`
(so re-running the pipeline reproduces them), and each fixed event carries a `review_reasons` entry starting with
`data_fix Fn:` that names the fix. Event ids never change. Anything not listed here was at most **flagged**.

Principle: fix only where Wikipedia and Wikidata clearly agree with each other and disagree with our record; otherwise flag.

## F1 - "Israeli withdrawal from Lebanon" showed the South Lebanon conflict article (`israeli-withdrawal-from-lebanon`, Q2479435)

- Evidence: the seed title "Israeli withdrawal from Lebanon" is a **redirect to a section** ("2000 Israeli withdrawal and collapse of
  South Lebanon Army") of the article "South Lebanon conflict (1985-2000)" (MediaWiki `redirects=1`: `from: Israeli withdrawal from Lebanon`,
  `to: South Lebanon conflict (1985-2000)`, `tofragment: 2000 Israeli withdrawal and collapse of South Lebanon Army`). Wikipedia has no separate
  article for the withdrawal; a search for one returns only that article. The stored url, QID (Q2479435) and extract were already that article's.
- Fix: title -> `South Lebanon conflict (1985-2000)` (Wikipedia's title for the article the record shows). Dates -> Wikidata Q2479435:
  P585 1985-02-16 (the pipeline's start rule: point in time, else start time), P582 2000-05-25; previously the seed's 2000-05-24
  (the withdrawal only). url/QID/extract unchanged, so title, url, QID and extract now all describe one article.
- Judgement call for the owner: this turns the record from a point event (the 2000 withdrawal) into the whole 1985-2000 conflict, because that is
  what the only matching Wikipedia/Wikidata item is. If you prefer the withdrawal as its own record it needs a Wikidata item first (not created by us).

## F2 - Operation Olive Branch: date_start 2019-08-09 vs the article's 2018 (`operation-olive-branch`, Q47465940)

- Evidence: Wikidata has P585 (point in time) = 2019-08-09 and P580 (start time) = 2018-01-20, no P582. The Wikipedia infobox (wikitext) says
  "20 January - 24 March 2018"; the lead says the operation's air war "ended as the ... SNA entered the city of Afrin on 18 March 2018". The pipeline
  used COALESCE(P585, P580), i.e. the odd P585 value.
- Fix: date_start = 2018-01-20 (Wikidata P580); date_end = 2018-03-24 (Wikipedia infobox; Wikidata has no end).
- General rule added for NEW candidates (`reconcileStartDate` in `scripts/lib/fixes.js`, flagged as `date_source_adjusted` in `date_flags`
  with both values): use P580 instead of P585 when P585 is only decade-or-coarser precision while P580 is year-or-finer, or when P585 equals
  the item's end time P582. Applied to 12 not-yet-merged proposed events (e.g. World War I: P585 = 1918-11-11 is its end, start 1914-07-28;
  1948 Arab-Israeli War: P585 "1940" decade precision, start 1948-05-15). Not applied to events already merged into the curated file.

## F3 - "Fall of the Assad regime" extract said 1971, live lead says 1970 (`fall-of-the-assad-regime`)

- Evidence: stored extract (fetched 2026-09-13): "...since Hafez al-Assad assumed power in 1971..."; live lead re-fetched today reads "...assumed power in 1970...".
  Wikipedia edited the article in between. No code change: the full-lead re-fetch replaced the stale text, which now reads 1970. Confirmed.
- The same class of staleness is what `scripts/refresh-extracts.js` exists to catch (see DATA_POLICY.md).

## F4 - Wrong countries derived from a place (P276) instead of the item's own country (P17)

- `battle-off-the-coast-of-abkhazia` (Q538398): was `Turkey`. Wikidata P17 = Georgia (Q230), P276 = Black Sea; the item was tagged Turkey only
  because the Black Sea's own P17 includes Turkey. The lead: Russian Black Sea Fleet vs Georgian patrol boats, Russo-Georgian War. -> `countries: ["Georgia"]`.
  Georgia is outside the 15 tracked countries: the record stays in the data (it met the published rule via the Black Sea), its tag now says what Wikidata says.
- Same mechanism, same evidence pattern, fixed in the not-yet-merged proposed file (they are on the `Q...` list in the ledger):
  Operation Atalanta (Q698771) Yemen -> Somalia (P17 Q1045; place = Gulf of Aden); Operation Barkhane (Q17354007) Egypt -> France (P17 Q142; place = Sahel);
  War in the Sahel (Q86831539) Egypt -> Mali, Burkina Faso, Niger, Benin, Togo, Mauritania, Algeria, Ivory Coast (its P17 values).
- Not fixed, only flagged (`country_via_place_only`, 7 events): the item's own P17 is a different sovereign state and the tracked tag comes only from a place:
  `north-yemen-civil-war`, `indian-airlines-flight-814`, `world-war-i`, `world-war-ii`, `balkan-pact-1953`, `aeroflot-flight-244`, `operation-unified-protector`.
  These are multi-country or ambiguous cases where the owner should decide.

## Scan for the same classes of error (594 events = 394 curated + 200 proposed and not yet merged)

| Check | Count | Action |
|---|---|---|
| Record title differs from the Wikipedia article title and the title is not in the lead (`title_differs_from_article`) | 22 (before F1: 23) | flagged only. Mostly harmless renames (e.g. "Gaza War (2008-09)" vs "Gaza War (2008-2009)"), a few real scope differences ("Syrian independence" -> article "Second Syrian Republic"; "2023 Israel-Hamas war" -> "Gaza war"; "Operation Marg Bar Sarmachar" -> "2024 Iranian missile strikes in Pakistan"; "June 2025 Israeli strikes on Iran" -> "List of attacks during the Twelve-Day War") |
| Start-date year not within 1 year of any year in the full lead (`date_start_year_not_in_lead`, in `date_flags`) | 13 | F2 fixed one; the rest flagged (e.g. Anglo-Iraqi Treaty 1930 dated 1932 by us, the treaty's entry-into-force; Al-Anfal 1986 vs 1988 in lead) |
| Wikidata date order invalid (`date_order_invalid`) | 5 (2 after F6) | kept, dates as Wikidata gives them, flagged with a Wikipedia lead comparison note; F6 fixed three |
| Tracked country tag not derivable from Wikidata P17/P276/P131 (`country_not_supported_by_wikidata`) | 9 (curated, hand-typed tags) | flagged only: arab-revolt, 1948-palestine-war, war-of-attrition, battle-of-karameh, 1982-lebanon-war, israeli-withdrawal-from-lebanon, saudi-arabian-led-intervention-in-yemen, killing-of-jamal-khashoggi, assassination-of-qasem-soleimani |
| Country only via P276/P131 place while own P17 is another sovereign state (`country_via_place_only`) | 7 | flagged only (list in F4) |
| Wikipedia article resolves to a different Wikidata item than the record's QID (`qid_mismatch`) | 5 in the proposed file (2 of them are the redirect duplicates already excluded by review, `proposed-exclusions.json`), 2 in the curated file (Musa Dagh Resistance, Operation Marg Bar Sarmachar) | flagged only |

Curated legacy tags that are not Wikidata country names (`regional`) cannot be compared and are skipped by the country checks.
"Countries not matching Wikidata" for the 112 hand-picked seed events is expected in bulk: their tags were typed by hand (the bias review counted 21 differing tags
among the 51 seed events found by discovery, e.g. Six-Day War 4 vs 15); they are flagged only where a specific mismatch is detectable and never overwritten.

## Not verified

- Wikipedia infobox dates were checked by reading the wikitext for Olive Branch only, not for the other events.
- The country check compares only P17/P276/P131 (one hop). Events whose Wikidata location is deeper are not testable.
- `date_start_year_not_in_lead` compares years in prose; it can miss (a year that appears for another reason) or false-alarm (the lead gives no year for the start).

## F5 - Houthi insurgency dated 2015 instead of 2004 (`houthi-insurgency`, Q255997)

- Evidence (checked live 2026-09-29): Wikidata P580 (start time) = 2004-06, month precision; the stored date_start 2015-02-06 was the item's
  P585 (point in time). The Wikipedia lead: "The conflict was sparked in 2004 by the government's attempt to arrest Hussein al-Houthi".
  Wikipedia and Wikidata's start time agree against our record, so under the principle above it is fixed. -> `date_start: "2004-06-01"`
  (the day is unknown; Wikidata only gives the month).

## Location rule (2026-09-29): 23 events excluded, F4 superseded

Not a per-event fix but a published rule (DATA_POLICY.md, inclusion rule 2): a place only lends its countries to an event when most of the
present-day states it lists are inside the region. The Mediterranean Sea (Q4918) alone lists 22 countries in P17, so every battle placed only
"in the Mediterranean" had been tagged Israel/Palestine, Lebanon, Syria, Turkey and Egypt. Applied to the discovered events, it removed those
tags and left 23 events with no tracked country, which the inclusion rule excludes (listed with the reason in `data/proposed-exclusions.json`):

- WWI/WWII naval actions: naval-warfare-in-the-mediterranean-during-world-war-i, pursuit-of-goeben-and-breslau, battle-of-the-espero-convoy,
  battle-of-cape-spada, action-off-cape-passero, battle-of-cape-spartivento, operation-excess, operation-abstention, battle-of-the-tarigo-convoy,
  operation-halberd, battle-of-the-duisburg-convoy, battle-of-cape-bon-1941, operation-harpoon-1942, operation-pedestal.
- Libya and the Sahara/Sahel: operation-agreement (Tobruk, via "North Africa"), 1989-air-battle-near-tobruk, operation-unified-protector,
  operation-juniper-shield, war-in-the-sahel, operation-barkhane.
- Other: operation-active-endeavour (NATO, Mediterranean), battle-off-the-coast-of-abkhazia (Black Sea), operation-atalanta (Gulf of Aden).

The four F4 events are among them: F4 had corrected their tags to their own P17 (Georgia, Somalia, France, the Sahel states), which already
put them outside the tracked set; the validator now rejects any event without a tracked country. Their framing reviews were removed with them.

## F6 - Three battles whose start came out after their end (`first-battle-of-tikrit`, `palmyra-offensive-may-2015`, `third-battle-of-fallujah`)

- Cause: the pipeline's start is COALESCE(P585, P580). For these three items Wikidata's P585 (point in time) is the battle's
  last day and is later than the item's own P582 (end time), so the stored start fell after the stored end. The year filter
  (`start <= to && end >= from`) then treats the record as a range that ends before it begins.
- Evidence (checked live 2026-10-01, Wikidata `wbgetentities` and the infobox `date` line of the English Wikipedia article):

| Event | Wikidata P580 / P582 / P585 | Wikipedia infobox | Fix |
|---|---|---|---|
| First Battle of Tikrit (Q17286795) | 2014-06-26 / 2014-06-30 / 2014-07-21 | 26 June – 21 July 2014 | 2014-06-26 to 2014-07-21 |
| Palmyra offensive (May 2015) (Q19926256) | 2015-05-13 / 2015-05-25 / 2015-05-26 | 13–26 May 2015 | 2015-05-13 to 2015-05-26 |
| Third Battle of Fallujah (Q24205448) | 2016-05-22 / 2016-06-26 / 2016-06-29 | 22 May – 29 June 2016 | 2016-05-22 to 2016-06-29 |

- In each, the infobox start equals Wikidata P580 and the infobox end equals Wikidata P585, so Wikipedia and Wikidata agree with each
  other against our record. Dates are set to the infobox. Applied to both `data/events.json` and `data/events.proposed.json`.
- Not fixed, still flagged `date_order_invalid` (the two sources do not agree, so this is the owner's call or an upstream Wikidata edit):
  - `second-battle-of-inonu` (Q2659746): Wikidata P580 1921-03-26, P582 1921-03-31, P585 1921-04-01; the infobox says
    "March 23 – April 1, 1921". The end agrees with P585, but the start differs (23 vs 26 March).
  - `iraqi-invasion-of-kuwait` (Q856650): Wikidata P580 is 2009-08-02, P582 1990-08-04, no P585; the infobox says "2–4 August 1990".
    Wikidata's start is wrong; with it, the event is not shown when the timeline is set to 1990-1991.

## F7 - October 7 attacks dated 1 October 2023 (`october-7-attacks`, Q122976243)

- Cause: the discovery query's start is COALESCE(P585, P580). The item's P585 (point in time) is `2023-10`, **month** precision;
  Wikidata stores such a value as `+2023-10-00`, which the query returns as 2023-10-01. So the record said 1 October with
  `date_precision: "month"`, although the item's own P580 has the day. The F2 rule (`reconcileStartDate`) does not catch it: it only
  replaces a decade-or-coarser P585, or a P585 equal to the end time.
- Evidence (checked live 2026-10-04, Wikidata `wbgetentities` and the English Wikipedia article, revision 1378396674):
  - Wikidata Q122976243: P580 = `+2023-10-07T00:00:00Z` (precision 11, day); P582 = `+2023-10-09T00:00:00Z` (day); P585 = `+2023-10-00T00:00:00Z` (precision 10, month).
  - Wikipedia infobox: `| date = October 7–8, 2023`; lead: "On October 7, 2023, a series of coordinated armed incursions from the blockaded Gaza Strip ...".
- Wikipedia and Wikidata's P580 agree on 7 October against our record. -> `date_start: "2023-10-07"` (= P580), applied to both
  `data/events.json` and `data/events.proposed.json`; `date_precision` follows the kept date (P580, day; see "date_precision" below).
- Not changed: `date_end` 2023-10-09 (Wikidata P582) vs the infobox's 8 October. The two sources differ, so it stays as Wikidata gives it.

## F8 - four more month-precision start dates pinned to the 1st (same cause as F7)

- Found by the `month_precision_day_in_lead` flag. Same cause as F7: the item's P585 has month precision and won the discovery
  query's COALESCE(P585, P580) over a day-precision P580.
- Evidence (checked live 2026-10-04, Wikidata `wbgetentities` and the infobox `date` line of the English Wikipedia article):

| Event (QID) | Stored | Wikidata P580 / P582 / P585 | Wikipedia infobox (revision) | Fix |
|---|---|---|---|---|
| Indian Airlines Flight 814 (Q2009640) | 1999-12-01 | 1999-12-24 (day) / 1999-12-31 / 1999-12 (month) | "24 December 1999 – 31 December 1999" (1373675196) | 1999-12-24 |
| July 2023 Jenin incursion (Q120201630) | 2023-07-01 | 2023-07-03 (day) / 2023-07-05 / 2023-07 (month) | "3–5 July 2023" (1370625180) | 2023-07-03 |
| Zikim attack (Q123014721) | 2023-10-01 | 2023-10-07 (day) / none / 2023-10 (month) | "7 October 2023" (1377889137) | 2023-10-07 |
| Fall of Damascus (2024) (Q131401087) | 2024-12-01 | 2024-12-07 (day) / 2024-12-08 / 2024-12 (month) | "7–8 December 2024" (1370617734) | 2024-12-07 |

- In each, Wikipedia and Wikidata's P580 agree on the day against our record. -> `date_start` = P580, applied to both
  `data/events.json` and `data/events.proposed.json`; `date_precision` follows the kept date (day). `date_end` already matched both
  sources and is unchanged. The `month_precision_day_in_lead` flag is removed from these four.
- Not fixed: `2022-gaza-israel-clashes` and `may-2023-gaza-israel-clashes` (also flagged): Wikidata's P580 does not match the day the
  lead names (per the data-fixes agent's check), so they stay flagged.

## Checks of 2026-10-04 (no data value changed unless stated)

### Three events show another article's lead (`musa-dagh-resistance`, `june-2025-israeli-strikes-on-iran`, `operation-marg-bar-sarmachar`): not fixed

- How it happened: discovery found each item through its English sitelink title. That title is a Wikipedia **redirect** to an article
  about another Wikidata item, and `enrich-candidates.js` stored the resolved article's URL and lead (it already flagged `qid_mismatch`).
  The records were created that way in b1b52e9 (2026-09-26) and merged in f0f6c80; later refreshes kept copying the same article's lead.
- Evidence (checked live 2026-10-04): each item's enwiki sitelink carries the Wikidata badge Q70893996 "sitelink to redirect", and the
  MediaWiki API (`redirects=1`) resolves it to another item's article:

| Event (QID) | enwiki sitelink | Wikipedia redirects to | That article's item |
|---|---|---|---|
| Musa Dagh Resistance (Q19831524, "Battle of Musa Dagh") | Musa Dagh Resistance | Musa Dagh (whole article) | Q1953975, the mountain |
| June 2025 Israeli strikes on Iran (Q134884640, "Operation Rising Lion") | June 2025 Israeli strikes on Iran | List of attacks during the Twelve-Day War, section "Operation Rising Lion" | Q134961914, a list article |
| Operation Marg Bar Sarmachar (Q124309366) | Operation Marg Bar Sarmachar | 2024 Iranian missile strikes in Pakistan (whole article) | Q124306685, Iran's strikes of 16 January 2024 |

- So none of the three items has an English article of its own, and there is no lead "of the event's own QID" to restore. The stored
  leads are the redirect targets' leads, which do describe the event in part (the mountain article: "In 1915, it was the location of a
  successful Armenian resistance"; the strikes article: "On 18 January, Pakistan conducted retaliatory airstrikes in Iran's Sistan and
  Baluchestan province"). Choosing a section, or dropping the events, is a judgement call for the owner; they stay flagged (`qid_mismatch`,
  `title_differs_from_article`).
- Pipeline guard: `scripts/refresh-extracts.js` now never copies a lead from an article whose Wikidata item differs from the event's QID;
  such updates are listed as "held" (`detectExtractHold`, `scripts/lib/title-refresh.js`). Before, only the title was held.

### date_precision now describes the kept date

- Cause: `enrich-candidates.js` took the precision from the discovery date (P585 when present), before `reconcileStartDate` or the fix
  ledger replaced that date. Example: `1948-arab-israeli-war` kept P580 1948-05-15 (day) but said "decade", from the discarded P585 "1940".
- Pipeline: after source reconciliation and the ledger, `date_precision` is the precision of the item's P585/P580 statement whose value
  is the kept `date_start` (`keptDatePrecision`, `scripts/lib/fixes.js`); the `date_precision_coarse` note follows it.
- Regenerated from live Wikidata (2026-10-04) for events that already had the field and whose kept date is a P585/P580 value
  (5 events, in both files): `1948-arab-israeli-war`, `2024-lebanon-war`, `2025-2026-iranian-protests` decade -> day (P580; their
  `date_precision_coarse` note removed); `houthi-insurgency` day -> month (F5's P580 2004-06 is month precision); `october-7-attacks`
  month -> day (F7). No date value changed.
- Not changed: `german-ottoman-alliance` (1914-08-02) and `armistice-of-erzincan` (1917-12-18): their date is no current P585/P580 value
  (Wikidata P585 is now 1914-07-20 and 1917-12-05; it was edited after discovery). The 112 legacy seed events have no `date_precision`
  and none was added.

### New flag: `month_precision_day_in_lead` (flag only)

- A month-precision `date_start` (stored as the 1st) whose Wikipedia lead names an exact day of that same month in its first sentence.
  In `review_reasons` (not `date_flags`, so the shown date is unchanged). Curated: 6 (`indian-airlines-flight-814`, `july-2023-jenin-incursion`,
  `zikim-attack`, `fall-of-damascus-2024`, `2022-gaza-israel-clashes`, `may-2023-gaza-israel-clashes`); proposed: the same 6 plus
  `operation-guardian-of-the-walls` (excluded by review). October 7 attacks would have been the seventh before F7.

### Dangling `possible_duplicates` removed

- `october-7-attacks` -> `ein-hashlosha-massacre`: the hint was computed against every enriched candidate, including the one later left
  out by review (`proposed-exclusions.json`: a redirect to a section of "October 7 attacks"), and was merged with the event.
- `2011-bahraini-uprising` -> `bahraini-uprising`: the hint pointed at the legacy seed event that f0f6c80 removed (disambiguation stub) in
  the same commit that merged this one.
- Pipeline: `enrich-candidates.js` now keeps only hints to published records (curated events and proposed events that are neither excluded
  nor in `proposed-exclusions.json`; `pruneDuplicateHints`, `scripts/lib/flags.js`). The two hints and their `possible_duplicate:` notes
  were removed with that function (curated: both; proposed: the October 7 one).

## F9 - Mediterranean and Middle East theatre of World War II: coordinates checked, not swapped (`mediterranean-and-middle-east-theatre-of-world-war-ii`, Q696817)

- Found by the validator: the point (35N, 18E) is outside the region box but would be inside it with latitude and longitude exchanged,
  which the validator treats as a swap error.
- Evidence (checked live 2026-10-07): the English Wikipedia article (revision 1378869230) has `{{Coord|35|N|18|E|...type:waterbody...}}`
  and the API returns it as the primary coordinate; Wikidata Q696817 P625 = 35, 18. Both sources give this point, in the Ionian Sea,
  as the marker for the whole theatre.
- Nothing changed. The point is listed in `CHECKED_COORDINATES` (`scripts/lib/fixes.js`), so the validator reports it as the ordinary
  "outside the Middle East box" warning; the entry is exact (item and point), so any other value on this item still fails as a swap.

## F10 - three more month-precision start dates pinned to the 1st (same cause as F7, F8)

- Found by the independent review of the events added by the classes of 2026-10-06. Same cause as F7: a month-precision P585 won the
  discovery query's COALESCE(P585, P580) over a day-precision P580.
- Evidence (checked live 2026-10-07, Wikidata entity JSON and the infobox `date` line of the English Wikipedia article):

| Event (QID) | Stored | Wikidata P580 / P582 / P585 | Wikipedia infobox (revision) | Fix |
|---|---|---|---|---|
| April 2024 Iranian strikes on Israel (Q125464497) | 2024-04-01 | 2024-04-13 (day) / 2024-04-14 / 2024-04 (month) | "13–14 April 2024" (1373392805) | 2024-04-13 |
| 2024 Homs offensive (Q131392292) | 2024-12-01 | 2024-12-05 (day) / 2024-12-08 / 2024-12 (month) | "5 December 2024 – 8 December 2024" (1375763415) | 2024-12-05 |
| 2020 G20 Riyadh summit (Q33038478) | 2020-11-01 | 2020-11-21 (day) / 2020-11-22 / 2020-11 (month) | "21–23 November 2020" (1364101887) | 2020-11-21 |

- In each, Wikipedia and Wikidata's P580 agree on the start day against our record. -> `date_start` = P580 in `data/events.proposed.json`
  (ledger entry F10); `date_precision` follows the kept date (day); the `month_precision_day_in_lead` flag is removed where it was set.
- Not changed: the G20 summit's `date_end` (Wikidata P582 22 November, infobox 23 November): the sources differ, so it stays as Wikidata gives it.

## F11 - pins that were another item's location (owner's rule: an event is pinned only at its own location)

- Found by the "coordinates are borrowed" check (2026-10-09). In each case the event's Wikipedia title resolves to the article of a
  **different** Wikidata item (`resolved_qid`), and `scripts/enrich-candidates.js` used that article's coordinates (or that item's `P625`).
- Rule (owner's decision, 2026-10-10): the pin is the event item's **own** Wikidata `P625`; when it has none, the event has no location
  (`location_quality: none`), like any other event without coordinates. `enrich-candidates.js` now applies this to new candidates:
  a title that resolves to another item no longer contributes coordinates, and the other item's `P625` is never used.
- Evidence: Wikidata `P625` of both items, fetched live 2026-10-10 (`wbgetentities`, claims):

| Event (QID) | File | Stored pin, from | Event's own P625 | Fix |
|---|---|---|---|---|
| Operation Marg Bar Sarmachar (Q124309366) | curated | 27.1667, 64.2667 (Pakistan): article "2024 Iranian missile strikes in Pakistan" (Q124306685) | 27.370833, 62.3325 (Iran) | pin moved to the own P625 |
| Musa Dagh Resistance (Q19831524) | curated | 36.25833333, 35.90361111: article "Musa Dagh" (the mountain, Q1953975) | 36.258333, 35.903611 | own P625 (same place); source `wikidata` |
| Attack on the United States embassy in Baghdad (Q80438042) | proposed | 33.299, 44.396: article "December 2019 United States airstrikes in Iraq and Syria" (Q26847124) | 33.299, 44.396 | same point; source `wikidata` |
| Operation Guardian of the Walls (Q106786309) | proposed | 31, 35: `P625` of Q106775117 (2021 Israel–Palestine crisis) | none | no location |

- Checked and unchanged: `israeli-invasion-of-the-gaza-strip` (Q123036458) and `ein-hashlosha-massacre` (Q123027684), whose titles also
  resolve to other items, store their own `P625`.
- Ledger entry F11 (`scripts/lib/fixes.js`). When a fix moves a pin, the `coordinate_far_from_countries` flag is recomputed from the new
  point (Marg Bar Sarmachar's "1544 km from Iran" flag no longer applies).

## F12 - five events without an article of their own included (owner's rule: include all such events, with a note)

- Before: a proposed event whose English Wikipedia title redirects into an article that a curated event already shows was left out as a
  duplicate (`data/proposed-exclusions.json`). Which of the two stayed depended only on merge order; e.g. "June 2025 Israeli strikes on Iran"
  was in and "June 2025 Iranian strikes on Israel" out, though both redirect into "List of attacks during the Twelve-Day War".
- Rule (owner's decision, 2026-10-10): every such event is included and the site says above its text that it has no article of its own and
  whose text it shows (`docs/DATA_POLICY.md`, "Events without an article of their own").
- Done: the five exclusions were removed and the events merged with `scripts/merge-proposed.js --apply` (816 curated events). Each shows the
  same Wikipedia article as a curated event, so it takes that event's stored text (`extract`, `extract_retrieved_at`) and framing review
  verbatim, replacing the older, shorter summary it was discovered with; the `extract_not_copied_qid_mismatch` flag is replaced by
  `text_from_redirect_target`. Their `sitelinks_current` was fetched from Wikidata on 2026-10-10 (equal to the discovery counts).

| Added event (QID) | Its Wikipedia title leads to | Text and review taken from |
|---|---|---|
| June 2025 Iranian strikes on Israel (Q134890505) | List of attacks during the Twelve-Day War | `june-2025-israeli-strikes-on-iran` |
| Ein HaShlosha massacre (Q123027684) | October 7 attacks | `october-7-attacks` |
| Israeli invasion of the Gaza Strip (Q123036458) | Gaza war | `2023-israel-hamas-war` |
| Attack on the United States embassy in Baghdad (Q80438042) | December 2019 United States airstrikes in Iraq and Syria | `december-2019-united-states-airstrikes-in-iraq-and-syria` |
| Operation Guardian of the Walls (Q106786309) | 2021 Israel–Palestine crisis | `2021-israel-palestine-crisis` |

- Their pins follow F11 (own Wikidata location only).

## Checks of 2026-10-14: the remaining reversed and coarse dates (no data value changed)

- Evidence: Wikidata `wbgetentities` (live 2026-10-14) and the infobox `date` line of the English article at the revision named. The pipeline's
  start is COALESCE(P585, P580) and its end P582 (discovery query, `scripts/discover-events.js`); WDQS returns a coarse value such as
  `+2002-00-00` as 2002-01-01.

| Event (QID) | Stored start / end | Wikidata P585 / P580 / P582 (precision) | Infobox (revision) | Cause |
|---|---|---|---|---|
| Iraqi invasion of Kuwait (Q856650) | 2009-08-02 / 1990-08-04 | - / 2009-08-02 (day) / 1990-08-04 (day) | 2–4 August 1990 (1375300033) | Wikidata: P580 year mistyped |
| Second Battle of İnönü (Q2659746) | 1921-04-01 / 1921-03-31 | 1921-04-01 (day) / 1921-03-26 (day) / 1921-03-31 (day) | March 23 – April 1, 1921 (1379641867) | Wikidata: P585 after P582 (the F6 pattern) |
| Arab Cold War (Q4783165) | 1979-02-11 / 1970-01-01 | 1979-02-11 (day) / 1952 (year) / 1970 (year) | 23 July 1952 – 6 September 1991, sources vary (1380203502) | Wikidata: a point in time on a period, after its end even at year precision |
| Passover massacre (Q2660905) | 2002-03-27 / 2002-01-01 | 2002-03-27 (day) / 2002 (year) / 2002 (year) | 27 March 2002 (1365841580) | **ours**: a year-precision end read as 1 January |
| Israeli–Lebanese conflict (Q3241199) | 2000-01-01 / - | - / +2000 (century) / - | 15 May 1948 – present (1370624531) | Wikidata: only a century; Wikibase formats +2000 at precision 7 as "20. century" (wbformatvalue), i.e. 1901–2000 |

- Not fixed here (no F-number): F-fixes need Wikipedia and Wikidata to agree against our record. For Kuwait, İnönü (end) and the
  Israeli–Lebanese conflict the infobox disagrees with Wikidata itself, so the correction belongs upstream: drafted, not submitted, in
  `data/wikidata-date-suggestions.tsv` (QuickStatements V1, for the owner's own account). The Arab Cold War's end is a matter of sources and is
  only described there.
- Pipeline (Passover massacre): `dateOrderFlags` now compares a coarse end by its whole period (`lastDayOfPeriod`, `keptEndPrecision` in
  `scripts/lib/fixes.js`), so "2002" is no longer called earlier than 27 March 2002; such a case gets `date_end_precision_coarse` instead of
  `date_order_invalid`, and a reversal at year precision (Arab Cold War) says the precision in its flag. The stored dates are unchanged. The
  stored flags of `passover-massacre` change on the next enrichment run (proposed file) and, for the curated file, only on a re-merge.
- Applied 2026-10-15 by the pipeline, not by hand: `node scripts/enrich-candidates.js --reuse --keep-existing` re-derived the date-order
  flags of the proposed copies, and `node scripts/merge-proposed.js --apply --no-add` carried them to the curated records whose dates and
  extract match (`scripts/lib/order-flags.js`). Two curated records changed, only in `date_flags` / `wikipedia_lead_dates`:
  `passover-massacre` (`date_order_invalid` + note + lead dates -> `date_end_precision_coarse`, so the site no longer shows a reversed-date
  note) and `arab-cold-war` (its `date_order_invalid` text now names the end's year precision; still shown).

## Seed enrichment of 2026-10-24: the 35 seed dates that are no Wikidata value

- `node scripts/enrich-seed.js --apply` (live Wikidata and Wikipedia, 2026-10-24) wrote the proposed `date_precision`, `part_of`, `resolved_qid`
  and `wikidata_description` (and the `part_of` review notes) into the hand-picked seed events whose stored `date_start` is one of the item's
  Wikidata P585/P580 values: 67 of 102. In the other 35 the stored date is none of them (seed dates were typed by hand from
  `data/seed-events.json`). Each was checked by hand against the lead and infobox of its English article at the revision linked below.
- Rule: a date is applied only where the article states the start to the day, unambiguously, and that day is either one of the item's
  Wikidata values (F13: the date changes to it) or the stored date itself (F14: the date stays, its day precision is recorded with the article
  as source). Nothing is rounded: a month or year in the article is not turned into a day. A day the article names that is neither the stored
  date nor a Wikidata value is not applied. `date_end` is never changed here.
- 16 settled (5 F13, 11 F14) get the whole proposal plus their ledger note; 19 are left exactly as they were (listed at the end) and stay in
  `data/seed-enrichment.proposed.json`.

## F13 - five seed start dates replaced by the Wikidata value the article confirms

| Event (QID) | Stored start | Wikidata P585 / P580 / P582 | English Wikipedia (revision) | Fix |
|---|---|---|---|---|
| Franco-Syrian War (Q2992403) | 1920-04-08 | - / 1920-03-08 / 1920-07-25 | infobox "8 March – 25 July 1920" ([1379975922](https://en.wikipedia.org/w/index.php?title=Franco-Syrian_War&oldid=1379975922)) | 1920-03-08 |
| Black September (Q154288) | 1970-09-16 | - / 1970-09-06 / 1971-07-17 | infobox "6 September 1970 – 23 July 1971"; the lead dates the main phase of the fighting 16–27 September 1970 ([1377443084](https://en.wikipedia.org/w/index.php?title=Black_September&oldid=1377443084)) | 1970-09-06 |
| United States recognition of Jerusalem as capital of Israel (Q45266620) | 2018-05-14 | 2017-12-06 / - / - | lead "On December 6, 2017, the United States officially recognized Jerusalem"; infobox date_signed 2017-12-06 ([1379528222](https://en.wikipedia.org/w/index.php?title=United_States_recognition_of_Jerusalem_as_capital_of_Israel&oldid=1379528222)) | 2017-12-06 |
| Fall of the Assad regime (Q131404510) | 2024-11-27 | 2024-12-08 / - / - | lead "On 8 December 2024, the Assad regime in Syria collapsed"; infobox 8 December 2024 ([1380552397](https://en.wikipedia.org/w/index.php?title=Fall_of_the_Assad_regime&oldid=1380552397)) | 2024-12-08 |
| Hezbollah–Israel conflict (2023–present) (Q122974556) | 2024-09-23 | 2020 (decade) / 2023-10-08 / - | lead "began on 8 October 2023" ([1368616555](https://en.wikipedia.org/w/index.php?title=Hezbollah%E2%80%93Israel_conflict_(2023%E2%80%93present)&oldid=1368616555)); infobox template "8 October 2023 – present" ([1381585493](https://en.wikipedia.org/w/index.php?title=Template:Hezbollah%E2%80%93Israel_conflict_(2023%E2%80%93present)_infobox&oldid=1381585493)) | 2023-10-08 |

- Wikipedia and Wikidata agree on the start against the seed record. -> `date_start` = the Wikidata value (ledger entry F13); `date_precision`
  is that statement's precision (day).
- Not changed: every `date_end`. Black September's (1971-07-17) is Wikidata's P582 and the lead's "until 17 July 1971" (infobox 23 July);
  the Fall of the Assad regime's is 2024-12-08, now the same day as its start; the Hezbollah–Israel conflict keeps 2024-11-27 although the
  article says "present".

## F14 - eleven seed dates the article states to the day: day precision recorded, date unchanged

| Event (QID) | Stored start | Wikidata P585 / P580 | English Wikipedia (revision) |
|---|---|---|---|
| Arab Revolt (Q239060) | 1916-06-10 | 1918-10 (month) / 1916-06 (month) | infobox "10 June 1916 – 25 October 1918"; lead "officially initiated at Mecca on 10 June 1916" ([1380894633](https://en.wikipedia.org/w/index.php?title=Arab_Revolt&oldid=1380894633)) |
| Abolition of the Caliphate (Q2821698) | 1924-03-03 | 1924 (year) / - | lead "abolished on 3 March 1924"; infobox 3 March 1924 ([1380313801](https://en.wikipedia.org/w/index.php?title=Abolition_of_the_Caliphate&oldid=1380313801)) |
| Abraham Accords (Q99495661) | 2020-09-15 | 2020 (year) / - | lead "signed in Washington, D.C. on September 15, 2020"; infobox date_signed "September 15, 2020" ([1380714856](https://en.wikipedia.org/w/index.php?title=Abraham_Accords&oldid=1380714856)) |
| Young Turk Revolution (Q4298662) | 1908-07-03 | 1908-07-24 / - | infobox "3–24 July 1908" ([1380448478](https://en.wikipedia.org/w/index.php?title=Young_Turk_Revolution&oldid=1380448478)) |
| Gallipoli campaign (Q164983) | 1915-02-19 | - / 1915-04-25 | lead "from 19 February 1915 to 9 January 1916"; infobox the same ([1379733603](https://en.wikipedia.org/w/index.php?title=Gallipoli_campaign&oldid=1379733603)) |
| 1929 Palestine riots (Q2281806) | 1929-08-23 | 1929-08-29 / - | infobox "23–29 August 1929" ([1378961464](https://en.wikipedia.org/w/index.php?title=1929_Palestine_riots&oldid=1378961464)) |
| 1953 Iranian coup d'état (Q593774) | 1953-08-15 | - / 1953-08-18 | infobox "15–19 August 1953" ([1380975077](https://en.wikipedia.org/w/index.php?title=1953_Iranian_coup_d'%C3%A9tat&oldid=1380975077)) |
| Saudi-led intervention in the Yemeni civil war (Q19682450) | 2015-03-26 | - / 2015-03-25 | lead "On 26 March 2015, Saudi Arabia ... staged a military intervention" ([1380996194](https://en.wikipedia.org/w/index.php?title=Saudi-led_intervention_in_the_Yemeni_civil_war&oldid=1380996194)); infobox template "26 March 2015 – ongoing" ([1379014728](https://en.wikipedia.org/w/index.php?title=Template:Saudi-led_intervention_in_the_Yemeni_civil_war_infobox&oldid=1379014728)) |
| United States withdrawal from the Iran nuclear deal (Q52836581) | 2018-05-08 | 2018-05-18 / - | lead "On 8 May 2018, the United States ... announced its withdrawal" ([1359899431](https://en.wikipedia.org/w/index.php?title=United_States_withdrawal_from_the_Iran_nuclear_deal&oldid=1359899431)) |
| Emirate of Transjordan (Q1121819) | 1921-04-11 | - / - | lead "established on 11 April 1921"; infobox date_start "11 April", year_start 1921 ([1377341920](https://en.wikipedia.org/w/index.php?title=Emirate_of_Transjordan&oldid=1377341920)) |
| United Nations Partition Plan for Palestine (Q846795) | 1947-11-29 | - / - | lead "adopted by the UN General Assembly on 29 November 1947"; infobox date "29 November", year 1947 ([1381412191](https://en.wikipedia.org/w/index.php?title=United_Nations_Partition_Plan_for_Palestine&oldid=1381412191)) |

- `date_start` unchanged; `date_precision: "day"` (ledger entry F14), its source the article at the revision named, not Wikidata. Three have
  a coarser Wikidata value that contains the day (Arab Revolt, Abolition, Abraham Accords), two have no Wikidata date (Transjordan, Partition
  Plan), and six have a different Wikidata day: for Young Turk Revolution and the 1929 riots Wikidata's P585 is the end of the infobox range;
  for Gallipoli it is the landings of 25 April 1915; for the coup, the intervention and the withdrawal the article disagrees with Wikidata itself
  (an upstream matter, not drafted here). In the intervention's infobox template the age counter starts from 25 March (`day1=25`) while its
  displayed date says 26 March.

### Left as they were (19): the article does not settle the start to the day

| Event (QID) | Stored start / end | Wikidata P585 / P580 / P582 | English Wikipedia (revision) | Why not applied |
|---|---|---|---|---|
| McMahon–Hussein correspondence (Q59524) | 1915-07-14 / 1916-03-10 | none | lead "from July 1915 to March 1916", no infobox ([1363295392](https://en.wikipedia.org/w/index.php?title=McMahon%E2%80%93Hussein_correspondence&oldid=1363295392)) | months only |
| Capture of Baghdad (1917) (Q2665637) | 1917-03-11 / - | 1917 (year) / 1917-03-08 / 1917-03-11 | lead "(11 March 1917)"; infobox "8–11 March 1917" ([1374873756](https://en.wikipedia.org/w/index.php?title=Capture_of_Baghdad_(1917)&oldid=1374873756)) | the article gives two starts: 11 March (lead, = P582) and 8 March (infobox, = P580) |
| Iraqi Revolt (Q616851) | 1920-05-30 / 1920-10-17 | 1920 (year) / 1920-05 (month) / 1920-10 (month) | infobox "May–October 1920"; lead "summer of 1920" ([1381194751](https://en.wikipedia.org/w/index.php?title=Iraqi_Revolt&oldid=1381194751)) | months only |
| Great Syrian Revolt (Q1968718) | 1925-07-18 / 1927-04-01 | - / 1925-07-19 / 1927-06 (month) | infobox "1925–1927"; lead "1925 to 1927" ([1379976254](https://en.wikipedia.org/w/index.php?title=Great_Syrian_Revolt&oldid=1379976254)) | years only |
| Unification of Saudi Arabia (Q251600) | 1932-09-23 / - | 1902 (year) / 1902 (year) / 1932 (year) | infobox "First phase: 13 January 1902 – 23 September 1932" ([1381088878](https://en.wikipedia.org/w/index.php?title=Unification_of_Saudi_Arabia&oldid=1381088878)) | the stored point is the article's end; its start (1902) would need a new `date_end` as well |
| Anglo-Iraqi Treaty of 1930 (Q541372) | 1932-10-03 / - | 1930-06-30 / - / - | lead names no date, no infobox ([1369404529](https://en.wikipedia.org/w/index.php?title=Anglo-Iraqi_Treaty_of_1930&oldid=1369404529)) | not stated |
| Peel Commission (Q655894) | 1936-11-01 / 1937-07-07 | - / 1936-08 (month) / - | lead "appointed in 1936", report "On 7 July 1937"; infobox "July 1937" ([1375537897](https://en.wikipedia.org/w/index.php?title=Peel_Commission&oldid=1375537897)) | start day not stated |
| White Paper of 1939 (Q1501775) | 1939-05-17 / - | 1939 (year) / - / - | lead "formal approval in the House of Commons on 23 May 1939"; infobox created "May 1939", ratified 23 May 1939 ([1357789658](https://en.wikipedia.org/w/index.php?title=White_Paper_of_1939&oldid=1357789658)) | the article's day (23 May) is neither the stored date nor a Wikidata value |
| National Pact (Q748819) | 1943-11-22 / - | none | lead "Enacted in the summer of 1943" ([1363774120](https://en.wikipedia.org/w/index.php?title=National_Pact&oldid=1363774120)) | season only |
| Nakba (Q3266633) | 1948-05-15 / 1949-01-01 | 1948 (year) / - / - | infobox "31 December 1947 – present" ([1381546706](https://en.wikipedia.org/w/index.php?title=Nakba&oldid=1381546706)) | the article's day is neither the stored date nor a Wikidata value (and is outside Wikidata's year) |
| 1949 Armistice Agreements (Q999143) | 1949-02-24 / 1949-07-20 | 1949 (year) / - / - | lead names no date (only its references), no infobox ([1373406233](https://en.wikipedia.org/w/index.php?title=1949_Armistice_Agreements&oldid=1373406233)) | not stated |
| Jewish exodus from the Muslim world (Q276172) | 1948-01-01 / 1972-01-01 | 2000 (century) / 1930 (decade) / 1970 (decade) | lead "from 1948 to the early 1970s" ([1380077539](https://en.wikipedia.org/w/index.php?title=Jewish_exodus_from_the_Muslim_world&oldid=1380077539)) | years only |
| Khartoum Resolution (Q1740597) | 1967-08-29 / 1967-09-01 | none | lead "of 1 September 1967 ... issued at the conclusion of the 1967 Arab League summit" ([1379408937](https://en.wikipedia.org/w/index.php?title=Khartoum_Resolution&oldid=1379408937)) | the article's day is the stored end, not the start |
| 1973 oil crisis (Q316817) | 1973-10-17 / 1974-03-18 | 1973 (year) / 1973-10-16 / 1974-03-17 | lead "In October 1973 ... In March 1974", no infobox ([1378160425](https://en.wikipedia.org/w/index.php?title=1973_oil_crisis&oldid=1378160425)) | months only |
| Iranian Revolution (Q126065) | 1978-01-07 / 1979-02-11 | 1970 (decade) / 1978-01 (month) / 1979-02 (month) | infobox "7 January 1978 – 11 February 1979", but the lead says the demonstrations began in October 1977 ([1379794348](https://en.wikipedia.org/w/index.php?title=Iranian_Revolution&oldid=1379794348)) | lead and infobox give different starts |
| Anfal campaign (Q529723) | 1986-02-23 / 1989-09-06 | 1988-09 (month) / 1986 (year) / 1989 (year) | infobox "February–September 1988"; lead "from February to September 1988" ([1377434227](https://en.wikipedia.org/w/index.php?title=Anfal_campaign&oldid=1377434227)) | months only, and another year |
| Israeli disengagement from the Gaza Strip (Q196122) | 2005-08-15 / 2005-09-12 | 2005-08 (month) / - / - | lead "A deadline was issued for August 15, 2005, after which the IDF began evicting", no infobox ([1380235471](https://en.wikipedia.org/w/index.php?title=Israeli_disengagement_from_the_Gaza_Strip&oldid=1380235471)) | a deadline, not stated as the start |
| Iranian Green Movement (Q2626387) | 2009-06-13 / 2010-02-11 | none | lead "arose after the 12 June 2009 Iranian presidential election and lasted until early 2010" ([1375717703](https://en.wikipedia.org/w/index.php?title=Iranian_Green_Movement&oldid=1375717703)) | start day not stated |
| Egyptian Crisis (2011–2014) (Q577539) | 2012-06-30 / 2014-06-08 | - / 2011-01-25 / 2014-05 (month) | lead "began with the 2011 Egyptian revolution and ended with the presidency of Abdel Fattah el-Sisi in 2014" ([1374697190](https://en.wikipedia.org/w/index.php?title=Egyptian_Crisis_(2011%E2%80%932014)&oldid=1374697190)) | year only (2011, against the stored 2012) |

## F15 - nine start dates that were a Wikidata "point in time" inside or at the end of the item's own range

- Cause: the discovery query's start is COALESCE(P585, P580). The F2 rule (`reconcileStartDate`, `scripts/lib/fixes.js`) replaced a P585 only
  when it was decade-or-coarser or equal to the item's end time P582, and only for new candidates. It missed a P585 that falls **strictly
  between** P580 and P582: the 2009 Iranian presidential election protests (Q854206: P580 2009-06-13, P585 2010-02-11, P582 2010-12-07) were
  stored as starting on 11 February 2010.
- Rule (generic, for new candidates, flagged `date_source_adjusted` as before): case (c) added, P585 strictly between P580 and P582 (compared
  as stored dates, P580 year-or-finer) -> P580. Unit test in `scripts/lib/fixes.test.js`.
- Re-run over every stored event with live Wikidata (2026-10-29, `wbgetentities`): 13 curated events would change (8 by case (c), 5 by case (b),
  which F2 never applied to curated records), plus 5 proposed copies of curated events. As the rule is not applied to curated records, each was
  checked against the English article at the revision named; F15 applies the 9 where the article gives the item's P580 as the start:

| Event (QID, Wikidata revision) | Stored | Wikidata P580 / P585 / P582 | English Wikipedia (revision) | Fix |
|---|---|---|---|---|
| 2009 Iranian presidential election protests (Q854206, 2559664551) | 2010-02-11 | 2009-06-13 / 2010-02-11 / 2010-12-07 | infobox "13 June 2009 – 7 December 2010" ([1381691345](https://en.wikipedia.org/w/index.php?title=2009_Iranian_presidential_election_protests&oldid=1381691345)) | 2009-06-13 |
| Operation Inherent Resolve (Q18357664, 2536701308) | 2014-09-22 | 2014-06-15 / 2014-09-22 / 2026-04-16 | infobox "15 June 2014 – present" ([1382364857](https://en.wikipedia.org/w/index.php?title=Operation_Inherent_Resolve&oldid=1382364857)) | 2014-06-15 |
| 2024 Lebanon electronic device attacks (Q130314422, 2516289931) | 2024-09-18 | 2024-09-17 / 2024-09-18 and 2024-09-17 / 2024-09-19 | lead "On 17 and 18 September 2024"; infobox "17–18 September 2024" ([1381300697](https://en.wikipedia.org/w/index.php?title=2024_Lebanon_electronic_device_attacks&oldid=1381300697)) | 2024-09-17 |
| Russian occupation of Tabriz (Q19906312, 2402259382) | 1911-01-01 (year) | 1909-04-30 / 1911 (year) / 1918-02-28 | lead "lasted from 30 April 1909 to 28 February 1918" ([1372095714](https://en.wikipedia.org/w/index.php?title=Russian_occupation_of_Tabriz&oldid=1372095714)) | 1909-04-30 (day) |
| Iran crisis of 1946 (Q1132835, 2533867483) | 1946-01-01 (year) | 1945-11 (month) / 1946 (year) / 1946-12-15 | infobox "November 1945 – December 15, 1946" ([1374789395](https://en.wikipedia.org/w/index.php?title=Iran_crisis_of_1946&oldid=1374789395)) | 1945-11-01 (month) |
| Operation Brevity (Q764714, 2491925305) | 1941-05-16 | 1941-05-15 / 1941-05-16 / 1941-05-16 | infobox "15–16 May 1941" ([1370631131](https://en.wikipedia.org/w/index.php?title=Operation_Brevity&oldid=1370631131)) | 1941-05-15 |
| Operation Skorpion (Q2756836, 2491874101) | 1941-05-27 | 1941-05-26 / 1941-05-27 / 1941-05-27 | lead "from 26 to 27 May 1941"; infobox "26–27 May 1941" ([1370699589](https://en.wikipedia.org/w/index.php?title=Operation_Skorpion&oldid=1370699589)) | 1941-05-26 |
| Siege of Basra (Q19996727, 2511629204) | 1987-02-26 | 1987-01-08 / 1987-02-26 / 1987-02-26 | infobox "8 January – mid April 1987" ([1370739316](https://en.wikipedia.org/w/index.php?title=Siege_of_Basra&oldid=1370739316)) | 1987-01-08 |
| Battle of Idlib (2015) (Q19678056, 2500221864) | 2015-03-28 | 2015-03-24 / 2015-03-28 / 2015-03-28 | infobox "24–28 March 2015" ([1373023827](https://en.wikipedia.org/w/index.php?title=Battle_of_Idlib_(2015)&oldid=1373023827)) | 2015-03-24 |

- Wikipedia and Wikidata's P580 agree on the start against our record. -> `date_start` = P580, `date_precision` = that statement's precision
  (ledger entry F15), applied to `data/events.json` and to the proposed copies (Tabriz, Iran crisis, 2009 protests) in `data/events.proposed.json`.
  Tabriz's `date_start_year_not_in_lead` flag no longer applies and was removed. `date_end` is unchanged in all nine, including where the article
  differs from Wikidata's P582 (Inherent Resolve "present" vs 2026-04-16; Basra "mid April" vs 1987-02-26; electronic device attacks 18 vs 19 September).
- Not changed (the article does not give P580 as the start, or contradicts itself):
  - `siege-of-kobani` (Q18071930): stored 2014-09-15 (P585); P580 2014-09-13. The infobox shows "15 September 2014 – 20 March 2015" but its
    age counter starts on 13 September, and the lead says it "was launched ... on 13 September 2014" (rev 1381716237).
  - `caucasus-campaign` (Q523154): stored 1914-10-29 (P585) is the infobox start "October 29, 1914" (rev 1381463257); P580 says 1914-10-24.
  - `middle-eastern-theatre-of-world-war-i` (Q1765465): stored 1914-10-30 (P585) is the lead's "between 30 October 1914 and 30 October 1918";
    the infobox says 29 October 1914 (= P580) (rev 1381474065).
  - `1966-syrian-coup-d-tat` (Q3560385, hand-picked seed): stored 1966-02-23 is Wikidata's P585 and P582; P580 1966-02-21 matches the lead
    "(21–23 February)" and the infobox "21–23 February 1966" (rev 1373445341). Seed dates are kept as typed (DATA_POLICY.md); F13 replaced only
    seed dates that are no Wikidata value, and this one is one. Left for the owner.

## Checks of 2026-10-29 (no data value changed unless stated)

### Five pairs of events share one article: kept, as the F12 rule says

- Reported as "the child shows the parent's text". Cause: each child's English sitelink is a Wikipedia **redirect**, created when its article was
  merged into the parent's (the redirect pages carry `{{R from merge}}`). Checked live 2026-10-29: Wikidata `wbgetentities` (sitelink badges),
  MediaWiki `redirects=1`, and each redirect page's own current revision:

| Event (QID) | enwiki sitelink badge | Redirect page revision | Leads to | That article's item |
|---|---|---|---|---|
| `ein-hashlosha-massacre` (Q123027684) | Q70893996 (sitelink to redirect) | [1292341323](https://en.wikipedia.org/w/index.php?oldid=1292341323) | October 7 attacks, section "Ein HaShlosha" | Q122976243 (`october-7-attacks`) |
| `operation-guardian-of-the-walls` (Q106786309) | Q70893996 | [1252974746](https://en.wikipedia.org/w/index.php?oldid=1252974746) | 2021 Israel–Palestine crisis | Q106775117 (`2021-israel-palestine-crisis`) |
| `israeli-invasion-of-the-gaza-strip` (Q123036458) | Q70893996 | [1355324836](https://en.wikipedia.org/w/index.php?oldid=1355324836) | Gaza war | Q122962941 (`2023-israel-hamas-war`) |
| `june-2025-iranian-strikes-on-israel` (Q134890505) | Q70894304 (intentional sitelink to redirect) | [1340981469](https://en.wikipedia.org/w/index.php?oldid=1340981469) | List of attacks during the Twelve-Day War, section "Operation True Promise III" | Q134961914 (a list; no event of its own) |
| `june-2025-israeli-strikes-on-iran` (Q134884640) | Q70893996 | [1358688908](https://en.wikipedia.org/w/index.php?oldid=1358688908) | the same list, section "Operation Rising Lion" | Q134961914 |
| `attack-on-the-united-states-embassy-in-baghdad` (Q80438042) | Q70893996 | [1358210097](https://en.wikipedia.org/w/index.php?oldid=1358210097) | December 2019 United States airstrikes in Iraq and Syria, section "U.S. embassy attack" | Q26847124 (`december-2019-united-states-airstrikes-in-iraq-and-syria`) |

- A title search (`list=search`, `intitle:`) finds no separate article for any of them ("Ein HaShlosha" is the kibbutz, "Embassy of the United
  States, Baghdad" the building). None has an article of its own, so there is no lead of its own to show.
- Decision: none changed. The owner's rule (2026-10-10, DATA_POLICY.md "Events without an article of their own", F12) includes every such event,
  with the note above its text; each of the six has a `resolved_qid` different from its `wikidata_qid`, which is what shows that note. A merge with
  a 301 (`data/event-redirects.json`) is for renamed ids only (DEPLOYMENT.md, "Renamed event ids") and would undo F12.
- Guard: `validate-events.js` now **fails** when two events share a `wikipedia_url` and more than one of them is the article's own event (no
  `resolved_qid` different from its `wikidata_qid`), i.e. when an event would show another item's text with no note. The F12 case (all but at most
  one sharer marked as having no article of its own) stays a listed warning; the same extract under different URLs stays a warning.

### Single-event date checks

| Event (QID) | Stored | Wikidata | English Wikipedia (revision) | Decision |
|---|---|---|---|---|
| `2023-afghanistan-iran-clash` (Q118779713, rev 2459851515) | 2023-05-01 (month) | P585 2023-05 (month); P580 **2022**-05-27 (day) | infobox "27 May 2023", lead "On 27 May 2023" ([1370424795](https://en.wikipedia.org/w/index.php?title=2023_Afghanistan%E2%80%93Iran_clash&oldid=1370424795)) | not fixed: Wikidata's only day value (P580) is a year off, so the two sources do not agree on the day (as `2022-gaza-israel-clashes`, F8). Stays flagged `month_precision_day_in_lead`; upstream correction drafted in `data/wikidata-date-suggestions.tsv` |
| `battle-of-gaza-2007` (Q373655, rev 2517661614; seed) | 2007-06-10 | P580 2007-06-10, P582 2007-06-15 | infobox "7–15 June 2007", lead "from 7 to 15 June 2007" ([1381695693](https://en.wikipedia.org/w/index.php?title=Battle_of_Gaza_(2007)&oldid=1381695693)) | not fixed: the stored date is Wikidata's P580, the article disagrees. Flagged by the new `lead_start_day_differs` check; drafted in the TSV (medium confidence) |
| `operation-provide-comfort` (Q2281470, rev 2556713063) | 1991-03-01 (month) | P580 1991-03 (month), P582 1996-12-31 | infobox "March 1991 – 31 December 1996"; lead "starting in April 1991" ([1380221795](https://en.wikipedia.org/w/index.php?title=Operation_Provide_Comfort&oldid=1380221795)) | not changed: stored = Wikidata = infobox; only the article's lead says April |
| `saudi-yemeni-war-1934` (Q1367731, rev 2538358965) | 1934-03-01 (month) to 1934-05-20 | P580 1934-03 (month), P582 1934-05-20 | infobox "20 March 1934 – 14 June 1934" ([1381123348](https://en.wikipedia.org/w/index.php?title=Saudi%E2%80%93Yemeni_war_(1934)&oldid=1381123348)) | not changed: the start month agrees (the day is the article's only); the end differs from Wikidata. Described in the TSV, not suggested |
| `2024-israel-hezbollah-conflict` (Q122974556, rev 2554064390; seed) | end 2024-11-27 | P580 2023-10-08, no P582 | lead "An ongoing conflict ... began on 8 October 2023" ([1368616555](https://en.wikipedia.org/w/index.php?title=Hezbollah%E2%80%93Israel_conflict_(2023%E2%80%93present)&oldid=1368616555)) | not changed: F13 records "the Hezbollah–Israel conflict keeps 2024-11-27 although the article says "present"" under its rule "`date_end` is never changed here", and seed dates are kept as typed (DATA_POLICY.md). Left for the owner |

### New advisory flag: `lead_start_day_differs` (flag only)

- A day-precision `date_start` that the first sentence of the lead does not name, while that sentence names another exact day of the same year
  before the stored end (`leadStartDayFlag`, `scripts/lib/flags.js`; a range "7 to 15 June 2007" counts from its first day). Like
  `month_precision_day_in_lead` it never changes a date: Wikidata and the article may simply differ, and the sentence may name another day of the
  event (an election's first round, a later massacre). `validate-events.js` lists it as a warning; `enrich-candidates.js` writes it into
  `review_reasons` of proposed events from its next run (the stored files were not re-enriched for it).
- On 2026-10-29 (after F15) it lists 37 curated events: `turkish-war-of-independence` 1919-05-19 (lead 1919-05-15), `battle-of-gaza-2007` 2007-06-10
  (2007-06-07), `2021-israel-palestine-crisis` 2021-05-06 (2021-05-10), `fao-landing`, `zilan-massacre`, `battle-of-palmyra-1941`,
  `second-battle-of-el-alamein`, `ma-alot-massacre`, `first-battle-of-al-faw`, `second-battle-of-fallujah` 2004-12-23 (2004-11-07),
  `2006-israeli-operation-in-beit-hanoun`, `battle-of-ras-al-ayn-2012-13`, `siege-of-kobani` (see F15), `ahvaz-military-parade-attack`,
  `israel-united-arab-emirates-normalization-agreement`, `operation-marg-bar-sarmachar`, `july-2024-houthi-israel-attacks`,
  `attempted-assassination-of-abdul-hamid-ii` 1905-06-21 (1905-07-21), `naval-operations-in-the-dardanelles-campaign`, `operation-morvarid`,
  `operation-hot-winter`, `2016-turkish-coup-d-etat-attempt`, `may-2025-gaza-offensive`, `2025-gaza-strip-aid-distribution-killings`,
  `occupation-of-constantinople`, `1947-anti-jewish-riots-in-aden`, `israeli-occupation-of-the-west-bank`, `2009-iranian-presidential-election`,
  `2012-egyptian-presidential-election`, `2013-israeli-legislative-election`, `2016-iranian-legislative-election`, `battle-of-tal-afar-2017`,
  `2020-syrian-parliamentary-election`, `2020-iranian-legislative-election`, `al-shati-refugee-camp-airstrikes`,
  `attacks-on-us-bases-during-the-middle-eastern-crisis-2023-present`, `attack-on-the-united-states-embassy-in-baghdad`. Not checked one by one;
  no date was changed from it.

### Empty "()" in extracts

- TextExtracts leaves an empty pair of parentheses where it strips everything a pair of brackets held: the Sykes–Picot lead read "The Sykes–Picot
  Agreement () was a 1916 secret treaty ...". `normalizeLead` (`scripts/lib/lead.js`) now also drops an empty "()" (only whitespace inside) with
  the spaces before it; parentheses with any other character inside are kept. It is used for every fetched lead and for the revision leads
  `backfill-revids.js` compares, so stored and fetched text stay comparable.
- Re-applied to the stored extracts (no network): **1 of 815** curated extracts changed (`sykes-picot-agreement`), none of the 255 proposed. Its
  `wikipedia_revid` 1379657240 still holds: that revision's parsed lead, normalised the same way, equals the new extract (checked live 2026-10-29).
  Its framing review's fingerprint (`text_sha1`) was updated to the new text (3cdaae19260a -> 6753ab5b901f): no word changed, and neither review
  finding is on the first sentence.

## Wikidata date refresh of 2026-10-30: 24 drifted dates set to Wikidata's value (owner-approved)

- Source: `node scripts/report-wikidata-drift.js` (live Wikidata, 2026-10-30) listed 55 differences in 39 events (21 `date_start`, 31 `date_end`,
  1 coordinates, 2 classes) plus 15 the ledger explains. The owner approved setting drifted dates to Wikidata's value. Each item's date statements
  were re-read with their ranks (`wbgetentities`, `props=claims`) and the date derived **as the pipeline derives it for a new event**: preferred
  statements if the item has any, else normal ones, deprecated ignored (as `wdt:`); start = the earliest P585, else the earliest P580, then
  `reconcileStartDate` (F2/F15); end = the latest P582; a coarse value stored as the 1st ("1920-00-00" -> 1920-01-01) with its precision in
  `date_precision` (`keptDatePrecision`). Date flags, the `date_precision_coarse` / `month_precision_day_in_lead` / `lead_start_day_differs` notes
  and `needs_review` were recomputed on the new dates as `scripts/lib/v21.js` `finalizeEvent` does. No ledger entry was added: the values are
  Wikidata's own, so a later change on Wikidata is listed by the drift report again (a ledger field would hide it as "explained").
- Not changed: any field the fix ledger sets (`scripts/lib/fixes.js`); a difference where Wikidata has **no** value (a stored date is not removed
  because Wikidata has none); a hand-picked seed date that the English article's lead or infobox gives while Wikidata differs; an item whose
  values are incoherent; coordinates and classes (report only). Titles and extracts are untouched, and so are the end dates of the six
  "–present" events (none has a Wikidata end). `data/seed-events.json` (the original hand-typed list) is not edited, as for F13.
- Every applied value was compared with the item's statement and with its English article: the lead (the stored extract) and the infobox at the
  revision named (read 2026-10-30).

| Event (QID) | Field | Old -> new | Wikidata | English Wikipedia |
|---|---|---|---|---|
| `fall-of-baghdad-1917` (Q2665637) | date_end | none -> 1917-03-11 | P582 1917-03-11 (day) | lead "(11 March 1917)"; infobox "8–11 March 1917" (rev 1374873756) |
| `iraqi-revolt-against-the-british` (Q616851) | date_start | 1920-05-30 -> 1920-01-01, year | P585 1920 (year), taken before P580 1920-05 | infobox "May–October 1920" (rev 1381194751) |
| | date_end | 1920-10-17 -> 1920-10-01 | P582 1920-10 (month) | lead "by the end of October 1920" |
| `great-syrian-revolt` (Q1968718) | date_start | 1925-07-18 -> 1925-07-19, day | P580 1925-07-19 | lead "1925 to 1927"; infobox "1925–1927" (rev 1379976254) |
| | date_end | 1927-04-01 -> 1927-06-01 | P582 1927-06 (month) | |
| `unification-of-saudi-arabia` (Q251600) | date_start | 1932-09-23 -> 1902-01-01, year | P585 = P580 1902 (year) | lead "Unification began in 1902 and culminated in 1932"; infobox "First phase: 13 January 1902 – 23 September 1932" (rev 1382706872) |
| | date_end | none -> 1932-01-01 | P582 1932 (year) | |
| `anglo-iraqi-treaty-1930` (Q541372) | date_start | 1932-10-03 -> 1930-06-30, day | P585 1930-06-30 | lead names 1930, no day, no infobox (rev 1369404529); its `date_start_year_not_in_lead` flag and `title_years_outside_dates` warning are gone |
| `1936-39-arab-revolt-in-palestine` (Q46057) | date_end | 1939-05-17 -> 1939-08-26 | P582 1939-08-26 (day) | infobox "19 April 1936 – 26 August 1939" (rev 1382040157) |
| `peel-commission` (Q655894) | date_start | 1936-11-01 -> 1936-08-01, month | P580 1936-08 (month) | lead "appointed in 1936" (rev 1375537897) |
| `white-paper-of-1939` (Q1501775) | date_start | 1939-05-17 -> 1939-01-01, year | P585 1939 (year) | lead "formal approval ... on 23 May 1939", neither the stored day nor a Wikidata value (rev 1357789658) |
| `nakba` (Q3266633) | date_start | 1948-05-15 -> 1948-01-01, year | P585 1948 (year) | lead "the foundational events of the Nakba in 1948" (rev 1381546706) |
| `1949-armistice-agreements` (Q999143) | date_start | 1949-02-24 -> 1949-01-01, year | P585 1949 (year) | lead names no date, no infobox (rev 1373406233) |
| `north-yemen-civil-war` (Q521199) | date_end | 1970-05-01 -> 1970-12-01 | P582 1970-12-01 (day) | infobox "26 September 1962 – 1 December 1970" (rev 1378725652) |
| `1966-syrian-coup-d-tat` (Q3560385) | date_end | none -> 1966-02-23 | P582 1966-02-23 (day) | lead "(21–23 February)"; infobox "21–23 February 1966" (rev 1373445341) |
| `1973-oil-crisis` (Q316817) | date_start | 1973-10-17 -> 1973-01-01, year | P585 1973 (year), taken before P580 1973-10-16 | lead "In October 1973", no infobox (rev 1378160425) |
| | date_end | 1974-03-18 -> 1974-03-17 | P582 1974-03-17 (day) | lead "In March 1974" |
| `al-anfal-campaign` (Q529723) | date_start | 1986-02-23 -> 1986-01-01, year | P580 1986 (year): P585 1988-09 lies between P580 and P582, so `reconcileStartDate` takes P580 (`date_source_adjusted` added) | lead and infobox "February–September 1988" (rev 1377434227): the `date_start_year_not_in_lead` flag stays |
| | date_end | 1989-09-06 -> 1989-01-01 | P582 1989 (year) | |
| `arab-spring` (Q33761) | date_end | 2012-01-01 -> 2012-12-01 | P582 2012-12 (month) | infobox "17 December 2010 – December 2012" (rev 1382315239) |
| `syrian-civil-war` (Q178810) | date_end | none -> 2024-12-08 | P582 2024-12-08 (day, normal rank) | lead "culminated in the fall of the Assad regime in December 2024"; infobox end date 2024-12-08 (rev 1382725076) |
| `egyptian-crisis-2011-2014` (Q577539) | date_start | 2012-06-30 -> 2011-01-25, day | P580 2011-01-25 | lead "began with the 2011 Egyptian revolution" (rev 1382699726); its `title_years_outside_dates` warning is gone |
| | date_end | 2014-06-08 -> 2014-05-01 | P582 2014-05 (month) | lead "ended with the presidency of Abdel Fattah el-Sisi in 2014" |
| `mahsa-amini-protests` (Q114065797) | date_end | 2023-01-01 -> 2023-09-01 | P582 2023-09 (month) | infobox "16 September 2022 – 2023" (rev 1376655382) |

- What the site shows: an end date appears as its year only, and an end on the start day not at all, so of the end changes only Formation of
  Saudi Arabia (now 1902–1932) and the Syrian civil war (now 2011–2024; it was in its start year only) look different. Start dates now show at
  Wikidata's precision: Great Syrian Revolt, Anglo-Iraqi Treaty and Egyptian Crisis to the day, Peel Commission to the month, the seven
  year-precision ones as the year (as before: without `date_precision` a seed date already showed as the year only). Eleven seed events gained a
  `date_precision` (seeds without one: 19 -> 8). `validate-events.js` warnings on the curated file: 178 -> 164, none new. Events without an end
  date: 501 -> 497. `data/selection-funnel.json` (by decade) and `data/missing-coordinates-report.md` (dates column) were regenerated.

### Differences left as they are (31)

| Event (QID) | Field | Stored | Wikidata | Why not applied |
|---|---|---|---|---|
| `german-ottoman-alliance` (Q261982) | date_start | 1914-08-02 | P585 1914-07-20 | not drift: the value is in the **Julian** calendar (calendarmodel Q1985786), i.e. 2 August 1914 Gregorian, the stored date and the lead's ("August 2, 1914"). The report compares the raw value |
| `armistice-of-erzincan` (Q28048694) | date_start | 1917-12-18 | P585 1917-12-05 | not drift: Julian, = 18 December 1917 Gregorian; lead "18 December 1917 (5 December O.S.)" |
| `mcmahon-hussein-correspondence`, `national-pact`, `khartoum-resolution`, `iranian-green-movement` | date_start | | none | Wikidata has no P585/P580 |
| `mcmahon-hussein-correspondence`, `1929-palestine-riots`, `peel-commission`, `nakba`, `1949-armistice-agreements`, `khartoum-resolution`, `israeli-disengagement-from-gaza`, `iranian-green-movement`, `fall-of-the-assad-regime` | date_end | | none | Wikidata has no P582: a stored end is not removed (the riots' 29 August 1929 is the infobox's, Peel's 7 July 1937 and the Fall of the Assad regime's 8 December 2024 are the lead's) |
| `2024-israel-hezbollah-conflict` (Q122974556) | date_end | 2024-11-27 | none | no P582, and a "–present" title: not touched |
| `fall-of-baghdad-1917` (Q2665637) | date_start | 1917-03-11 | P585 1917 (year); P580 1917-03-08 | the lead gives the stored date ("(11 March 1917)") |
| `israeli-disengagement-from-gaza` (Q196122) | date_start | 2005-08-15 | P585 2005-08 (month) | the lead gives the stored date ("August 15, 2005") |
| `iranian-revolution` (Q126065) | date_start, date_end | 1978-01-07, 1979-02-11 | P580 1978-01 (month), P585 1970 (decade); P582 1979-02 (month) | the infobox gives both stored dates, "7 January 1978 – 11 February 1979" (rev 1382707136) |
| `balkan-wars` (Q165725) | date_end | 1913-08-10 | P582 1913-07-18 | the infobox gives the stored date, "8 October 1912 – 10 August 1913" (rev 1382825048) |
| `arab-revolt` (Q239060) | date_end | 1918-10-25 | P582 1918-10 (month) | the infobox gives the stored date, "10 June 1916 – 25 October 1918" (rev 1380894633, cited by F14) |
| `1948-palestine-war` (Q49097) | date_end | 1949-03-10 | P582 1949-07-20 | the lead gives the stored date ("30 November 1947 – 10 March 1949") |
| `yom-kippur-war` (Q49100) | date_end | 1973-10-25 | P582 1973-10-26 | the lead gives the stored date ("6–25 October 1973") |
| `armenian-genocide` (Q80034) | date_end | 1917-01-01 | P582 1923 (year) | the article gives the stored year: infobox "1915–1917" (rev 1382213148), lead "State-sponsored killings mostly ceased by early 1917"; 1923 is the lead's end of the prosecutions |
| `1982-lebanon-war` (Q49103) | date_end | 1982-09-01 | P582 1985-05-17 | Wikidata contradicts the article: lead "ended its operation on 29 September 1982", infobox "6 June – 29 September 1982" (rev 1381378524); the shown year, 1982, is the article's |
| `jewish-exodus-from-the-muslim-world` (Q276172) | date_start, date_end | 1948-01-01, 1972-01-01 | P585 2000 (century), P580 1930 (decade); P582 1970 (decade) | incoherent: the pipeline's start would be P585 "2000" at century precision (the 20th century), after the end (a reversed range); the lead says "from 1948 to the early 1970s" |
| `operation-tariq-al-quds` (Q1382298) | coordinates | none | P625 31.7315, 48.0418 | coordinates are out of scope here (report only) |
| `ottoman-entry-into-world-war-i` (Q1328496), `operation-aspides` (Q124618589) | classes | | new P31 | classes are out of scope here (report only) |

- Monthly refresh: the drift report stays **report only**. A listed date difference is applied by hand, by the rule above, in a reviewed pull
  request with an entry here; nothing applies it automatically.
- Known false positive of the report: a Wikidata date in the Julian calendar (the two above) is compared as written, not converted.
