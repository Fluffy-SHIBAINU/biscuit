# Biscuit

Biscuit is a voice helper that lives on a senior's phone and speaks when the mail comes. A spare phone on the windowsill watches the mailbox. When mail lands, Rosa's phone chimes. Biscuit asks to see each letter, reads it aloud, says only what it can quote from the page, asks one or two questions, and, for a hospital bill, starts a Waive case that her daughter Ana approves. Ana sees what Biscuit read and said on a family page. If Rosa needs help, her phone calls 911 and Ana is told at once.

Biscuit is a Kindred AI product, built for the Meta Global AI Developer Hackathon (Startups track, "Build for Your World"). Live at https://biscuit.kindred-ai.dev. Design spec: [docs/2026-10-26-biscuit-design.md](docs/2026-10-26-biscuit-design.md). Plan: [docs/2026-10-27-biscuit-mvp-plan.md](docs/2026-10-27-biscuit-mvp-plan.md).

## Install from a link

- **Rosa's phone:** open https://biscuit.kindred-ai.dev, Share, Add to Home Screen, open Biscuit from the icon, type the six-digit code from Ana's page. The Home Screen install is what lets it chime.
- **Ana:** https://biscuit.kindred-ai.dev/ana, sign in with Kindred ID (Google), describe who Biscuit helps, read the code to Rosa's phone.
- **The mailbox phone:** any old phone with a camera: https://biscuit.kindred-ai.dev/cam, type its code, allow the camera, point it at the mailbox, confirm the box Biscuit found, run the envelope test, leave it plugged in on the sill.

## The Meta models, and where each one works

| Model | Where | Job |
|---|---|---|
| `muse-spark-1.3` (Meta Model API, Chat Completions, Standard mode) | `server/meta/spark.ts` | Transcribes the letter picture, then extracts facts with verbatim quotes under a JSON schema; picks the follow-up questions from a fixed list. |
| `sam-3.1` (Meta Model API, Responses API, `@meta-sam/parser`) | `server/meta/sam.ts` | Finds the mailbox at setup (text prompt "mailbox", or a point prompt where Ana taps); checks that a whole letter is in the frame ("document"); watches the box region for "mail carrier", "mailbox door", "envelope". |
| `muse-voice-transcribe-1.0` (Meta Model API, `/v1/asr/transcribe`) | `server/meta/asr.ts` | Hears Rosa: each clip is a 16 kHz WAV the phone records itself; nothing is kept after the call. |
| `accounts/fireworks/models/deepseek-v4p1-flash` (DeepSeek V4.1 Flash, open weights, served per token by Fireworks; `FIREWORKS_READER_MODEL` names another, Muse Spark Open included) | `server/fireworks/spark.ts` | The second reader: the same picture, prompts and schema as Spark 1.3, at the same time, from another model family. Biscuit speaks a fact only when both readers read it the same way (`server/agree.ts`); a fact read two ways is shown, not spoken, and reaches Ana with both quotes. One reader away: the other reads alone, marked "read once". On when `READER_SECOND=fireworks` and `FIREWORKS_API_KEY` are set. Measured 2026-10-27 on the synthetic bill: 3.6 to 5.3 s for both calls, no reasoning tokens, about $0.0015 a letter at $0.30 in and $1.20 out per million tokens. Muse Spark Open (`accounts/fireworks/models/muse-spark-open`) took 14 s for the transcription alone and cannot stop reasoning, so it is selectable, not the default. |

The phone's own `speechSynthesis` speaks. No model is on the Help path. The API key lives on the server only; phones talk to relays under `/api/biscuit/*`.

Every number Biscuit speaks sits inside a quote the server verified as a verbatim substring of the transcription (`server/verify.ts`). A fact whose quote is not found is shown as unverified and never spoken. With the second reader on, each reader's quotes are verified against its own transcription, and a number is spoken only when the two readings agree (digits for money, dates, accounts and phones; the same hospital record for names). Rules and decisions: [docs/2026-10-27-second-reader.md](docs/2026-10-27-second-reader.md).

