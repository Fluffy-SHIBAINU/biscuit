# Biscuit: Kindred's reader (Meta's Glimmer 30B, trained on synthetic letters)

Day 3 of the hackathon build (October 28, 2026). Biscuit already read every letter twice, with Meta's Spark 1.3 and
with DeepSeek V4.1 Flash on Fireworks, and spoke only what both read the same way. This day adds a third reader that is
Kindred's own: Meta's open-weights Muse Glimmer 30B with a LoRA trained on letters Biscuit wrote for itself, scored
against the other two through Biscuit's own verifier, and seated in the shadow on Ana's page. It never speaks.

## 1. What was built

- `scripts/synth/letters.ts`, `photo.ts`, `render.ts`, `dataset.ts`: a synthetic letter generator. Seven templates
  (hospital statement, past-due notice, financial assistance decision, utility bill, advertisement, appointment
  reminder, lab results letter), real CMS hospital names and cities from `server/data/hospitals.json`, invented
  patients, amounts, dates, account numbers and 555-01xx phone numbers. Every page is rendered by headless Chromium
  as a phone would photograph it (tilt, tabletop, uneven light, two folds, sensor noise, JPEG quality 58 to 86), and
  the truth is built from the same values the page prints, so every quote is a verbatim line and the production
  verifier accepts all of them (`tests/synth.test.ts`). 600 letters train, 100 are held out, all from seed 1, so the
  set regenerates anywhere and nothing is checked in.
- `scripts/train/glimmer_sft.py`: LoRA SFT on Fireworks' Serverless Training API (rank 16, alpha 32, two epochs,
  learning rate 1e-4, batches of 8), two rows a letter under the production prompts and schema: transcribe the picture,
  then extract from the transcription. Base and tuned weights are scored on the held-out letters by in-session sampling
  with the same two-stage read, and the tuned adapter is promoted to a model on the account.
- `scripts/eval/readers.ts` and `score.ts`: every reader gets the same JPEG and the same two prompts; a fact counts as
  right only when its quote is verbatim in the reader's own transcription and its value agrees with the truth the way
  the agreement gate compares two readers. "Verified but wrong" is the number that matters: facts Biscuit would have
  spoken that the page does not say.
- The shadow seat (`server/routes/letter.ts`): `FIREWORKS_READER_SHADOW` names a model that reads beside the pair. The
  reply never waits for it; its outcome is logged after the reply as a `shadow_read` event and Ana's Readers strip
  shows it with how many of the spoken reader's facts it agreed on. Rosa hears nothing from it.
- Real documents for evaluation (`synth/real`, not checked in): five public sample documents, each hand-labelled with
  the same truth shape and listed by URL in section 3.

## 2. Blockers and rulings

