# Objective Wikipedia-recorded signals for a random sample of atlas.wiki events

Status: research report, produced 2026-09-26/27. Read-only: no `data/` or code was changed.
Scope: 80 of the 394 events in `data/events.json`. **This report measures signals that Wikipedia and Wikimedia
themselves record. It does not decide whether any article is biased, and nothing here should be read as such a verdict.**

Files in `docs/bias-review/`: `sample.json` (the sample), `signals.json` (all raw per-event measurements),
`scores.json` (red-flag score per event), `leads-comparison.md` (site lead vs live lead for all 80),
`scripts/` (01 sample, 02 fetch, 03 report, 04 verify; re-runnable).

## 1. Headline findings

- **No sampled article carries a POV/NPOV/"disputed" page banner.** 0/80. Two carry a *tone* family banner
  (Saddam Hussein: "Tone", in a body section; Battle of Medina Ridge: "Promotional", in the lead area). Neither is a
  neutrality dispute banner as such. One additional banner, "AI" (AI-generated content), sits on Saddam Hussein.
  The absence of these tags is not evidence of neutrality (see section 6).
- **Sourcing banners are more common than neutrality banners:** 13/80 (16%) have "More citations needed",
  "More citations needed section" or "Unreferenced section" (a few have two). 120 `{{citation needed}}` tags across the sample;
  38/80 articles have at least one, 6/80 have 5 or more (largest: Houthi insurgency 24, 2015 Beirut bombings 11, 2003 invasion of Iraq 10),
  10 of the 120 are in leads.
- **Wikipedia's own contentious-topic machinery flags 21/80 (26%) talk pages** (Contentious topics / general-sanctions
  notice). Broken down: Arab-Israeli conflict (ARBPIA) 11, Syria/Iraq/ISIL general sanctions 3, Kurds 2, Iranian politics 1,
  BLP 1, American politics 1, plus 2 with a page-specific restriction notice (Halabja massacre, Al-Dawayima massacre).
  Of the 8 sampled "israeli-palestinian" events, 6 have this notice and 6 are extended-confirmed protected.
- **Protection:** 16/80 are currently edit-protected (13 extended-confirmed, 3 autoconfirmed/semi); 31/80 have any protection-log entry ever.
  Of the 14 events that have both, protection and a CT notice go together; the two protected pages with **no** CT notice are
  Battle of Lule Burgas (semi-protected; the page carries "protected due to sockpuppetry") and Saddam Hussein (semi).
- **Volatility (12 months to 2026-09-26):** median 22 edits per article, median 1 edit later reverted; 20/80 have >= 10 edits
  later reverted. Highest: Battle of Lule Burgas 55 of 82 edits later reverted (35 explicit undo/rollback/manual-revert
  tags; semi-protected), Saddam Hussein 44/246 (14 talk archive pages, 133 talk edits in the year, 17 edit summaries mentioning NPOV/POV/undue/consensus etc.),
  2003 invasion of Iraq 35/170, Arab Spring 30/142, Iraqi insurgency 30/105.
- **Quality classes** (WikiProject assessments): 1 A, 2 GA, 25 B, 33 C, 16 Start, 2 Stub, 1 unassessed. No FA. 22% are Start/Stub.
- **Reference density:** median 18.0 references per 1000 words (min 5.7 Goeben/Breslau, 6.4 Siege of Medina). 4 articles are under 8 per 1000 words.
- **Leads:** 78/80 site extracts are identical to the live Wikipedia summary today. Two differ: **Saddam Hussein** (Wikipedia
  editors rewrote the lead after we retrieved it on 2026-09-13; the sentence "The policies and ideologies he championed are collectively
  known as Saddamism, a right-wing variant of Ba'athism" that our site displays is no longer in the live lead, and 8 edits
  have been made since retrieval) and **Iranian Green Movement** (one sentence about Montazeri edited). 53 of the 80 extracts were
  retrieved on 2026-09-26, so for those a change would have to occur within a day. Full diffs: `leads-comparison.md`.
- **Interlanguage coverage:** 7 to 135 language editions (median 19.5).
- **Contested vs other, in this sample:** contested-topic articles show *more* contentious-topic notices and protection
  (CT notice 38% vs 9%; edit-protected 29% vs 6%) but *fewer* maintenance tags and *fewer* reverts (median reverted edits
  0.5 vs 6; inline dispute/reliability tags 8% vs 28%). i.e. Wikipedia's formal protection regime is concentrated where the
  formal rules apply, while the highest recent revert counts are in Iraq-war articles and a low-traffic Balkan-war article
  (Lule Burgas). n is small (48 vs 32); do not over-read this.

## 2. Method

**Data.** `data/events.json` at commit `f0f6c80` plus merge of `integration/search-v2` (394 events). All calls to the
English Wikipedia Action API (`en.wikipedia.org/w/api.php`), REST `page/summary`, and Wikidata `wbgetentities`, with User-Agent
`AtlasWiki/0.1 (contact: contact address removed)`, sequential with >= 0.25 s spacing (about 1,000 requests). Responses cached outside the
repo (session scratchpad). Measurement time: 2026-09-26/27. "12 months" = revisions since 2025-09-26T00:00:00Z.

**Sample (script `scripts/01_sample.py`).** Python `random.Random(20260927)` (Mersenne Twister), input sorted by event id. 80 events = 4 eras x 20.
Era by `date_start` year: `<1948`, `1948-1990`, `1991-2010`, `2011+`. Each era gets 12 slots for "contested-topic" events and 8 for "other".
Contested topics are assigned by keyword/country rules on title + extract (first match wins, rarest first):
Armenian genocide/Armenia, Kurdish conflicts (`Kurd`), Turkey/Cyprus (`Cyprus`), Iran-Iraq/Gulf, Syrian war (Syria and >= 2011),
Israeli-Palestinian (country tag `Israel/Palestine` or Palestin/Israel/Gaza/West Bank/Intifada/Hamas/Hezbollah/Zionis/Nakba/Jerusalem),
Lebanon, Egypt/Sinai. Slots are filled round-robin **across topics** (so small topics are oversampled and the huge Israeli-Palestinian
group is *under*-represented relative to its 156-event pool), then "other" round-robin across Wikidata categories. Result: 48 contested + 32 other;
topic counts: Lebanon 9, Egypt/Sinai 9, Iran-Iraq/Gulf 8, Israeli-Palestinian 8, Kurdish 7, Armenian 5, Syrian war 2, other 32; Turkey/Cyprus 0
(no event in the dataset matched `Cyprus`). The topic labels are my keyword heuristic, not Wikipedia's or Wikidata's. The Syrian-war
stratum (2 events) and Armenian (5) are too small for any rate.

**Signals (script `scripts/02_fetch.py`; raw values in `signals.json`).**