## Kindred's reader, trained (Meta's Glimmer 30B)

Biscuit's third reader is Kindred's own: Meta's open-weights Muse Glimmer 30B with a LoRA trained on October 28 on letters Biscuit wrote for itself, on Fireworks' Serverless Training API (free for Glimmer until November 30). It reads in the shadow: `FIREWORKS_READER_SHADOW` names the model, the reply to Rosa never waits for it, its outcome is logged after the reply as a `shadow_read` event, and Ana's Readers strip shows it with how many of the spoken reader's facts it agreed on. Rosa hears nothing from it. Method, blockers, rulings and the full tables: [docs/2026-10-28-kindred-reader.md](docs/2026-10-28-kindred-reader.md).

**Data.** No letter, picture, transcription or training row is in this repository, and none is real. `scripts/synth/` writes letters from seven templates (statement, past-due notice, financial assistance decision, utility bill, advertisement, appointment reminder, lab results) with real CMS hospital names and invented people, amounts, dates and 555-01xx phone numbers, renders each as a phone photo, and builds the truth from the same values it printed, so every quote is a verbatim line. The set regenerates from a seed anywhere (`/synth/` is ignored by git). Real documents are used for evaluation only, read from their public pages and never redistributed: a Riverside Health System itemized statement published by Virginia's Criminal Injuries Compensation Fund, the Western Reserve Hospital sample bill and statement, and the CMS sample Part A Medicare Summary Notice.

```bash
npx tsx scripts/synth/render.ts --out synth --count 700 --holdout 100 --seed 1     # 600 train, 100 held out, about 4 minutes
npx tsx scripts/synth/dataset.ts --in synth/train --out synth/train.jsonl && npx tsx scripts/synth/dataset.ts --in synth/holdout --out synth/holdout.jsonl
COOKBOOK=/path/to/fw-ai/cookbook python scripts/train/glimmer_sft.py --train synth/train.jsonl --holdout synth/holdout.jsonl --run oct28a
npx tsx scripts/eval/readers.ts --in synth/holdout --out synth/runs/eval --readers meta,deepseek   # the production readers
npx tsx scripts/eval/score.ts --truth synth/holdout --preds synth/runs/eval,synth/runs/oct28a      # the table below
python scripts/train/deploy.py create --model accounts/<account>/models/biscuit-glimmer-oct28a    # the shadow seat, $8 an hour awake, asleep in ten idle minutes
```

**Results.** Every reader gets the same JPEG and the same two prompts; a fact counts as right only when its quote is verbatim in the reader's own transcription and its value agrees with the truth the way the agreement gate compares two readers. "Verified but wrong" is what Biscuit would have spoken that the page does not say. On the 100 held-out synthetic letters Kindred's reader beats both live readers; on five real public documents it is the weakest of the four, inventing account numbers from amounts and phone numbers because every letter it trained on had one. It learned the templates, not letters, so it stays in the shadow. Glimmer rows' seconds are the pooled training sampler's, not serving latency; "base" in the session had no constrained decoding and wrote the page instead of JSON, so the base row to read is the one with the schema in the prompt.

<!-- results:synth -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 100/100 | 98.8% | 568/588 (96.6%) | 7 | 7 | 70.0% | 69/69 | 4.1 | 5.1 |
| Spark 1.3 (Meta Model API) | 100/100 | 99.1% | 575/588 (97.8%) | 13 | 0 | 69.0% | 69/69 | 5.3 | 6.7 |
| Glimmer 30B, base | 0/100 | 99.1% | 0/588 (0.0%) | 0 | 0 | 0.0% | 0/69 | 0 | 0 |
| Glimmer 30B, base, schema in the prompt | 100/100 | 99.3% | 535/588 (91.0%) | 39 | 3 | 69.0% | 68/69 | 41.2 | 130 |
| Kindred's reader (Glimmer 30B, trained) | 100/100 | 100.0% | 587/588 (99.8%) | 6 | 0 | 100.0% | 69/69 | 12.6 | 56.1 |
<!-- /results:synth -->