- Dataset uploads are disabled on this Fireworks account ("dataset uploads are temporarily disabled, please contact
  Fireworks AI to get access"), so Managed SFT (the cookbook's easy path) is closed. Ruling: the Serverless Training
  API, which trains on rows rendered locally and streamed to the pooled trainer; nothing is uploaded, and the free
  Glimmer window (until November 30) covers it. Asking Fireworks to enable uploads is a two-line email the founder
  can send.
- The cookbook renderer is run from the clone through `PYTHONPATH`, with its public dependencies from PyPI, because
  installing the clone as a package was refused in this session.
- Muse Glimmer takes reasoning strength low, medium, high or xhigh and refuses none. Ruling: train and serve with
  "low", so the prompt the adapter learned is the prompt it will see (`reasoningFor` in `server/fireworks/spark.ts`).
- A letter picture is 3,888 image tokens at 1,500 by 2,000 pixels; the longest row is 4,321 tokens; max sequence 8,192.
- The pooled sampler takes text tokens plus one placeholder per image and the images as data URLs, and expands the
  placeholder itself. Keeping the renderer's `<|image_start|>` and `<|image_end|>` around the placeholder reads
  correctly (word overlap 1.0 with the printed page on the probe letter); that is the default.
- Base Glimmer, asked the production extraction prompt without constrained decoding, echoed the transcription instead
  of writing JSON on 90 of 100 letters: the prompt never spells the schema out, and production enforces it with
  `response_format`. The trained adapter learns the schema from the rows. The fair comparison for the base model is
  the production path on a deployment, with `response_format`; the in-session number is reported for what it is.
- Serving a trained LoRA as an addon needs a BF16 multi-LoRA shape, and the only one for Glimmer is a GB300 at $20 an
  hour. Ruling: the shadow seat deploys the promoted adapter as a merged model on the 1 by H200 BF16 shape at $8 an
  hour, minimum replicas 0, scale-to-zero after ten minutes idle (`scripts/train/deploy.py`). Asleep, it answers 503
  at once and Ana's strip says so; awake only for the demo and the judges.
- The deployment itself was refused by Fireworks: "payment method is required". On-demand deployments need a card on
  the account even with the hackathon credit. Until the founder adds one, Kindred's reader exists as a promoted model
  and an evaluation; the shadow seat code is live in production and waits for `FIREWORKS_READER_SHADOW`.

## 3. Data: synthetic, web, or both

The question was whether to gather real letters from the web or write them. The answer is both, for different jobs.

Synthetic letters are the training set because they are the only set that is private by construction (no real
patient's page ever leaves a phone or lands in a repository), labelled by construction (every quote is a printed line),
and reproducible from a seed. Their weakness is that they are regular: seven templates, one renderer. A model trained
on them learns the templates fast (the training loss reached zero in the first epoch), so the held-out set from the
same generator overstates how good it is in the wild.

Real documents are the evaluation set. Public sample statements and notices exist precisely so that people can learn to
read them, and they carry no patient: the Riverside Health System itemized statement published by Virginia's Criminal
Injuries Compensation Fund (scanned and redacted), the Western Reserve Hospital sample bill and sample statement from
its financial guide, and the Centers for Medicare & Medicaid Services' sample Part A Medicare Summary Notice. They are
read from their original pages, not redistributed, and each is labelled by hand in the same truth shape:

- https://cicf.state.va.us/sites/default/files/Documents/Sample-Itemized-Billing-Statement-Riverside.pdf
- https://www.westernreservehospital.org/media/80502/financial_guide-rev_cycle.pdf (pages 2 and 3, cropped)
- https://www.medicare.gov/media/document/summarynoticea.pdf (the page 1 and page 3 samples, cropped)

What did not work: most hospital "understanding your bill" PDFs sit behind bot walls (Mayo Clinic, Dignity Health,
Texas Oncology, HHS mirrors) and refuse a plain fetch; a browser download by hand works for any of them. The one public
dataset of hospital bills found (Kaggle, "Noisy Medical Document Images", CC BY-SA 4.0) is itself synthetic, 500 bills
and 500 discharge summaries with JSON annotations, and is worth a look as a second out-of-distribution test. Receipt
datasets (SROIE, CORD) are the closest real-image sets and are not medical. Nothing real and de-identified at scale
exists in the open, which is the reason to generate.

The next step, if a day is spent on it: a second renderer family (scanned-paper look, dot-matrix remittance stubs, EOB
layouts) and a few dozen more public sample documents labelled by hand, so the real set can carry a confidence interval.

## 4. Results

Held-out synthetic letters, 100, scored through the production verifier and agreement rules
(`npx tsx scripts/eval/score.ts --truth synth/holdout --preds synth/runs/eval,synth/runs/oct28a`):

<!-- results:synth -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 100/100 | 98.8% | 568/588 (96.6%) | 7 | 7 | 70.0% | 69/69 | 4.1 | 5.1 |
| Spark 1.3 (Meta Model API) | 100/100 | 99.1% | 575/588 (97.8%) | 13 | 0 | 69.0% | 69/69 | 5.3 | 6.7 |
| Glimmer 30B, base | 0/100 | 99.1% | 0/588 (0.0%) | 0 | 0 | 0.0% | 0/69 | 0 | 0 |
| Kindred's reader (Glimmer 30B, trained) | 100/100 | 100.0% | 587/588 (99.8%) | 6 | 0 | 100.0% | 69/69 | 12.6 | 56.1 |

| Field | DeepSeek V4.1 Flash on Fireworks | Spark 1.3 (Meta Model API) | Glimmer 30B, base | Kindred's reader (Glimmer 30B, trained) |
|---|---|---|---|---|
| sender | 99/100 [1] | 87/100 [13] | 0/100 [0] | 100/100 [0] |
| hospital_name | 69/69 [0] | 69/69 [0] | 0/69 [0] | 69/69 [0] |
| amount_due | 65/65 [0] | 65/65 [0] | 0/65 [0] | 65/65 [0] |
| statement_date | 75/84 [0] | 84/84 [0] | 0/84 [0] | 84/84 [0] |
| due_date | 53/53 [0] | 53/53 [0] | 0/53 [0] | 53/53 [0] |
| account_last4 | 62/65 [3] | 65/65 [0] | 0/65 [0] | 64/65 [6] |
| financial_assistance | 30/36 [3] | 36/36 [0] | 0/36 [0] | 36/36 [0] |
| phone_numbers | 115/116 [0] | 116/116 [0] | 0/116 [0] | 116/116 [0] |
<!-- /results:synth -->

Real public sample documents, 5 (`--truth synth/real --preds synth/runs/real`):

<!-- results:real -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 5/5 | 100.0% | 24/26 (92.3%) | 3 | 0 | 60.0% | 2/3 | 5.6 | 6.2 |
| Spark 1.3 (Meta Model API) | 5/5 | 100.0% | 25/26 (96.2%) | 2 | 0 | 100.0% | 2/3 | 9.2 | 9.7 |

| Field | DeepSeek V4.1 Flash on Fireworks | Spark 1.3 (Meta Model API) |
|---|---|---|
| sender | 4/5 [1] | 4/5 [0] |
| hospital_name | 5/5 [0] | 5/5 [0] |
| amount_due | 4/4 [0] | 4/4 [0] |
| statement_date | 3/4 [1] | 4/4 [0] |
| due_date | 1/1 [0] | 1/1 [0] |
| account_last4 | 1/1 [0] | 1/1 [0] |
| financial_assistance | 1/1 [1] | 1/1 [1] |
| phone_numbers | 5/5 [0] | 5/5 [1] |
<!-- /results:real -->

Reading the table. Kindred's reader read all 100 held-out letters, every line verbatim, 587 of 588 facts right, every
kind as Biscuit's catalogue names it, every hospital resolved to its CMS record. Its six verified-but-wrong facts are
all account numbers: on five lab-results letters, which carry no account, it cited the last four digits of a phone
number or a ZIP code as the account (the quote is verbatim, the value is invented), and on one utility bill it read
"2097-76963" as ending in 7963. Those six are exactly what the verbatim rule cannot catch and the agreement gate can:
no other reader would cite them, so they would never be spoken. The held-out set comes from the same generator as the
training set, so this row flatters the adapter; the loss reached zero inside the first epoch.

The two production readers read almost every line verbatim and get about 97 of 100 facts right. Their misses are
consistent: both call a final notice and an appointment reminder a "notice" where Biscuit's catalogue says "bill" and
"letter" (that is the 70 percent kind agreement), Spark 1.3 names the department as the sender on 13 letters, and
DeepSeek drops a few statement dates and help-paying lines. Base Glimmer in the session transcribed every line (99.1
percent verbatim) and then, asked the production extraction prompt without constrained decoding, wrote the page again
instead of JSON on 90 letters; the row stands as measured, and a second pass with the schema spelled out is the fairer
base number. On the real documents both production readers read every line and the misses are the ambiguous ones: who
the sender of a Medicare notice is, and whether a Medicare notice's "Total You May Be Billed" is an amount due.

Seconds in the Glimmer rows are the pooled training sampler's, shared with other tenants (5 to 70 seconds a training
step on the same pool that afternoon), not serving latency; the deployed reader is the number that matters for Rosa.

## 5. Costs

Training: $0 (Fireworks' Glimmer promotion; 52 minutes of a shared pool). Evaluation sampling in the session: 0.84
million prompt tokens and 0.11 million sampled tokens for base and tuned on the held-out letters, about $2.20 at the
Serverless Training API rates; the passes on the real documents and the base-with-schema pass about as much again. The
production readers on 105 letters: under $0.50 at DeepSeek's per-token price; Spark 1.3 on the Meta Model API credit.
The shadow seat: $8 an hour while awake, nothing asleep.

## 6. Honest limits

One generator, seven templates, one day. The held-out set is in-distribution and flatters the adapter; the real set is
five documents and cannot carry a percentage with confidence. The shadow reader is logged, never spoken, and the
deployment is awake only on demand. None of this changes what Rosa hears: two readers, the same way, or silence.