| Signal | How measured | Caveat |
|---|---|---|
| (a) banners | Parsed article HTML: `ambox` maintenance banners identified by their `box-<Template>` class; split lead vs body at the first `<h2>`. Also the category list (e.g. "All NPOV disputes"). Groups: neutrality (POV, NPOV, Neutrality, Unbalanced, Undue, Globalize, Tone, Promotional, Peacock, Weasel, Bias...), disputed-accuracy (Disputed, Accuracy, Dubious, Fringe...), sourcing (More citations needed, Refimprove, Unreferenced, Primary sources, Third-party, Unreliable, Original research...), current-event. | A banner listed only sees what is on the page *now*; tags removed earlier are invisible. |
| (a) inline tags | `<sup class="noprint Inline-Template">` labels in rendered HTML (resolves redirects/aliases such as `{{cn}}`, `{{fact}}`). `citation needed` counted separately (lead vs body). Cross-check by wikitext regex agrees where tested (Houthi insurgency 24/24, 2015 Beirut bombings 11/11). | |
| (a) talk-page | Talk page templates: `Contentious topics/talk notice`, `... Arab-Israeli talk notice`, `ARBPIA`, `Gs/talk notice`, `page restriction talk notice`, `ArbCom ... enforcement`. Topic = template parameter or template name. | Only shows a notice exists, not that any sanction was applied. |
| (b) protection | `prop=info&inprop=protection` (current edit/move level) and `list=logevents&letype=protect` (all events, and events in last 12 months). | Log includes routine vandalism protections. |
| (c) quality | `pageassessments` "Project-independent assessment" if present, else most common WikiProject class, else talk-banner `class=`. | Assessments are made by WikiProject editors, some are years old. |
| (d) references | Unique numbered footnotes (`cite_note-*` list items) in rendered HTML / words in the plain-text extract (`prop=extracts&explaintext`, i.e. excludes reference lists). | Sfn/short-cite styles and explanatory notes are counted as "references" too; density is a crude proxy for verifiability. |
| (d) source types | Host of the first non-archive external link in each reference. Classified only by host: (1) government/military/official (`.gov`, `.mil`, `gov.xx`, idf.il, un.org, kremlin.ru...); (2) a short list I compiled of state-affiliated/advocacy outlets (Fars, Wafa, Anadolu, TRT, IRNA, Kuna, Al-Manar, JVL-type advocacy sites...); (3) hosts on Wikipedia's Perennial Sources list as deprecated/generally unreliable. | See "not classified" below. |
| (e) volatility | `prop=revisions` since 2025-09-26: number of edits, distinct editors, IP edits, edits carrying tag `mw-reverted` (an edit that was later reverted), edits carrying `mw-undo`/`mw-rollback`/`mw-manual-revert` (edits that are themselves reverts), edit summaries matching revert/NPOV/undue/consensus/"edit war"/bias words, sum of absolute size change between successive revisions, talk edits and talk archive subpages. | Bots and vandalism reverts are **not** separated from content-dispute reverts. High churn on a page also just means popularity or breaking news. |
| (f) interlanguage | `prop=langlinks` (English excluded). | Re-checked against Wikidata sitelinks: 133 vs 135 (Saddam), 13/13, 28/28, 45/46, 25/25 (differences are Wikipedias Wikidata lists differently). |
| (g) lead | Stored `extract` vs current REST `page/summary` extract, whitespace-normalised, plus a sentence diff. Also the count of edits since `retrieved_at`. | This compares our stored text to the live summary, not to the lead as of the retrieval revision. |

