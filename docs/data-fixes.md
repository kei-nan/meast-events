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
| Wikidata date order invalid (`date_order_invalid`) | 5 | kept, dates as Wikidata gives them, flagged with a Wikipedia lead comparison note |
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
