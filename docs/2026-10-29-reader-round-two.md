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