**Reliability list check.** I looked up the Perennial Sources page (2026-09-27): Tasnim (deprecated 2024), Press TV (deprecated),
Global Times (deprecated), MintPress (deprecated), Sputnik (deprecated), Jewish Virtual Library ("partisan ... mostly unreliable") are listed.
**Fars News Agency is not on that page**; my first draft list wrongly included it, so it is counted only in the "state-affiliated/advocacy" bucket (my own
bucket, not Wikipedia's). The other hosts on my unreliable list (Daily Mail, RT, Breitbart, Infowars, Grayzone, Zero Hedge) were not re-verified
but none appears in the sample.

**What I did NOT classify.** I did not judge whether any source is "partisan" beyond the host lists above; did not classify books, journals, or
NGO/think-tank reports (large share; 1,542 of 7,054 references, 22%, have no external URL at all, usually books/short cites); did not
evaluate whether any sentence is accurate, balanced, or well weighted; did not read talk-page arguments; did not detect
non-English sources; did not follow archived links; did not measure reader-facing quality scores (ORES/LiftWing) or page views.

**Red-flag score (a triage aid, not a bias score).** Sum of: neutrality/disputed banner or category +3; inline dispute/reliability tags 1-4 +1, >= 5 +2;
`citation needed` >= 5 +1, >= 10 +2; sourcing banner +1; CT/GS talk notice +1; currently edit-protected +1; protection log >= 5 entries +1;
edits later reverted in 12 months >= 10 +1, >= 25 +2; assessed Start/Stub +1; < 8 refs per 1000 words +1; cites a Wikipedia-listed
deprecated/unreliable host +1 (only 2 articles trigger this); current-event banner +1. The weights are my arbitrary choices. Many of these signals measure *attention* (a heavily edited,
protected, CT-flagged page is one that many editors are watching) as much as *defects*.

## 3. Aggregate rates by stratum

Columns: share with a POV/NPOV/disputed/tone/promotional banner or category; share with any inline dispute/reliability tag
(dubious, failed verification, unreliable source?, better source needed, non-primary source needed, tone, by whom?, ...); share with a sourcing banner;
median citation-needed count; share with a CT/GS notice on the talk page; share currently edit-protected; share assessed Start/Stub;
median refs per 1000 words; median edits in 12 months; median and >=10 counts of later-reverted edits; median languages; share with a changed lead;
median red-flag score. **n is stated per row; rows with n < 10 (all topic rows except "other" and "contested", most category rows, A/GA/Stub/unassessed) are too small to support any conclusion, and I report them only for completeness.** With n = 20 per era, a
difference of ~20 percentage points is about the width of the noise.

| Era | n | NPOV/POV/disputed banner or cat | any inline dispute/reliability tag | sourcing banner | median cn | CT/GS talk notice | edit-protected now | Start/Stub | median refs/1k words | median edits 12m | median reverted edits 12m | >=10 reverted edits | median langs | lead changed | median score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <1948 | 20 | 0/20 (0%) | 4/20 (20%) | 4/20 (20%) | 0.0 | 3/20 (15%) | 4/20 (20%) | 6/20 (30%) | 14.5 | 22.0 | 3.0 | 5/20 (25%) | 21.0 | 0/20 (0%) | 1.0 |
| 1948-1990 | 20 | 1/20 (5%) | 2/20 (10%) | 4/20 (20%) | 1.0 | 6/20 (30%) | 5/20 (25%) | 3/20 (15%) | 17.6 | 40.5 | 5.0 | 8/20 (40%) | 26.5 | 1/20 (5%) | 1.5 |
| 1991-2010 | 20 | 1/20 (5%) | 3/20 (15%) | 5/20 (25%) | 1.0 | 4/20 (20%) | 3/20 (15%) | 6/20 (30%) | 16.8 | 16.5 | 1.0 | 5/20 (25%) | 12.5 | 1/20 (5%) | 2.0 |
| 2011+ | 20 | 0/20 (0%) | 2/20 (10%) | 0/20 (0%) | 0.0 | 8/20 (40%) | 4/20 (20%) | 3/20 (15%) | 28.6 | 21.0 | 0.0 | 2/20 (10%) | 23.5 | 0/20 (0%) | 1.0 |
| ALL | 80 | 2/80 (2%) | 11/80 (14%) | 13/80 (16%) | 0.0 | 21/80 (26%) | 16/80 (20%) | 18/80 (22%) | 18.0 | 22.0 | 1.0 | 20/80 (25%) | 19.5 | 2/80 (2%) | 1.0 |

| Topic stratum | n | NPOV/POV/disputed banner or cat | any inline dispute/reliability tag | sourcing banner | median cn | CT/GS talk notice | edit-protected now | Start/Stub | median refs/1k words | median edits 12m | median reverted edits 12m | >=10 reverted edits | median langs | lead changed | median score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| armenian-genocide/Armenia | 5 | 0/5 (0%) | 1/5 (20%) | 2/5 (40%) | 0 | 0/5 (0%) | 0/5 (0%) | 3/5 (60%) | 21.9 | 10 | 1 | 2/5 (40%) | 10 | 0/5 (0%) | 2 |
| egypt-sinai | 9 | 0/9 (0%) | 1/9 (11%) | 1/9 (11%) | 0 | 3/9 (33%) | 1/9 (11%) | 3/9 (33%) | 18.8 | 13 | 1 | 2/9 (22%) | 14 | 0/9 (0%) | 1 |
| iran-iraq-gulf | 8 | 1/8 (12%) | 1/8 (12%) | 0/8 (0%) | 0.5 | 2/8 (25%) | 1/8 (12%) | 2/8 (25%) | 17.9 | 19.5 | 0.5 | 1/8 (12%) | 12.0 | 0/8 (0%) | 1.5 |
| israeli-palestinian | 8 | 0/8 (0%) | 1/8 (12%) | 1/8 (12%) | 0.0 | 6/8 (75%) | 6/8 (75%) | 0/8 (0%) | 13.6 | 11.5 | 0.0 | 0/8 (0%) | 11.5 | 0/8 (0%) | 2.0 |
| kurdish-conflicts | 7 | 0/7 (0%) | 1/7 (14%) | 0/7 (0%) | 1 | 3/7 (43%) | 3/7 (43%) | 1/7 (14%) | 19.8 | 9 | 1 | 0/7 (0%) | 25 | 0/7 (0%) | 1 |
| lebanon | 9 | 0/9 (0%) | 0/9 (0%) | 3/9 (33%) | 1 | 3/9 (33%) | 2/9 (22%) | 1/9 (11%) | 16.6 | 42 | 7 | 4/9 (44%) | 26 | 0/9 (0%) | 2 |
| other | 32 | 1/32 (3%) | 6/32 (19%) | 6/32 (19%) | 1.0 | 3/32 (9%) | 2/32 (6%) | 6/32 (19%) | 17.7 | 37.0 | 6.0 | 11/32 (34%) | 24.0 | 2/32 (6%) | 1.0 |
| syrian-war | 2 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 0.0 | 1/2 (50%) | 1/2 (50%) | 2/2 (100%) | 37.0 | 12.0 | 0.0 | 0/2 (0%) | 10.0 | 0/2 (0%) | 2.0 |
| contested (all topics) | 48 | 1/48 (2%) | 5/48 (10%) | 7/48 (15%) | 0.0 | 18/48 (38%) | 14/48 (29%) | 12/48 (25%) | 18.4 | 14.5 | 0.5 | 9/48 (19%) | 14.0 | 0/48 (0%) | 2.0 |
| other | 32 | 1/32 (3%) | 6/32 (19%) | 6/32 (19%) | 1.0 | 3/32 (9%) | 2/32 (6%) | 6/32 (19%) | 17.7 | 37.0 | 6.0 | 11/32 (34%) | 24.0 | 2/32 (6%) | 1.0 |

| Wikidata category | n | NPOV/POV/disputed banner or cat | any inline dispute/reliability tag | sourcing banner | median cn | CT/GS talk notice | edit-protected now | Start/Stub | median refs/1k words | median edits 12m | median reverted edits 12m | >=10 reverted edits | median langs | lead changed | median score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| massacre | 13 | 0/13 (0%) | 0/13 (0%) | 1/13 (8%) | 0 | 7/13 (54%) | 7/13 (54%) | 3/13 (23%) | 21.5 | 17 | 1 | 1/13 (8%) | 13 | 0/13 (0%) | 2 |
| battle | 12 | 1/12 (8%) | 2/12 (17%) | 3/12 (25%) | 0.0 | 0/12 (0%) | 1/12 (8%) | 5/12 (42%) | 15.3 | 21.0 | 3.5 | 3/12 (25%) | 12.5 | 0/12 (0%) | 1.0 |
| terrorist attack | 11 | 0/11 (0%) | 0/11 (0%) | 2/11 (18%) | 1 | 2/11 (18%) | 1/11 (9%) | 5/11 (45%) | 21.9 | 5 | 0 | 0/11 (0%) | 16 | 0/11 (0%) | 1 |
| political | 9 | 1/9 (11%) | 3/9 (33%) | 1/9 (11%) | 0 | 5/9 (56%) | 3/9 (33%) | 0/9 (0%) | 21.3 | 47 | 2 | 3/9 (33%) | 38 | 1/9 (11%) | 2 |
| war | 7 | 0/7 (0%) | 1/7 (14%) | 1/7 (14%) | 0 | 1/7 (14%) | 0/7 (0%) | 2/7 (29%) | 15.1 | 68 | 14 | 5/7 (71%) | 32 | 0/7 (0%) | 1 |
| uprising | 6 | 0/6 (0%) | 3/6 (50%) | 1/6 (17%) | 2.0 | 2/6 (33%) | 1/6 (17%) | 0/6 (0%) | 22.2 | 43.0 | 7.5 | 2/6 (33%) | 25.0 | 1/6 (17%) | 1.5 |
| military operation | 5 | 0/5 (0%) | 0/5 (0%) | 0/5 (0%) | 0 | 0/5 (0%) | 0/5 (0%) | 0/5 (0%) | 12.4 | 13 | 1 | 1/5 (20%) | 17 | 0/5 (0%) | 0 |
| treaty | 5 | 0/5 (0%) | 1/5 (20%) | 1/5 (20%) | 1 | 2/5 (40%) | 2/5 (40%) | 1/5 (20%) | 16.1 | 23 | 0 | 1/5 (20%) | 35 | 0/5 (0%) | 2 |
| siege | 4 | 0/4 (0%) | 0/4 (0%) | 1/4 (25%) | 0.0 | 1/4 (25%) | 1/4 (25%) | 2/4 (50%) | 15.2 | 9.5 | 1.0 | 1/4 (25%) | 10.5 | 0/4 (0%) | 1.5 |
| terrorism | 2 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 1.5 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 21.1 | 55.5 | 16.5 | 2/2 (100%) | 30.5 | 0/2 (0%) | 1.0 |
| assassination | 2 | 0/2 (0%) | 0/2 (0%) | 1/2 (50%) | 4.5 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 21.3 | 10.0 | 0.5 | 0/2 (0%) | 10.0 | 0/2 (0%) | 1.0 |
| rebellion | 2 | 0/2 (0%) | 1/2 (50%) | 1/2 (50%) | 15.5 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 20.1 | 65.0 | 15.0 | 1/2 (50%) | 25.0 | 0/2 (0%) | 3.5 |
| war crime | 1 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 16.9 | 51 | 1 | 0/1 (0%) | 17 | 0/1 (0%) | 0 |
| diplomatic | 1 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0 | 1/1 (100%) | 0/1 (0%) | 0/1 (0%) | 30.8 | 35 | 1 | 0/1 (0%) | 10 | 0/1 (0%) | 1 |

| Quality class | n | NPOV/POV/disputed banner or cat | any inline dispute/reliability tag | sourcing banner | median cn | CT/GS talk notice | edit-protected now | Start/Stub | median refs/1k words | median edits 12m | median reverted edits 12m | >=10 reverted edits | median langs | lead changed | median score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 1 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 11.6 | 76 | 2 | 0/1 (0%) | 32 | 0/1 (0%) | 0 |
| GA | 2 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 0.5 | 0/2 (0%) | 0/2 (0%) | 0/2 (0%) | 17.4 | 37.0 | 6.5 | 0/2 (0%) | 23.0 | 0/2 (0%) | 0.0 |
| B | 25 | 1/25 (4%) | 6/25 (24%) | 2/25 (8%) | 1 | 12/25 (48%) | 8/25 (32%) | 0/25 (0%) | 21.3 | 38 | 4 | 9/25 (36%) | 26 | 2/25 (8%) | 2 |
| C | 33 | 1/33 (3%) | 3/33 (9%) | 5/33 (15%) | 0 | 7/33 (21%) | 5/33 (15%) | 0/33 (0%) | 17.4 | 19 | 1 | 6/33 (18%) | 18 | 0/33 (0%) | 1 |
| Start | 16 | 0/16 (0%) | 1/16 (6%) | 6/16 (38%) | 0.5 | 2/16 (12%) | 3/16 (19%) | 16/16 (100%) | 16.6 | 9.0 | 0.5 | 4/16 (25%) | 12.0 | 0/16 (0%) | 2.0 |
| Stub | 2 | 0/2 (0%) | 1/2 (50%) | 0/2 (0%) | 0.0 | 0/2 (0%) | 0/2 (0%) | 2/2 (100%) | 34.0 | 36.5 | 8.5 | 1/2 (50%) | 10.5 | 0/2 (0%) | 2.0 |
| unassessed | 1 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 19.8 | 9 | 1 | 0/1 (0%) | 9 | 0/1 (0%) | 0 |

Reading it, with those cautions:

- The era rows suggest more CT notices for 2011+ (40%) and 1948-1990 (30%) than pre-1948 (15%), and more heavily-reverted articles in 1948-1990 (40% with >= 10 reverted edits) than 2011+ (10%). With n = 20 each these are suggestive only.
- Only 2 of 80 articles have any neutrality-family banner; there is nothing to stratify.
- By quality class, B-class articles are the most contested by every activity measure (CT notice 48%, protected 32%, >= 10 reverted edits 36%, median 38 edits) - i.e. Wikipedia's better-developed articles on contested topics are where the machinery and editors concentrate; Start-class articles show more sourcing banners (38%).
- The "israeli-palestinian" stratum is n = 8 (of 156 in the dataset); 6/8 CT notice, 6/8 protected. Because the sample under-represents it, **this report cannot say anything about the Israeli-Palestinian articles as a group**; a targeted sample would be needed.

## 4. Per-event table (all 80)

Columns: quality class; edit protection now (protection-log entries ever); banners (page/section) and inline tags other than citation-needed; citation-needed count;
CT topic(s) on talk; refs per 1000 words (number of refs); edits in 12 months / distinct editors / edits later reverted / edits that are undo-rollback-revert;
number of language editions; whether the lead differs from live. Links go to the article; sample ids, QIDs and strata are in `sample.json`.

| # | id (link) | era / topic | qual | edit-prot (log) | banners / inline tags | cn | CT talk | refs/1k w (n refs) | edits 12m / editors / reverted / undo-rollback | langs | lead changed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [battle-of-maysalun](https://en.wikipedia.org/wiki/Battle_of_Maysalun) | <1948 / lebanon | GA | none (0) | -; permanent dead linkx1 | 0 | - | 13.2 (39) | 29 / 14 / 7 / 5 | 25 | no |
| 2 | [simele-massacre](https://en.wikipedia.org/wiki/Simele_massacre) | <1948 / kurdish-conflicts | GA | none (1) | -; permanent dead linkx1 | 1 | - | 21.64 (86) | 45 / 27 / 6 / 5 | 21 | no |
| 3 | [urfa-resistance](https://en.wikipedia.org/wiki/Urfa_resistance) | <1948 / armenian-genocide/Armenia | Stub | none (0) | -; unreliable fringe source?x1 | 0 | - | 17.18 (5) | 10 / 6 / 1 / 1 | 10 | no |
| 4 | [fao-landing](https://en.wikipedia.org/wiki/Fao_Landing) | <1948 / iran-iraq-gulf | Start | none (0) | -; - | 0 | - | 11.06 (7) | 7 / 7 / 0 / 0 | 10 | no |
| 5 | [1929-palestine-riots](https://en.wikipedia.org/wiki/1929_Palestine_riots) | <1948 / israeli-palestinian | B | edit=extendedconfirmed (4) | -; failed verificationx1, unreliable source?x4, non-primary source neededx6 | 2 | arab-israeli,arbpia | 15.33 (110) | 34 / 16 / 0 / 0 | 24 | no |
| 6 | [first-battle-of-el-alamein](https://en.wikipedia.org/wiki/First_Battle_of_El_Alamein) | <1948 / egypt-sinai | B | none (1) | -; - | 0 | - | 19.59 (132) | 33 / 14 / 0 / 0 | 43 | no |
| 7 | [franco-syrian-war](https://en.wikipedia.org/wiki/Franco-Syrian_War) | <1948 / lebanon | C | none (2) | -; - | 0 | - | 10.34 (12) | 42 / 19 / 20 / 9 | 26 | no |
| 8 | [zilan-massacre](https://en.wikipedia.org/wiki/Zilan_massacre) | <1948 / kurdish-conflicts | C | edit=extendedconfirmed (2) | -; dead linkx1, permanent dead linkx1 | 0 | kurd | 29.65 (44) | 8 / 7 / 1 / 1 | 9 | no |
| 9 | [battle-of-holy-apostles-monastery](https://en.wikipedia.org/wiki/Battle_of_Holy_Apostles_Monastery) | <1948 / armenian-genocide/Armenia | C | none (0) | -; - | 0 | - | 26.6 (17) | 21 / 11 / 13 / 3 | 14 | no |
| 10 | [pursuit-of-goeben-and-breslau](https://en.wikipedia.org/wiki/Pursuit_of_Goeben_and_Breslau) | <1948 / israeli-palestinian | C | none (0) | -; - | 0 | - | 5.73 (20) | 9 / 8 / 1 / 1 | 17 | no |
| 11 | [operation-skorpion](https://en.wikipedia.org/wiki/Operation_Skorpion) | <1948 / egypt-sinai | B | none (0) | -; - | 0 | - | 11.43 (26) | 13 / 6 / 1 / 1 | 10 | no |
| 12 | [sykes-picot-agreement](https://en.wikipedia.org/wiki/Sykes%E2%80%93Picot_Agreement) | <1948 / lebanon | B | edit=extendedconfirmed (1) | More citations needed, Unreferenced section; - | 2 | arab-israeli | 16.07 (131) | 23 / 16 / 4 / 2 | 65 | no |
| 13 | [ottoman-entry-into-world-war-i](https://en.wikipedia.org/wiki/Ottoman_entry_into_World_War_I) | <1948 / other | Start | none (0) | -; further explanation neededx1, clarification neededx1 | 4 | - | 10.89 (75) | 11 / 8 / 2 / 1 | 7 | no |
| 14 | [battle-of-lule-burgas](https://en.wikipedia.org/wiki/Battle_of_Lule_Burgas) | <1948 / other | Start | edit=autoconfirmed (4) | Unreferenced section; - | 0 | - | 15.62 (8) | 82 / 34 / 55 / 35 | 13 | no |
| 15 | [armistice-of-mudanya](https://en.wikipedia.org/wiki/Armistice_of_Mudanya) | <1948 / other | Start | none (0) | -; - | 1 | - | 7.48 (3) | 5 / 5 / 0 / 0 | 26 | no |
| 16 | [jordanian-independence](https://en.wikipedia.org/wiki/History_of_Jordan) | <1948 / other | C | none (0) | More citations needed section, Unreferenced section; by whom?x1, which?x1, dubiousx1, dead linkx1 | 3 | - | 13.64 (138) | 14 / 13 / 0 / 0 | 33 | no |
| 17 | [iraqi-revolt-against-the-british](https://en.wikipedia.org/wiki/Iraqi_Revolt) | <1948 / other | C | none (0) | -; dubiousx1 | 0 | - | 17.38 (66) | 38 / 26 / 9 / 9 | 22 | no |
| 18 | [siege-of-medina](https://en.wikipedia.org/wiki/Siege_of_Medina) | <1948 / other | Start | none (3) | More citations needed; - | 0 | - | 6.4 (6) | 32 / 16 / 14 / 12 | 16 | no |
| 19 | [erzurum-offensive](https://en.wikipedia.org/wiki/Erzurum_offensive) | <1948 / other | C | none (0) | -; - | 0 | - | 12.42 (20) | 20 / 11 / 9 / 3 | 21 | no |
| 20 | [arab-revolt](https://en.wikipedia.org/wiki/Arab_Revolt) | <1948 / other | C | none (0) | -; - | 0 | - | 17.96 (123) | 68 / 53 / 13 / 12 | 55 | no |
| 21 | [halabja-massacre](https://en.wikipedia.org/wiki/Halabja_massacre) | 1948-1990 / kurdish-conflicts | C | edit=autoconfirmed (1) | -; - | 2 | yes | 15.52 (78) | 21 / 10 / 0 / 0 | 35 | no |
| 22 | [united-arab-republic](https://en.wikipedia.org/wiki/United_Arab_Republic) | 1948-1990 / egypt-sinai | C | none (0) | -; - | 2 | arab-israeli,arbpia | 13.09 (41) | 74 / 51 / 12 / 9 | 79 | no |
| 23 | [h-3-airstrike](https://en.wikipedia.org/wiki/H-3_airstrike) | 1948-1990 / iran-iraq-gulf | C | none (0) | -; permanent dead linkx1 | 1 | - | 11.04 (16) | 21 / 13 / 9 / 3 | 12 | no |
| 24 | [1958-lebanon-crisis](https://en.wikipedia.org/wiki/1958_Lebanon_crisis) | 1948-1990 / lebanon | Start | none (0) | More citations needed section; - | 0 | - | 16.6 (48) | 43 / 29 / 14 / 8 | 24 | no |
| 25 | [karantina-massacre](https://en.wikipedia.org/wiki/Karantina_massacre) | 1948-1990 / armenian-genocide/Armenia | Stub | none (1) | -; - | 0 | - | 50.75 (17) | 63 / 37 / 16 / 14 | 11 | no |
| 26 | [al-dawayima-massacre](https://en.wikipedia.org/wiki/Al-Dawayima_massacre) | 1948-1990 / israeli-palestinian | B | edit=extendedconfirmed (1) | -; - | 0 | yes | 9.85 (20) | 6 / 6 / 0 / 0 | 9 | no |
| 27 | [al-anfal-campaign](https://en.wikipedia.org/wiki/Anfal_campaign) | 1948-1990 / kurdish-conflicts | B | edit=extendedconfirmed (1) | -; better source neededx1, dubiousx1 | 1 | kurd | 18.64 (67) | 38 / 19 / 1 / 1 | 38 | no |
| 28 | [iran-hostage-crisis](https://en.wikipedia.org/wiki/Iran_hostage_crisis) | 1948-1990 / egypt-sinai | B | none (1) | -; better source neededx1, page neededx1, isbn missingx1 | 0 | irp | 19.54 (196) | 83 / 56 / 22 / 15 | 44 | no |
| 29 | [battle-of-khorramshahr-1982](https://en.wikipedia.org/wiki/Battle_of_Khorramshahr_(1982)) | 1948-1990 / iran-iraq-gulf | C | none (0) | -; - | 0 | - | 24.65 (14) | 10 / 5 / 0 / 0 | 12 | no |
| 30 | [1983-beirut-barracks-bombings](https://en.wikipedia.org/wiki/1983_Beirut_barracks_bombings) | 1948-1990 / lebanon | B | none (0) | -; dead linkx1 | 1 | - | 21.68 (172) | 50 / 35 / 11 / 8 | 26 | no |
| 31 | [ankara-esenboga-airport-attack](https://en.wikipedia.org/wiki/Ankara_Esenbo%C4%9Fa_Airport_attack) | 1948-1990 / armenian-genocide/Armenia | Start | none (0) | Unreferenced section; - | 2 | - | 21.87 (18) | 4 / 1 / 0 / 0 | 9 | no |
| 32 | [kfar-etzion-massacre](https://en.wikipedia.org/wiki/Kfar_Etzion_massacre) | 1948-1990 / israeli-palestinian | C | edit=extendedconfirmed (1) | More citations needed section; - | 1 | arab-israeli | 15.64 (40) | 14 / 6 / 0 / 0 | 10 | no |
| 33 | [grand-mosque-seizure](https://en.wikipedia.org/wiki/Grand_Mosque_seizure) | 1948-1990 / other | C | none (0) | -; page neededx1 | 2 | - | 20.56 (54) | 61 / 45 / 22 / 13 | 35 | no |
| 34 | [siege-of-basra](https://en.wikipedia.org/wiki/Siege_of_Basra) | 1948-1990 / other | C | none (0) | -; - | 2 | - | 15.32 (14) | 12 / 11 / 2 / 2 | 12 | no |
| 35 | [siege-of-abadan](https://en.wikipedia.org/wiki/Siege_of_Abadan) | 1948-1990 / other | C | none (0) | More citations needed; - | 1 | - | 14.94 (13) | 5 / 4 / 0 / 0 | 14 | no |
| 36 | [saddam-hussein](https://en.wikipedia.org/wiki/Saddam_Hussein) | 1948-1990 / other | B | edit=autoconfirmed (33) | Tone; attribution neededx1, new archival link neededx1, dead linkx1 | 0 | - | 21.31 (286) | 246 / 113 / 44 / 38 | 135 | YES (sim 0.42) |
| 37 | [north-yemen-civil-war](https://en.wikipedia.org/wiki/North_Yemen_civil_war) | 1948-1990 / other | A | none (0) | -; isbn missingx1 | 0 | - | 11.62 (146) | 76 / 21 / 2 / 2 | 32 | no |
| 38 | [operation-eagle-claw](https://en.wikipedia.org/wiki/Operation_Eagle_Claw) | 1948-1990 / other | B | none (0) | -; - | 2 | - | 21.37 (99) | 75 / 49 / 18 / 6 | 27 | no |
| 39 | [1982-hama-massacre](https://en.wikipedia.org/wiki/1982_Hama_massacre) | 1948-1990 / other | B | none (2) | -; - | 0 | - | 22.43 (66) | 46 / 33 / 8 / 4 | 34 | no |
| 40 | [baghdad-pact](https://en.wikipedia.org/wiki/Central_Treaty_Organization) | 1948-1990 / other | C | none (0) | -; - | 0 | - | 15.65 (31) | 19 / 14 / 0 / 0 | 48 | no |
| 41 | [2009-khan-el-khalili-bombing](https://en.wikipedia.org/wiki/2009_Khan_el-Khalili_bombing) | 1991-2010 / egypt-sinai | Start | none (0) | -; dead linkx1 | 0 | - | 22.01 (7) | 0 / 0 / 0 / 0 | 8 | no |
| 42 | [battle-of-73-easting](https://en.wikipedia.org/wiki/Battle_of_73_Easting) | 1991-2010 / iran-iraq-gulf | Start | none (0) | -; - | 7 | - | 8.73 (51) | 18 / 15 / 1 / 1 | 11 | no |
| 43 | [qana-massacre](https://en.wikipedia.org/wiki/Qana_massacre) | 1991-2010 / israeli-palestinian | B | edit=extendedconfirmed (2) | -; dead linkx1 | 3 | arab-israeli,arbpia | 12.1 (42) | 14 / 9 / 0 / 0 | 13 | no |
| 44 | [operation-viking-hammer](https://en.wikipedia.org/wiki/Operation_Viking_Hammer) | 1991-2010 / kurdish-conflicts | unassessed | none (0) | -; - | 0 | - | 19.78 (20) | 9 / 8 / 1 / 1 | 9 | no |
| 45 | [assassination-of-rafic-hariri](https://en.wikipedia.org/wiki/Assassination_of_Rafic_Hariri) | 1991-2010 / lebanon | C | none (0) | -; when?x1 | 4 | - | 24.51 (72) | 13 / 11 / 1 / 1 | 11 | no |
| 46 | [assassination-of-hrant-dink](https://en.wikipedia.org/wiki/Assassination_of_Hrant_Dink) | 1991-2010 / armenian-genocide/Armenia | C | none (0) | More citations needed; - | 5 | - | 18.1 (97) | 7 / 6 / 0 / 0 | 9 | no |
| 47 | [2004-sinai-bombings](https://en.wikipedia.org/wiki/2004_Sinai_bombings) | 1991-2010 / egypt-sinai | Start | edit=extendedconfirmed (1) | -; - | 1 | arab-israeli,arbpia | 18.81 (12) | 11 / 5 / 0 / 0 | 8 | no |
| 48 | [arab-spring](https://en.wikipedia.org/wiki/Arab_Spring) | 1991-2010 / iran-iraq-gulf | B | none (5) | -; clarification neededx2, failed verificationx1, dead linkx1 | 2 | scwisil | 34.31 (400) | 142 / 94 / 30 / 22 | 97 | no |
| 49 | [siege-of-the-church-of-the-nativity](https://en.wikipedia.org/wiki/Siege_of_the_Church_of_the_Nativity) | 1991-2010 / israeli-palestinian | B | edit=extendedconfirmed (1) | -; dead linkx2 | 0 | arab-israeli | 15.02 (34) | 4 / 4 / 0 / 0 | 8 | no |
| 50 | [cedar-revolution](https://en.wikipedia.org/wiki/Cedar_Revolution) | 1991-2010 / lebanon | B | none (0) | More citations needed section; dead linkx2 | 3 | - | 14.04 (62) | 68 / 32 / 22 / 14 | 26 | no |
| 51 | [2005-sharm-el-sheikh-bombings](https://en.wikipedia.org/wiki/2005_Sharm_El_Sheikh_bombings) | 1991-2010 / egypt-sinai | Start | none (0) | More citations needed, Unreferenced section; dead linkx1 | 1 | - | 12.93 (9) | 5 / 5 / 1 / 1 | 14 | no |
| 52 | [battle-of-medina-ridge](https://en.wikipedia.org/wiki/Battle_of_Medina_Ridge) | 1991-2010 / iran-iraq-gulf | C | none (0) | Promotional; - | 0 | - | 7.83 (25) | 70 / 55 / 6 / 6 | 9 | no |
| 53 | [sivas-massacre](https://en.wikipedia.org/wiki/Sivas_massacre) | 1991-2010 / other | Start | none (0) | -; permanent dead linkx1 | 0 | - | 21.46 (23) | 6 / 5 / 1 / 1 | 18 | no |
| 54 | [iranian-green-movement](https://en.wikipedia.org/wiki/Iranian_Green_Movement) | 1991-2010 / other | B | none (0) | -; dead linkx2 | 1 | - | 27.09 (74) | 24 / 13 / 6 / 5 | 12 | YES (sim 0.97) |
| 55 | [first-battle-of-fallujah](https://en.wikipedia.org/wiki/First_Battle_of_Fallujah) | 1991-2010 / other | Start | none (5) | Unreferenced section; tonex1, specifyx1, dead linkx1 | 3 | - | 16.66 (57) | 58 / 40 / 15 / 8 | 23 | no |
| 56 | [mahmudiyah-rape-and-murders](https://en.wikipedia.org/wiki/Mahmudiyah_rape_and_murders) | 1991-2010 / other | C | none (0) | -; dead linkx1 | 0 | - | 16.89 (66) | 51 / 37 / 1 / 1 | 17 | no |
| 57 | [iraqi-insurgency-2003-2011](https://en.wikipedia.org/wiki/Iraqi_insurgency_(2003%E2%80%932011)) | 1991-2010 / other | C | none (1) | More citations needed; needs updatex13, better source neededx1, clarification neededx3, when?x1, dead linkx4 | 7 | - | 14.25 (125) | 105 / 61 / 30 / 26 | 25 | no |
| 58 | [2010-baghdad-church-siege](https://en.wikipedia.org/wiki/2010_Baghdad_church_siege) | 1991-2010 / other | C | none (0) | -; dead linkx1 | 1 | - | 14.29 (42) | 15 / 6 / 0 / 0 | 11 | no |
| 59 | [invasion-of-iraq](https://en.wikipedia.org/wiki/2003_invasion_of_Iraq) | 1991-2010 / other | B | none (12) | -; clarification neededx1, page neededx1 | 10 | - | 15.09 (343) | 170 / 97 / 35 / 29 | 46 | no |
| 60 | [execution-of-saddam-hussein](https://en.wikipedia.org/wiki/Execution_of_Saddam_Hussein) | 1991-2010 / other | B | none (15) | -; permanent dead linkx1 | 0 | - | 23.52 (57) | 47 / 35 / 7 / 6 | 22 | no |
| 61 | [2016-besiktas-bombings](https://en.wikipedia.org/wiki/2016_Be%C5%9Fikta%C5%9F_bombings) | 2011+ / kurdish-conflicts | C | none (0) | -; - | 0 | - | 17.54 (35) | 7 / 3 / 0 / 0 | 25 | no |
| 62 | [2015-kuwait-mosque-bombing](https://en.wikipedia.org/wiki/2015_Kuwait_mosque_bombing) | 2011+ / iran-iraq-gulf | C | none (0) | -; - | 1 | - | 27.29 (91) | 14 / 9 / 0 / 0 | 18 | no |
| 63 | [majdal-shams-attack](https://en.wikipedia.org/wiki/Majdal_Shams_attack) | 2011+ / syrian-war | Start | edit=extendedconfirmed (1) | -; - | 0 | arab-israeli | 26.71 (98) | 17 / 9 / 0 / 0 | 11 | no |
| 64 | [2015-beirut-bombings](https://en.wikipedia.org/wiki/2015_Beirut_bombings) | 2011+ / lebanon | C | none (1) | -; - | 11 | scwisil | 21.45 (26) | 14 / 4 / 0 / 0 | 28 | no |
| 65 | [march-2016-istanbul-bombing](https://en.wikipedia.org/wiki/March_2016_Istanbul_bombing) | 2011+ / israeli-palestinian | C | none (0) | -; dead linkx1 | 0 | - | 35.21 (30) | 5 / 2 / 0 / 0 | 22 | no |
| 66 | [egyptian-crisis-2011-2014](https://en.wikipedia.org/wiki/Egyptian_Crisis_(2011%E2%80%932014)) | 2011+ / egypt-sinai | C | none (0) | -; permanent dead linkx1 | 0 | - | 26.73 (85) | 8 / 7 / 0 / 0 | 9 | no |
| 67 | [february-2016-ankara-bombing](https://en.wikipedia.org/wiki/February_2016_Ankara_bombing) | 2011+ / kurdish-conflicts | Start | none (1) | -; dead linkx1 | 1 | - | 43.59 (51) | 5 / 2 / 0 / 0 | 28 | no |
| 68 | [israel-united-arab-emirates-normalization-agreement](https://en.wikipedia.org/wiki/Israel%E2%80%93United_Arab_Emirates_normalization_agreement) | 2011+ / iran-iraq-gulf | C | edit=extendedconfirmed (1) | -; - | 0 | arab-israeli | 24.92 (173) | 28 / 5 / 0 / 0 | 25 | no |
| 69 | [siege-of-talkalakh-may-2011](https://en.wikipedia.org/wiki/Siege_of_Talkalakh_(May_2011)) | 2011+ / syrian-war | Start | none (0) | -; - | 0 | - | 47.34 (8) | 7 / 5 / 0 / 0 | 9 | no |
| 70 | [2020-beirut-explosion](https://en.wikipedia.org/wiki/2020_Beirut_explosion) | 2011+ / lebanon | B | edit=extendedconfirmed (2) | -; dead linkx1 | 0 | arab-israeli | 57.06 (365) | 54 / 35 / 0 / 0 | 80 | no |
| 71 | [rafah-paramedic-massacre](https://en.wikipedia.org/wiki/Rafah_paramedic_massacre) | 2011+ / israeli-palestinian | C | edit=extendedconfirmed (1) | -; - | 0 | arab-israeli,arbpia | 12.15 (35) | 31 / 17 / 0 / 0 | 9 | no |
| 72 | [rabaa-massacre](https://en.wikipedia.org/wiki/Rabaa_massacre) | 2011+ / egypt-sinai | B | none (0) | -; - | 0 | - | 15.6 (147) | 15 / 12 / 2 / 2 | 16 | no |
| 73 | [2020-aden-airport-attack](https://en.wikipedia.org/wiki/2020_Aden_airport_attack) | 2011+ / other | C | none (0) | -; clarification neededx1 | 0 | - | 35.65 (116) | 4 / 3 / 0 / 0 | 16 | no |
| 74 | [yemeni-revolution](https://en.wikipedia.org/wiki/Yemeni_revolution) | 2011+ / other | C | none (2) | -; when?x1, dead linkx3 | 2 | - | 29.91 (178) | 48 / 23 / 3 / 2 | 38 | no |
| 75 | [battle-of-mosul-2016-2017](https://en.wikipedia.org/wiki/Battle_of_Mosul_(2016%E2%80%932017)) | 2011+ / other | B | none (0) | -; non-primary source neededx4, permanent dead linkx1 | 1 | scwisil | 38.64 (449) | 68 / 39 / 16 / 14 | 35 | no |
| 76 | [killing-of-jamal-khashoggi](https://en.wikipedia.org/wiki/Assassination_of_Jamal_Khashoggi) | 2011+ / other | B | none (0) | -; - | 0 | blp | 26.07 (246) | 35 / 31 / 2 / 2 | 13 | no |
| 77 | [istanbul-nightclub-shooting](https://en.wikipedia.org/wiki/Istanbul_nightclub_shooting) | 2011+ / other | C | none (0) | -; - | 1 | - | 57.8 (70) | 36 / 20 / 6 / 5 | 46 | no |
| 78 | [united-states-withdrawal-from-the-joint-comprehensive-plan-of-action](https://en.wikipedia.org/wiki/United_States_withdrawal_from_the_Iran_nuclear_deal) | 2011+ / other | B | none (0) | -; - | 0 | ap | 30.75 (120) | 35 / 22 / 1 / 1 | 10 | no |
| 79 | [joint-comprehensive-plan-of-action](https://en.wikipedia.org/wiki/Iran_nuclear_deal) | 2011+ / other | B | none (0) | -; who?x1, dead linkx2 | 1 | - | 45.74 (444) | 170 / 69 / 23 / 12 | 35 | no |
| 80 | [houthi-insurgency](https://en.wikipedia.org/wiki/Houthi_insurgency) | 2011+ / other | B | none (0) | -; dead linkx2, permanent dead linkx2 | 24 | - | 25.89 (165) | 25 / 17 / 0 / 0 | 25 | no |

## 5. Events with the most combined signals

All 18 events with a score >= 3 (a cut at 15 would split a tie at 3, so I list all tied entries; order within a score is by later-reverted edits).
Scores and the exact components are in `scores.json`. **These are the pages where Wikipedia's own records show the most recent editorial friction or
maintenance flags; that is a reason to read them first, not a finding about their content.**

| rank | score | event | signals (points) | evidence links |
|---|---|---|---|---|
| 1 | 7 | Saddam Hussein | neutrality/dispute banner or category (+3); currently edit-protected (+1); protection log >=5 events (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+2) | [article](https://en.wikipedia.org/wiki/Saddam_Hussein), [talk](https://en.wikipedia.org/wiki/Talk:Saddam_Hussein), [history](https://en.wikipedia.org/w/index.php?title=Saddam_Hussein&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Saddam_Hussein) |
| 2 | 5 | Battle of Lule Burgas | sourcing banner (more citations/unreferenced/primary) (+1); currently edit-protected (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+2); assessed Stub/Start (+1) | [article](https://en.wikipedia.org/wiki/Battle_of_Lule_Burgas), [talk](https://en.wikipedia.org/wiki/Talk:Battle_of_Lule_Burgas), [history](https://en.wikipedia.org/w/index.php?title=Battle_of_Lule_Burgas&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Battle_of_Lule_Burgas) |
| 3 | 5 | 2003 invasion of Iraq | citation-needed count (>=5:+1, >=10:+2) (+2); protection log >=5 events (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+2) | [article](https://en.wikipedia.org/wiki/2003_invasion_of_Iraq), [talk](https://en.wikipedia.org/wiki/Talk:2003_invasion_of_Iraq), [history](https://en.wikipedia.org/w/index.php?title=2003_invasion_of_Iraq&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=2003_invasion_of_Iraq) |
| 4 | 5 | Arab Spring | inline dispute/reliability tags (>=1:+1, >=5:+2) (+1); contentious-topic/GS notice on talk (+1); protection log >=5 events (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+2) | [article](https://en.wikipedia.org/wiki/Arab_Spring), [talk](https://en.wikipedia.org/wiki/Talk:Arab_Spring), [history](https://en.wikipedia.org/w/index.php?title=Arab_Spring&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Arab_Spring) |
| 5 | 5 | Iraqi insurgency (2003–2011) | inline dispute/reliability tags (>=1:+1, >=5:+2) (+1); citation-needed count (>=5:+1, >=10:+2) (+1); sourcing banner (more citations/unreferenced/primary) (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+2) | [article](https://en.wikipedia.org/wiki/Iraqi_insurgency_(2003%E2%80%932011)), [talk](https://en.wikipedia.org/wiki/Talk:Iraqi_insurgency_(2003%E2%80%932011)), [history](https://en.wikipedia.org/w/index.php?title=Iraqi_insurgency_(2003%E2%80%932011)&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Iraqi_insurgency_(2003%E2%80%932011)) |
| 6 | 5 | First Battle of Fallujah | inline dispute/reliability tags (>=1:+1, >=5:+2) (+1); sourcing banner (more citations/unreferenced/primary) (+1); protection log >=5 events (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+1); assessed Stub/Start (+1) | [article](https://en.wikipedia.org/wiki/First_Battle_of_Fallujah), [talk](https://en.wikipedia.org/wiki/Talk:First_Battle_of_Fallujah), [history](https://en.wikipedia.org/w/index.php?title=First_Battle_of_Fallujah&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=First_Battle_of_Fallujah) |
| 7 | 5 | 1929 Palestine riots | inline dispute/reliability tags (>=1:+1, >=5:+2) (+2); contentious-topic/GS notice on talk (+1); currently edit-protected (+1); cites a WP-listed deprecated/unreliable host (+1) | [article](https://en.wikipedia.org/wiki/1929_Palestine_riots), [talk](https://en.wikipedia.org/wiki/Talk:1929_Palestine_riots), [history](https://en.wikipedia.org/w/index.php?title=1929_Palestine_riots&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=1929_Palestine_riots) |
| 8 | 4 | Siege of Medina | sourcing banner (more citations/unreferenced/primary) (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+1); assessed Stub/Start (+1); refs per 1000 words < 8 (+1) | [article](https://en.wikipedia.org/wiki/Siege_of_Medina), [talk](https://en.wikipedia.org/wiki/Talk:Siege_of_Medina), [history](https://en.wikipedia.org/w/index.php?title=Siege_of_Medina&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Siege_of_Medina) |
| 9 | 4 | Battle of Medina Ridge | neutrality/dispute banner or category (+3); refs per 1000 words < 8 (+1) | [article](https://en.wikipedia.org/wiki/Battle_of_Medina_Ridge), [talk](https://en.wikipedia.org/wiki/Talk:Battle_of_Medina_Ridge), [history](https://en.wikipedia.org/w/index.php?title=Battle_of_Medina_Ridge&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Battle_of_Medina_Ridge) |
| 10 | 3 | Iran hostage crisis | inline dispute/reliability tags (>=1:+1, >=5:+2) (+1); contentious-topic/GS notice on talk (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+1) | [article](https://en.wikipedia.org/wiki/Iran_hostage_crisis), [talk](https://en.wikipedia.org/wiki/Talk:Iran_hostage_crisis), [history](https://en.wikipedia.org/w/index.php?title=Iran_hostage_crisis&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Iran_hostage_crisis) |
| 11 | 3 | Battle of Mosul (2016–2017) | inline dispute/reliability tags (>=1:+1, >=5:+2) (+1); contentious-topic/GS notice on talk (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+1) | [article](https://en.wikipedia.org/wiki/Battle_of_Mosul_(2016%E2%80%932017)), [talk](https://en.wikipedia.org/wiki/Talk:Battle_of_Mosul_(2016%E2%80%932017)), [history](https://en.wikipedia.org/w/index.php?title=Battle_of_Mosul_(2016%E2%80%932017)&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Battle_of_Mosul_(2016%E2%80%932017)) |
| 12 | 3 | 1958 Lebanon crisis | sourcing banner (more citations/unreferenced/primary) (+1); edits later reverted in 12m (>=10:+1, >=25:+2) (+1); assessed Stub/Start (+1) | [article](https://en.wikipedia.org/wiki/1958_Lebanon_crisis), [talk](https://en.wikipedia.org/wiki/Talk:1958_Lebanon_crisis), [history](https://en.wikipedia.org/w/index.php?title=1958_Lebanon_crisis&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=1958_Lebanon_crisis) |
| 13 | 3 | Sykes–Picot Agreement | sourcing banner (more citations/unreferenced/primary) (+1); contentious-topic/GS notice on talk (+1); currently edit-protected (+1) | [article](https://en.wikipedia.org/wiki/Sykes%E2%80%93Picot_Agreement), [talk](https://en.wikipedia.org/wiki/Talk:Sykes%E2%80%93Picot_Agreement), [history](https://en.wikipedia.org/w/index.php?title=Sykes%E2%80%93Picot_Agreement&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Sykes%E2%80%93Picot_Agreement) |
| 14 | 3 | Anfal campaign | inline dispute/reliability tags (>=1:+1, >=5:+2) (+1); contentious-topic/GS notice on talk (+1); currently edit-protected (+1) | [article](https://en.wikipedia.org/wiki/Anfal_campaign), [talk](https://en.wikipedia.org/wiki/Talk:Anfal_campaign), [history](https://en.wikipedia.org/w/index.php?title=Anfal_campaign&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Anfal_campaign) |
| 15 | 3 | Kfar Etzion massacre | sourcing banner (more citations/unreferenced/primary) (+1); contentious-topic/GS notice on talk (+1); currently edit-protected (+1) | [article](https://en.wikipedia.org/wiki/Kfar_Etzion_massacre), [talk](https://en.wikipedia.org/wiki/Talk:Kfar_Etzion_massacre), [history](https://en.wikipedia.org/w/index.php?title=Kfar_Etzion_massacre&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Kfar_Etzion_massacre) |
| 16 | 3 | 2004 Sinai bombings | contentious-topic/GS notice on talk (+1); currently edit-protected (+1); assessed Stub/Start (+1) | [article](https://en.wikipedia.org/wiki/2004_Sinai_bombings), [talk](https://en.wikipedia.org/wiki/Talk:2004_Sinai_bombings), [history](https://en.wikipedia.org/w/index.php?title=2004_Sinai_bombings&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=2004_Sinai_bombings) |
| 17 | 3 | Majdal Shams attack | contentious-topic/GS notice on talk (+1); currently edit-protected (+1); assessed Stub/Start (+1) | [article](https://en.wikipedia.org/wiki/Majdal_Shams_attack), [talk](https://en.wikipedia.org/wiki/Talk:Majdal_Shams_attack), [history](https://en.wikipedia.org/w/index.php?title=Majdal_Shams_attack&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=Majdal_Shams_attack) |
| 18 | 3 | 2015 Beirut bombings | citation-needed count (>=5:+1, >=10:+2) (+2); contentious-topic/GS notice on talk (+1) | [article](https://en.wikipedia.org/wiki/2015_Beirut_bombings), [talk](https://en.wikipedia.org/wiki/Talk:2015_Beirut_bombings), [history](https://en.wikipedia.org/w/index.php?title=2015_Beirut_bombings&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page=2015_Beirut_bombings) |

**Suggested reading order for a human** (my judgement about where evidence-of-friction and stakes coincide; not a finding of bias):

1. **Saddam Hussein**: the only page with a Tone banner, an "AI-generated" banner, 246 edits/113 editors in a year, 33 protection-log entries, and a lead that
   *changed* after our retrieval (compare `leads-comparison.md`; our site still displays the "right-wing variant of Ba'athism" sentence that live Wikipedia no longer has in its lead).
2. **Battle of Lule Burgas**: 55 of 82 edits reverted in a year, page semi-protected for sockpuppetry, Start-class with a low-quality sourcing banner. Low-profile page, high revert rate; worth seeing what the fight is about.
3. **2003 invasion of Iraq, Iraqi insurgency 2003-2011, First Battle of Fallujah**: high revert counts, `citation needed`/inline reliability tags, long histories of protection.
4. **1929 Palestine riots**: extended-confirmed protected; ARBPIA notice; four "unreliable source?" and six "non-primary source needed" inline tags; cites Jewish Virtual Library (Wikipedia: "partisan ... mostly unreliable").
5. **Arab Spring**: move-protected (sysop) but not edit-protected; Syria/Iraq general-sanctions notice on talk; 15 talk archive pages; 30 of 142 edits later reverted; 5 protection-log entries.
6. **Battle of Medina Ridge**: the only lead-area "Promotional" banner.
7. Every **ARBPIA / Kurdish** CT-notice page regardless of score, because a CT notice is Wikipedia's own statement that the topic is contested: Al-Dawayima massacre and Halabja massacre (page-specific restriction notices), Kfar Etzion massacre, Qana massacre, Majdal Shams attack, Rafah paramedic massacre, 2004 Sinai bombings, Israel-UAE normalization agreement, Zilan massacre, Anfal campaign.
8. Articles citing hosts on a Wikipedia deprecated/unreliable list: 1929 Palestine riots (Jewish Virtual Library) and March 2016 Istanbul bombing (Tasnim, deprecated 2024). Articles citing many hosts from *my own* state-affiliated/advocacy bucket (not a Wikipedia judgement): Battle of Mosul 2016-2017 (23 references), 2015 Kuwait mosque bombing (18, mostly Kuna, the Kuwaiti state news agency), Israel-UAE normalization agreement (14), JCPOA (11, including Fars), Majdal Shams attack (9), 2020 Beirut explosion (9). Hosts alone say nothing about whether a particular claim is problematic; state agencies are often the primary source for official statements.

## 6. Limits and how to read this

- **Wikipedia's labels reflect its editors' biases too.** Which pages get NPOV tags, CT notices, protection or an "A/B/C" class depends on who is watching and
  who is willing to tag. Topic-area editors themselves are demographically skewed; disagreement with a majority view tends to be tagged, majority-shared bias tends not to be.
- **Absence of tags is not evidence of neutrality.** 0/80 POV banners does not mean 80 neutral articles; it means nobody currently has a tag on them. An article dominated by one narrative and
  patrolled by like-minded editors would show no tags.
- **Tags decay.** Neutrality banners are frequently removed without the underlying dispute being resolved, and my snapshot cannot see removed tags. A history-level scan (search all revisions for added/removed
  POV templates) would be more sensitive and was not done.
- **Attention is confounded with defect.** Revert counts, editors and protection rise with page views and news events. Reverted edits include ordinary vandalism. I did not separate bots, vandalism and content disputes.
- **Sample size.** 80 of 394; strata are tiny; the topic labels are my keyword heuristic; the sampling design intentionally distorts topic proportions (equal slots per topic). Rates are not population estimates for the whole dataset.
- **Lead comparison** tests only that our stored extract equals the current summary text (REST `page/summary`); it says nothing about whether the lead is balanced.
- **Not measured at all:** factual accuracy; whether claims match cited sources; omission or framing bias in text; image/caption bias; non-English Wikipedias' treatment of the same event (only the count of editions); page views; talk page content; the
  reliability of individual books/papers; ORES/LiftWing quality predictions; NPOV noticeboard threads; arbitration cases naming specific pages.
- Verification: five articles were re-queried from scratch through independent routes (`scripts/04_verify.py`): edits in window and reverted-tag counts, protection state
  matched exactly for Saddam Hussein (246/44), Lule Burgas (82/55), 2015 Beirut bombings (14/0), 2003 invasion of Iraq (170/35), Houthi insurgency (25/0);
  language counts matched Wikidata to within 0-2 editions; citation-needed counts matched wikitext-regex counts (24 and 11).
