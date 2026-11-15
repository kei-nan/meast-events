# Second, independent framing review (2026-11-15)

The published framing review ([docs/framing-review.md](../framing-review.md)) has one reviewer, Claude Opus 5.5, and its "Limits" section says so. To test that limit, a second model reviewed all 815 summaries again, with the same rules and without seeing the first review. **This is a proposal.** Nothing here is shown on the site or merged into `data/framing-review.json`.

## How it was done

- **Reviewer:** Claude Fable 5.2 (`claude-fable-5-2`), an AI model made by Anthropic, the same maker as the first reviewer. It ran as 16 parallel reviewers of about 51 summaries each.
- **Input:** each reviewer read only the rules (the sections "What it is and is not" through "Not judged" of docs/framing-review.md, as of 2026-11-15) and its batch of summaries: the exact texts shown on the site, matched by fingerprint. Reviewers were told not to open the repository, the first review or the web.
- **Output:** [`second-review/reviews.json`](second-review/reviews.json), in the same format as `data/framing-review.json`. A checker ([`check.mjs`](second-review/check.mjs)) confirmed for every batch that each event has one review, the fingerprints match, the guideline keys are valid and every highlighted phrase appears word for word in its text. (Both scripts ran in a working folder holding the batches as `in/batch-NN.json` and the outputs as `out/batch-NN.json`; they are kept here as a record of the checks, not as tools wired into the repo.)
- **One difference from the first review's conditions:** the task prompt listed what the fairness finding covers and named "important omissions (including a side's stated position that is left out)". That wording came from the 1948 labor-camp case of 2026-11-14 and may have made the second reviewer more ready to flag omissions. The prompt also asked the reviewer to apply the rules evenly to every side and said that "nothing found" is a normal result.
- **No web access:** the second reviewer had none, so a finding that names a left-out position or a disputed figure rests on its own knowledge. 42 of its notes say so.

## Results

Comparison by [`compare.mjs`](second-review/compare.mjs); every event and every difference is in [`second-review/comparison.json`](second-review/comparison.json). As in the published review, these are counts of findings only, never of which side a finding concerns.

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

16 of the 203 were drawn at random (seeded). A separate agent, Claude Opus 5.5 with web access, checked each one against the text and against outside sources: [`second-review/sample-verified.json`](second-review/sample-verified.json), with a source URL for each claim.

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

## If findings are adopted

Proposed rule: a finding found only by the second review goes into `data/framing-review.json` only after its outside claims are checked against sources, as the sample was, and corrected where needed. Its note then names its sources, as the 1948 labor-camp note does. Findings both reviews made need no change, and findings only the first review made are kept (existing rule).
