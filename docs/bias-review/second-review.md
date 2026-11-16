# Second, independent framing review (2026-11-15)

The framing review ([docs/framing-review.md](../framing-review.md)) was made by one reviewer, Claude Opus 5.5, and its "Limits" section said so. To test that limit, a second model reviewed all 815 summaries again, with the same rules and without seeing the first review. Its findings that the first review lacked were then checked one by one and, where they held up, added to the published review (see "Verification and merge" below).

**Raw data.** The working files are not kept in the repo: the second review, the comparison and the verification verdicts. Like any study record, they describe the summaries as they read on 2026-11-15, and Wikipedia's text changes. They are kept in git history at commit [65c0ecd](https://github.com/kei-nan/meast-events/tree/65c0ecd47db3e9c401c43da20da51722d7f63743/docs/bias-review/second-review) and linked below. What is published, including each new finding's sources, is in `data/framing-review.json`.

## How it was done

- **Reviewer:** Claude Fable 5.2 (`claude-fable-5-2`), an AI model made by Anthropic, the same maker as the first reviewer. It ran as 16 parallel reviewers of about 51 summaries each.
- **Input:** each reviewer read only the rules (the sections "What it is and is not" through "Not judged" of docs/framing-review.md, as of 2026-11-15) and its batch of summaries: the exact texts shown on the site, matched by fingerprint. Reviewers were told not to open the repository, the first review or the web.
- **Output:** `reviews.json` ([at commit 65c0ecd](https://github.com/kei-nan/meast-events/blob/65c0ecd47db3e9c401c43da20da51722d7f63743/docs/bias-review/second-review/reviews.json)), in the same format as `data/framing-review.json`. A checker script confirmed for every batch that each event has one review, the fingerprints match, the guideline keys are valid and every highlighted phrase appears word for word in its text. (The one-off scripts are [at commit 5fb88c7](https://github.com/kei-nan/meast-events/tree/5fb88c7c897bfbe04839b946f7cc5bc0cfcd1e6d/docs/bias-review/second-review).)
- **One difference from the first review's conditions:** the task prompt listed what the fairness finding covers and named "important omissions (including a side's stated position that is left out)". That wording came from the 1948 labor-camp case of 2026-11-14 and may have made the second reviewer more ready to flag omissions. The prompt also asked the reviewer to apply the rules evenly to every side and said that "nothing found" is a normal result.
- **No web access:** the second reviewer had none, so a finding that names a left-out position or a disputed figure rests on its own knowledge. 42 of its notes say so.

## Results

Every event and every difference is in `comparison.json` ([at commit 65c0ecd](https://github.com/kei-nan/meast-events/blob/65c0ecd47db3e9c401c43da20da51722d7f63743/docs/bias-review/second-review/comparison.json)). As in the published review, these are counts of findings only, never of which side a finding concerns.

| Overall fairness | Summaries |
|---|---|
| Both reviews found an issue | 96 |
| Only the first review | 13 |
| Only the second review | 203 |
| Neither | 503 |

The two agree on whether a summary has a fairness issue for 74% of summaries. Cohen's kappa, which discounts agreement expected by chance, is 0.34 ("fair"). Most of the difference is in one direction: the second review flags 299 summaries against the first review's 109, and it also flags 96 of the first review's 109.

| Wording check | First review | Second review | Same point in both |
|---|---|---|---|
| Contentious labels | 53 | 59 | 52 |
| Synonyms for "said" | 25 | 42 | 21 |
| Avoid stating opinions as facts | 13 | 20 | 8 |
| Editorializing | 15 | 52 | 13 |
| Expressions of doubt | 11 | 15 | 10 |
| Puffery | 1 | 5 | 1 |

The checks tied to named words (labels, doubt, "said") largely agree. The judgement-heavy ones (editorializing, opinions as facts, overall fairness) differ most.

**The 13 found only by the first review:**
- four 1917–18 battles "told entirely from the British side";
- Valley of Tears, told from the Israeli side;
- the Emirate of Transjordan's scare quotes, the Peel Commission, and Haifa Day;
- five 2023–24 entries: October 7 attacks, sexual violence on October 7, Hind Rajab, the Flour massacre, and al-Ahli hospital.

Under the existing rule (a first review's finding is kept when a later one finds nothing; docs/DECISIONS.md), these stay as they are.

**The 203 found only by the second review:** 87 are omissions (a side's stated position, a report's finding or a casualty figure left out) and 134 are claims stated as fact in Wikipedia's voice. A note can be both.

## Checking a sample

16 of the 203 were drawn at random (seeded). A separate agent, Claude Opus 5.5 with web access, checked each one against the text and against outside sources, with a source URL for each claim. The per-finding results are [at commit 5fb88c7](https://github.com/kei-nan/meast-events/blob/5fb88c7c897bfbe04839b946f7cc5bc0cfcd1e6d/docs/bias-review/second-review/sample-verified.json); all 16 were checked again in the full verification below.

| Grade | Findings |
|---|---|
| Accurate | 13 |
| Partly accurate | 3 |
| Wrong | 0 |
| Could not be verified | 0 |

The three partly accurate ones:
- **Battle of al-Faw (2003):** the note says the objectives are unattributed, but the text attributes them to the Coalition. Only the reasons that follow are in Wikipedia's own voice.
- **Deir Yassin massacre:** right that the Irgun/Lehi position, Begin's denial, is left out. But the text does mention armed resistance, and "some historians dispute" one specific episode is not supported by a source.
- **2014 kidnapping and murders of Israeli teenagers:** the note calls the operation "only a search", but the text reports the roughly 350 arrests. The omissions it names (Palestinians killed during the operation, Hamas's changing response) are real.

The checker rated the omitted point significant for 12 of the 16 and marginal for 4 (Qibya, Ghouta, Deir Yassin, Treaty of Ankara). That is its judgement.

16 is a small sample. It suggests the second review's extra findings are mostly accurate but that about one in five needs a correction before publication.

## What this shows

- **The first review flags less than a second careful reader would.** Of the 706 summaries with no fairness finding in the first review, the second review flags 203 (29%), and the sample check found most of those findings accurate.
- **The judgement-heavy checks are where reviewers differ.** The word-based checks reproduce well; overall fairness and editorializing do not. That is expected from the method, but this is the first measurement of it.
- **Both reviewers are Anthropic models.** This is a second model, not a second maker or a person. The [2026 Minab school attack](../framing-review.md#who-reviewed-it) disclosure (the summary names Claude as part of a US targeting system) applies to this review too.

## Verification and merge (2026-11-16)

The rule used: a finding only the second review made goes into `data/framing-review.json` only after it is checked against the summary, the rules and outside sources, and corrected where needed. Findings both reviews made were left as the first review wrote them. Findings only the first review made were kept (existing rule).

- **What was checked:** all 203 second-review-only fairness findings and all 88 second-review-only wording points, on 255 events, in 14 batches. The checker was Claude Opus 5.5 with web search. Each finding was kept as written, corrected, or dropped, with reasons and a source URL for every outside claim: `verification.json` ([at commit 65c0ecd](https://github.com/kei-nan/meast-events/blob/65c0ecd47db3e9c401c43da20da51722d7f63743/docs/bias-review/second-review/verification.json)). A checker script confirmed each batch's format and that every phrase appears word for word.

| | Kept as written | Kept, corrected | Dropped |
|---|---|---|---|
| Fairness findings | 43 | 133 | 27 |
| Wording points | 68 | | 20 |

- **Corrections:** mostly the kind the sample showed, where a note overstated what the text leaves out or misdescribed an attribution. Outside facts were narrowed to what a source supports, and the note names that source.
- **Drops:** the point was false, matched mainstream scholarship rather than one side's claim, repeated the published review, or fell outside the rules (names of other events, legal descriptions, words not on the lists).
- **Source sweep:** the cited sources were then reviewed for partisan or weak outlets.
  - Claims that only report what a party said may cite that party's own channel, such as TASS for Russia's foreign ministry, WAM for the UAE, or the Begin Center for the Irgun's account.
  - Three factual claims on partisan or weak sources were re-sourced: the Sabra and Shatila low estimates (now L'Orient-Le Jour, which also corrects "Lebanese police" to the Lebanese military prosecutor), Israel's Twelve-Day War toll (Reuters), and the Black Friday 1978 counts (Baghi's Martyrs Foundation tally and a 2025 Lund University study).
  - Two still rest on weaker outlets: Pakistan's IC 814 denial (World Socialist Web Site, 1999) and the Tel al-Zaatar estimates (The New Arab).
- **Merge:** the kept findings were added to `data/framing-review.json`, marked `second_review: true`, with `sources` on fairness findings that rely on outside facts. That is 176 fairness findings and 68 wording points on 221 events.
  - One event that shows another's article (Israeli invasion of the Gaza Strip) was given its source event's review, so that the two match word for word as the site requires.
  - One kept finding was corrected after the merge. The full check had kept the Battle of al-Faw (2003) note as written, but the earlier spot check had found it misstated an attribution: the summary attributes the objective to the Coalition, and only the reasoning is in Wikipedia's voice. It is the only finding on which the two checks contradicted each other.
  - The published counts are now 285 of 815 summaries with a fairness finding (was 109), 147 with a wording point (was 102), and 355 with either (was 187).