<!-- results:real -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 5/5 | 100.0% | 24/26 (92.3%) | 3 | 0 | 60.0% | 2/3 | 5.6 | 6.2 |
| Glimmer 30B, base, schema in the prompt | 5/5 | 100.0% | 22/26 (84.6%) | 2 | 0 | 80.0% | 2/3 | 19.9 | 24 |
| Kindred's reader (Glimmer 30B, trained) | 5/5 | 100.0% | 21/26 (80.8%) | 12 | 0 | 40.0% | 2/3 | 14.3 | 15.9 |
| Spark 1.3 (Meta Model API) | 5/5 | 100.0% | 25/26 (96.2%) | 2 | 0 | 100.0% | 2/3 | 9.2 | 9.7 |
<!-- /results:real -->

## What was built when

| Date | What |
|---|---|
| 2026-10-26 | Design mocks and the written spec (no code). |
| 2026-10-27 | The web app, API, tests, deploy; the second reader. |
| 2026-10-28 | Kindred's reader: synthetic letters, the Glimmer 30B LoRA, the eval through the production verifier, the shadow seat; the mailbox collect mode and its calibration tools. |
| Not changed | Waive (https://waive.kindred-ai.dev): Biscuit reads its published policy sheets (`/atlas/{ccn}.json`) and sends Ana to its existing start page (`/start?ccn=`). Kindred ID: the verifier files under `server/kindred/` are copies of the shared verifiers. |

## Privacy

1. Rosa has no account; her phone holds a device token only.
2. Consent is Rosa's spoken or tapped yes after Biscuit reads what he will do; only the time is kept.
3. The server stores letter summaries (sender, amount, dates, the quotes), event times and the camera region. Never images, audio, transcriptions or Rosa's words.
4. The mailbox phone looks only at the confirmed box region; frames leave only on motion, are checked, and are discarded. Nothing is recorded or streamed. The one exception is explicit on both ends: a household whose owner `CAM_COLLECT_OWNER` names, with the page opened as `/cam?collect=1`, keeps its frames for calibration and the screen says so (`docs/2026-10-28-mailbox-calibration.md`).
5. Biscuit speaks a number only inside a verified quote. The hospital decides; Biscuit promises nothing.
6. Biscuit sends nothing to a hospital. Ana approves every application in Waive.
7. Help opens the phone's own emergency call. Biscuit never dials by itself, never speaks on the line, and tells family by notification only.
8. One tap deletes everything, on Rosa's phone or on Ana's page. Only a daily count of deletions remains.
9. Meta calls use Standard mode, never Contributor.
10. No background listening and no wake word. Biscuit listens after a chime or a tap, and stops at "stop".

## Limits

English only. One family member told. The mailbox phone must stay on its page, plugged in. No wake word: a tap, the Talk button or a notification starts Biscuit. Informed Delivery, Kindred's reader taking a live seat, and more languages are next.

## Run it

```bash
npm install
cp .env.local.example .env.local   # MODEL_API_KEY, FIREWORKS_API_KEY + READER_SECOND=fireworks, VAPID keys (node scripts/vapid.mjs >> .env.local), DATABASE_URL
npm run db:migrate
npm run dev                        # vercel dev on :3000 (KINDRED_AUTH_BYPASS=<email> stands in for Ana's session locally)
npm test && npm run typecheck && npm run build
./deploy.sh                        # vercel --prod
```

Tests run against the recorded Meta fixtures under `tests/fixtures/meta` and `tests/fixtures/fireworks` (no key needed; `npx tsx scripts/record-fixtures.ts fireworks` re-records the second reader's) and, when `DATABASE_URL` is set, against the database. Device QA: [docs/qa.md](docs/qa.md).
