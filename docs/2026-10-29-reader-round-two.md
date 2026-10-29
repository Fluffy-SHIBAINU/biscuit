# Kindred's reader, round two: closing the synthetic-to-real gap

Round one (October 28) trained a LoRA on Meta's Muse Glimmer 30B on 600 letters Biscuit wrote itself. On 100 held-out
letters from the same generator it beat both live readers (587 of 588 facts). On five real public documents it was the
weakest reader of four: 21 of 26 facts, 12 verified-but-wrong. It learned the seven templates. This document is the
plan for a reader that earns a live seat, and the answer to whether a Fireworks deployment is needed.

## 1. Why it failed, in its own outputs

Every training letter had an account number, an amount, a date and a phone, in one of seven layouts, rendered by one
renderer. On real pages the adapter filled the slots it had learned to fill: the last digits of $2,099.03 as the account,
the hospital's phone as the account, "[redacted]" as the account, the patient's name as the sender, a charge line as the
amount due, "THIS IS NOT A BILL" called a bill. The base model, asked the same questions with the schema in the prompt,
made two mistakes on the same five pages. The adapter did not learn absence, and it did not learn layouts it never saw.

The research says the same thing from the other side. On the synthetic-to-real gap in document extraction, what
matters is whether synthetic samples land inside the real distribution in the model's own embedding space
([VERSE, arXiv 2601.05125](https://arxiv.org/html/2601.05125v1)); template-diverse benchmarks with fixed schemas still
fail to test adaptation to new document types ([VAREX, arXiv 2603.15118](https://arxiv.org/html/2603.15118v1)); a
controllable synthetic generator plus about 100 real samples reached 87 percent of full-real performance across eleven
benchmarks ([DocDjinn, arXiv 2602.21824](https://arxiv.org/pdf/2602.21824)); and generator diversity, not volume, is
the lever, because a single generator lets the model latch onto low-level texture
([PolyGen, arXiv 2602.01370](https://arxiv.org/pdf/2602.01370.pdf)). On the training side, LoRA instruction tuning
degrades general ability even on small sets for few steps, and a small replay of other data with a pull toward the
initial weights preserves it ([Approximate Regularized Replay, 2025](https://newx.sg/paper/detail/34aeb6c2-f824-11f0-b84c-00163e10baa7));
LoRA on vision-language models overfits in few-shot regimes and benefits from regularisation toward stable regions
([GLAD, arXiv 2507.13089](https://arxiv.org/html/2507.13089v1)). Meta's own post-training notes for Glimmer: start
with SFT, rank 8 to 32, 500 or more examples, images inline, no sample packing for multimodal rows.

## 2. The plan, in order of expected return

1. **Teach absence.** Every field becomes optional in the generator: letters with no account number, no amount, no
   date, no phone, no sender name on the first line, and the truth says null. A quarter of the set has at least one
   field missing, and a tenth is a page that is not a letter at all (a flyer, a menu, a blank form) with every field
   null. This alone addresses nine of the twelve wrong facts.
2. **Teach layouts.** A second and third renderer family: scanned paper (grey, skewed, dust, a stapler shadow,
   redaction bars), dot-matrix remittance stubs, two-column headers, tables with ruled lines, Medicare Summary Notice
   and explanation-of-benefits layouts that say "THIS IS NOT A BILL" with amounts on the page, collection-agency
   letters that name a hospital as the original creditor. The same truth-by-construction; the printed lines are the
   transcription. Two generators are worth more than twice the letters from one.
3. **Anchor on real pages, without hand labels.** Public sample documents (the list in the reader document, plus the
   ones behind bot walls that a hand download fetches in a minute each) are read by the two live readers; the facts
   both read the same way become training rows for those pages, under a "real, agreement-labelled" tag. That is the
   production gate used as a labeller: not truth, but what Biscuit would have spoken. Thirty to fifty pages is enough
   to move the needle at DocDjinn's ratio. The five hand-labelled pages stay held out as the dev set, and grow to
   twenty.
4. **Train less, pick by the real set.** One epoch, rank 16, learning rate 1e-4, and a sampler snapshot every 50
   steps; score each snapshot on the real dev set, keep the best, not the last. The round-one loss hit zero inside the
   first epoch, which was the warning.
5. **Replay.** Mix in the 300-row receipts set already on the Fireworks account (a different document family, a
   different schema) at one row in ten, so the adapter keeps reading documents it was not drilled on.
6. **The seat rule.** A reader takes a live seat only when, on the real dev set, it has no more verified-but-wrong
   facts than either live reader. Until then it reads in the shadow.

Cost and time: the generator work is a day; rendering and training are free and an hour; the real-page labelling by
agreement is a script over the existing eval runner. Training stays free on Fireworks until November 30.

## 3. Is a Fireworks deployment required?

For the measurement, no. The adapter was evaluated inside training sessions by in-session sampling, and that is how
round two is scored too. For the shadow seat in production, yes: a trained Glimmer adapter is served only on an
on-demand deployment (Glimmer is not served per token, and the session sampler is not a serving API). Fireworks refused
the deployment on October 28 with "payment method is required": a card must be on the account even with the hackathon
credit. The cheapest honest shape is the merged adapter on one H200 at $8 an hour, asleep after ten idle minutes
(`scripts/train/deploy.py`).

Given the verdict, the seat is not worth $8 an hour yet: it would show Ana a reader that invents account numbers. The
submission can stand on the measurement (the tables in the README and the canvas) and on the two live readers. The
deployment is for the day a reader passes the seat rule, or for a demo that wants the Shadow row on Ana's page.
Alternatives were weighed and set aside: exporting the adapter and serving the merged weights on Baseten needs an
inference engine that knows Glimmer's new architecture and a day of plumbing; keeping a training session open as the
backend is not a serving path.

## 4. Round two as run (October 29, overnight)

What changed in the generator (`scripts/synth/letters.ts`, `photo.ts`): twelve templates instead of seven (added a
collection-agency letter, a hospital statement that says "THIS IS NOT A BILL", a Medicare Summary Notice page, a store
flyer and a community schedule); every bill, notice and letter can now lack an account number, a due date, a statement
date or a phone number, with the truth saying null; one patient block in seven is printed as black redaction bars that
are on the page and not in the transcription; two-column headers and ruled tables on some pages; and three photo
families chosen by seed, a phone photo, a flatbed scan and a fax. Still 600 letters to train and 100 held out, still
seed 1, still nothing checked in.

Real pages: fourteen more public pages (the other Medicare Summary Notice pages, the Part B and DME samples, the IRS
notice's second page, the Western Reserve guide's ABN, estimate and application pages, the VA statement text) were read
by both production readers and became 28 training rows under the gate's own rule (`scripts/eval/agree-label.ts`: kinds
must match, a field both cited must agree, a field one cited is kept when its quote verifies, phones as full numbers).
The IRS CP14 balance-due notice joined the hand-labelled dev set, now six documents. The receipts replay was not possible:
dataset downloads are disabled on the account like uploads.

Training: one epoch (154 steps of 8 rows), rank 16, learning rate 1e-4, reasoning strength low; a snapshot every 50
steps, each sampled on the six real documents and promoted as a model, plus the final weights. The reader that takes the
table is the snapshot with the most facts right and the fewest verified-but-wrong on the real six, then scored on the
100 new held-out letters.

<!-- results:r2 -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 97/100 | 97.5% | 483/523 (92.4%) | 18 | 4 | 59.0% | 64/65 | 3 | 3.8 |
| Spark 1.3 (Meta Model API) | 96/100 | 97.3% | 487/523 (93.1%) | 14 | 0 | 68.0% | 62/65 | 4.3 | 5.7 |
| Kindred's reader (Glimmer 30B, trained) | 100/100 | 98.3% | 515/523 (98.5%) | 10 | 0 | 100.0% | 64/65 | 11.1 | 17.6 |

| Field | DeepSeek V4.1 Flash on Fireworks | Spark 1.3 (Meta Model API) | Kindred's reader (Glimmer 30B, trained) |
|---|---|---|---|
| sender | 95/100 [2] | 83/100 [12] | 100/100 [0] |
| hospital_name | 62/65 [1] | 62/65 [1] | 65/65 [0] |
| amount_due | 54/56 [8] | 54/56 [0] | 54/56 [2] |
| statement_date | 67/76 [0] | 74/76 [0] | 74/76 [2] |
| due_date | 45/47 [0] | 45/47 [0] | 45/47 [2] |
| account_last4 | 49/58 [3] | 51/58 [0] | 56/58 [2] |
| financial_assistance | 20/27 [4] | 26/27 [0] | 27/27 [1] |
| phone_numbers | 91/94 [0] | 92/94 [1] | 94/94 [1] |
<!-- /results:r2 -->

Six real public documents, 30 facts on the page, every reader (`--truth synth/real --preds synth/runs/real`):

<!-- results:r2real -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 6/6 | 100.0% | 29/30 (96.7%) | 3 | 0 | 50.0% | 2/3 | 5.5 | 5.7 |
| Glimmer 30B, base, schema in the prompt | 6/6 | 100.0% | 26/30 (86.7%) | 3 | 0 | 83.3% | 2/3 | 27.2 | 29.9 |
| Kindred's reader, round one (Oct 28) | 6/6 | 100.0% | 24/30 (80.0%) | 14 | 1 | 50.0% | 2/3 | 50.4 | 61.8 |
| Kindred's reader, round two (Oct 29) | 6/6 | 100.0% | 28/30 (93.3%) | 5 | 1 | 100.0% | 2/3 | 15.5 | 15.5 |
| Spark 1.3 (Meta Model API) | 6/6 | 100.0% | 26/30 (86.7%) | 6 | 0 | 83.3% | 2/3 | 6.9 | 7.8 |

| Field | DeepSeek V4.1 Flash on Fireworks | Glimmer 30B, base, schema in the prompt | Kindred's reader, round one (Oct 28) | Kindred's reader, round two (Oct 29) | Spark 1.3 (Meta Model API) |
|---|---|---|---|---|---|
| sender | 6/6 [0] | 4/6 [1] | 2/6 [4] | 5/6 [1] | 4/6 [1] |
| hospital_name | 5/5 [0] | 5/5 [0] | 4/5 [1] | 5/5 [0] | 5/5 [0] |
| amount_due | 5/5 [0] | 3/5 [0] | 5/5 [1] | 4/5 [0] | 5/5 [0] |
| statement_date | 4/5 [1] | 5/5 [0] | 5/5 [1] | 5/5 [1] | 4/5 [1] |
| due_date | 2/2 [0] | 2/2 [0] | 2/2 [0] | 2/2 [0] | 1/2 [1] |
| account_last4 | 1/1 [0] | 1/1 [0] | 1/1 [4] | 1/1 [1] | 1/1 [1] |
| financial_assistance | 1/1 [1] | 1/1 [1] | 1/1 [1] | 1/1 [1] | 1/1 [1] |
| phone_numbers | 5/5 [1] | 5/5 [1] | 4/5 [2] | 5/5 [1] | 5/5 [1] |
<!-- /results:r2real -->

### What round two measured

Snapshots on the six real documents: step 50 read 27 of 30 with 7 wrong, steps 100 and 150 and the final weights 28
with 6, 5 and 5. The plateau came by step 100; the final weights (`biscuit-glimmer-oct29a`) are the reader scored
above. Every snapshot is promoted on the account as `biscuit-glimmer-oct29a-s50`, `-s100`, `-s150`.

On the 100 new held-out letters, which now include pages with no account, no phone or no date, redaction bars, scans
and faxes, Kindred's reader reads 515 of 523 facts with 10 verified-but-wrong and every kind right, against DeepSeek's
483 and 18 and Spark 1.3's 487 and 14. Both live readers read three or four pages too short to count, and both mislabel
kinds (59 and 68 percent): the catalogue's "notice" and "letter" are learned, not guessed.

On the six real documents the adapter went from the weakest reader to the middle of the room: 24 facts and 14 wrong in
round one, 28 and 5 in round two, with every kind right. What it still gets wrong: the IRS notice's placeholder phone
"1-800-xxx-xxxx" (cited verbatim by four of the five readers; the truth says the page has no number), the Riverside
letterhead "Riverside Health System" as sender where the truth says the hospital line (the base model makes the same
call), "financial assistance information on back" read as help offered (every reader makes that call; the label is the
outlier), and on the Medicare claims page the service dates as the notice date and the claim number as the account
(the two genuine misreads). None of the invented account numbers of round one remain.

The seat rule asked for no more verified-but-wrong than either live reader on the real set. DeepSeek has 3, Spark 1.3
has 6, Kindred's reader has 5. It passes against Spark and not against DeepSeek, so by the rule as written it stays in
the shadow. Six documents cannot separate 3 from 5 with any confidence either way; a round three needs the real set
first: twenty to forty more public pages labelled by hand, including the hard kinds (claims pages, remittance stubs,
collection letters), before another adapter is judged.

Cost of the round: training $0 (the promotion), in-session sampling for four dev snapshots, the holdout and the three
comparison passes about $3.50, the production readers under $1.

## 5. Round three: how to run it from hand-fetched documents

Most hospital "understanding your bill" pages refuse an automated fetch and open fine in a browser. Download them and
drop the files into `synth/real-drop/` (PDF, PNG or JPEG; the folder is ignored by git, and nothing in it is ever
pushed). Worth fetching, one or two pages each: the Mayo Clinic itemized statement sample (mayoclinic.org, DOC-20079483),
Dignity Health's sample billing statement (dignityhealth.org, "guide to reading your bill"), the Texas Oncology
"Understanding Account Statements" handout, Southeast Iowa Regional Medical Center's "Understanding Your Bill", the
Washington State Hospital Association's "Understanding Your Hospital Bill", the CMS Advance Beneficiary Notice sample
form, any insurer's "how to read your EOB" sample (Aetna, Blue Cross, UnitedHealthcare), a utility's "understanding your
bill" sample (PG&E, Con Edison, Duke Energy), New York City's sample water bill, the VA copay sample statement, the CFPB
model debt validation notice (consumerfinance.gov), and any sample Medicare Advantage or hearing-aid mailer. Twenty to
forty pages is the target.

Then, from the repo (the training venv has pymupdf; `COOKBOOK` points at the Fireworks cookbook clone):

```bash
python scripts/eval/real-pages.py --in synth/real-drop --out synth/realpool2        # one JPEG per page, text alongside
npx tsx scripts/eval/readers.ts --in synth/realpool2 --out synth/runs/realpool2 --readers meta,deepseek --jobs 3
npx tsx scripts/eval/agree-label.ts --in synth/realpool2 --preds synth/runs/realpool2 --out synth/realpool2.jsonl
```

The dev set is the part that needs a person: a dozen or more of the new pages are labelled by hand in the truth shape
(`synth/real/truth/*.json`, one file per page, the printed lines and every cited value with its quote), so that the
real set can carry a confidence interval; pages used for the dev set are removed from the pool so the adapter never
trains on them. Then the round itself, with snapshots scored on the bigger real set:

```bash
npx tsx scripts/synth/dataset.ts --in synth/real --out synth/real.jsonl
COOKBOOK=/path/to/cookbook python scripts/train/glimmer_sft.py --train synth/r2/train.jsonl --extra-train synth/realpool2.jsonl --holdout synth/r2/holdout.jsonl --dev synth/real.jsonl --run oct30a --epochs 1 --snapshot-every 50 --skip-base
npx tsx scripts/eval/score.ts --truth synth/real --preds synth/runs/oct30a --only dev_ --out synth/runs/oct30a/scores-dev
```

The seat rule decides: the adapter takes a live seat only when, on the real dev set, it has no more verified-but-wrong
facts than either live reader.

