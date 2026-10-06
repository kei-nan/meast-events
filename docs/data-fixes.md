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
