# Import verification sample

Generated 2026-09-26T13:25:03.360Z by `node scripts/lib/verify-sample.js`.

**Method.** A random sample of 40 of the 284 events in `data/events.proposed.json`, drawn with a seeded
Mulberry32 shuffle (seed `20260926`; re-running with the same seed and the same proposed file selects the same events).
Each was re-fetched live (Wikipedia REST summary; Wikidata SPARQL for dates P585/P580/P582, coordinates P625, countries via
P17 / P276->P17 / P131->P17, and event class via P31/P279*) and compared field by field with what we hold.
Comparison is exact (coordinates to 1e-4 degrees; dates by day; countries as sets).

**Caveat.** Wikipedia and Wikidata are live, and our copy has a `retrieved_at` timestamp. A mismatch is either a copy error or
an upstream edit since retrieval; this report shows both values so you can judge. The `category` check verifies our label is
one of the item's Wikidata classes, and the `countries` check re-runs discovery's own 3-path location rule.

## Result

- Events checked: 40 (0 could not be checked because of errors)
- Events with at least one field mismatch: **1 of 40 (2.5%)**
- Field comparisons: 360; mismatching: **1 (0.3%)**

| Field | Checked | Mismatched | Rate |
|---|---|---|---|
| title | 40 | 1 | 2.5% |
| extract | 40 | 0 | 0.0% |
| wikipedia_url | 40 | 0 | 0.0% |
| wikidata_qid | 40 | 0 | 0.0% |
| date_start | 40 | 0 | 0.0% |
| date_end | 40 | 0 | 0.0% |
| countries | 40 | 0 | 0.0% |
| category | 40 | 0 | 0.0% |
| coordinates | 40 | 0 | 0.0% |

## Mismatch details

### Ein HaShlosha massacre (Q123027684, retrieved 2026-09-26T13:19:25.017Z)
- **title**
  - ours: `Ein HaShlosha massacre`
  - live: `October 7 attacks`

## Events in the sample

- Siege of Hama (2011) (Q3139131) - all fields match
- Landing at Anzac Cove (Q2624963) - all fields match
- Qibya massacre (Q1139615) - all fields match
- Second Battle of El Alamein (Q153376) - all fields match
- Canal Hotel bombing (Q4116108) - all fields match
- Assassination of Ali Larijani (Q138715235) - all fields match
- Capture of Mecca (1924) (Q4871705) - all fields match
- Battle of Bulair (Q842670) - all fields match
- Zikim attack (Q123014721) - all fields match
- Battle of Sarikamish (Q250652) - all fields match
- Kfar Aza massacre (Q123003698) - all fields match
- 2024 Kerman bombings (Q124098799) - all fields match
- King David Hotel bombing (Q1814446) - all fields match
- Urfa resistance (Q4477441) - all fields match
- 2017 Aleppo suicide car bombing (Q29413569) - all fields match
- Siege of the Church of the Nativity (Q508006) - all fields match
- Operation Brevity (Q764714) - all fields match
- Battle of Holy Apostles Monastery (Q4871242) - all fields match
- Ankara Esenboğa Airport attack (Q2042386) - all fields match
- H-3 airstrike (Q1765847) - all fields match
- 2010 Baghdad church siege (Q569232) - all fields match
- Battle of Magdhaba (Q2889191) - all fields match
- Abu Ghraib torture and prisoner abuse (Q334720) - all fields match
- 2020 Aden airport attack (Q104585205) - all fields match
- Ein HaShlosha massacre (Q123027684) - mismatch: title
- 2014 Jerusalem synagogue attack (Q18551886) - all fields match
- Assassination of Ali Khamenei (Q138507700) - all fields match
- Battles of Latrun (1948) (Q2096397) - all fields match
- Camp Speicher massacre (Q17199280) - all fields match
- Kafr Qasim massacre (Q1642045) - all fields match
- Battle of Najaf (2003) (Q2068122) - all fields match
- Operation Halberd (Q3062545) - all fields match
- Siege of Adrianople (1912–1913) (Q2887868) - all fields match
- Battle of Basra (2008) (Q2888122) - all fields match
- Battle of Bitlis (Q2632850) - all fields match
- Houla massacre (Q1137013) - all fields match
- Battle of Haifa (1948) (Q4871178) - all fields match
- 2006 Israeli operation in Beit Hanoun (Q624389) - all fields match
- 2024 Hezbollah headquarters strike (Q130374882) - all fields match
- January 2016 Istanbul bombing (Q22039066) - all fields match
