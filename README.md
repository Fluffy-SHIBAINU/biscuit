# Biscuit

Biscuit is a voice helper that lives on a senior's phone and speaks when the mail comes. A spare phone on the windowsill watches the mailbox. When mail lands, Rosa's phone chimes. With no spare phone, her phone chimes instead at the hour Ana says the mail usually comes, and says that it is a usual time, not a sighting. Biscuit asks to see each letter, reads it aloud, says only what it can quote from the page, asks one or two questions, and, for a hospital bill, starts a Waive case that her daughter Ana approves. Ana sees what Biscuit read and said on a family page. If Rosa needs help, her phone calls 911 and Ana is told at once.

Biscuit is a Kindred AI product, built for the Meta Global AI Developer Hackathon (Startups track, "Build for Your World"). Live at https://biscuit.kindred-ai.dev. Design spec: [docs/2026-10-26-biscuit-design.md](docs/2026-10-26-biscuit-design.md). Plan: [docs/2026-10-27-biscuit-mvp-plan.md](docs/2026-10-27-biscuit-mvp-plan.md).

## Install from a link

- **Rosa's phone:** scan the QR code on Ana's page with the phone's camera, or open https://biscuit.kindred-ai.dev. On an iPhone: Share, Add to Home Screen, open Biscuit from the icon, type the six-digit code shown (the Home Screen app is what lets it chime); on Android the scan links the phone by itself.
- **Ana:** https://biscuit.kindred-ai.dev/ana, sign in with Kindred ID (Google), describe who Biscuit helps, show the QR code to Rosa's phone and to the mailbox phone, or read them the six-digit code.
- **The mailbox phone:** any old phone with a camera: scan the QR code on Ana's page (or open https://biscuit.kindred-ai.dev/cam and type its code), allow the camera, point it at the mailbox, confirm the box Biscuit found or draw the box yourself (one finger drags a rectangle over the picture; a corner resizes it, the inside moves it; what you draw is watched as drawn, with no padding), and it starts watching; leave it plugged in on the sill. The box can be adjusted later from the phone's own screen (Adjust the Box). Every movement the phone sends shows on Ana's page (when and what Biscuit saw, in plain words; a picture only when clips are kept). The numbers behind it (who set the box, the motion level, SAM's scores and calls) are kept on the server and rendered only in the admin view, for the founder's household at `/ana?admin=1`; the mailbox phone's own screen shows its counts only in collect mode. No spare phone? Ana sets the usual mail hour on her page instead, and Rosa's own phone chimes then.

## The Meta models, and where each one works

| Model | Where | Job |
|---|---|---|
| `muse-spark-1.3` (Meta Model API, Chat Completions, Standard mode) | `server/meta/spark.ts` | Transcribes the letter picture, then extracts facts with verbatim quotes under a JSON schema; picks the follow-up questions from a fixed list. |
| `sam-3.1` (Meta Model API, Responses API, `@meta-sam/parser`) | `server/meta/sam.ts` | Finds the mailbox at setup (text prompt "mailbox", or a point prompt where Ana taps); checks that a whole letter is in the frame ("document"); watches the box region for "mail carrier", "person", "mail truck", "envelope", in that order, and any of them chimes. |
| `muse-voice-transcribe-1.0` (Meta Model API, `/v1/asr/transcribe`) | `server/meta/asr.ts` | Hears Rosa: each clip is a 16 kHz WAV the phone records itself; nothing is kept after the call. |
| `accounts/fireworks/models/deepseek-v4p1-flash` (DeepSeek V4.1 Flash, open weights, served per token by Fireworks; `FIREWORKS_READER_MODEL` names another, Muse Spark Open included) | `server/fireworks/spark.ts` | The second reader: the same picture, prompts and schema as Spark 1.3, at the same time, from another model family. Biscuit speaks a fact only when both readers read it the same way (`server/agree.ts`); a fact read two ways is shown, not spoken, and reaches Ana with both quotes. One reader away: the other reads alone, marked "read once". On when `READER_SECOND=fireworks` and `FIREWORKS_API_KEY` are set. Measured 2026-10-27 on the synthetic bill: 3.6 to 5.3 s for both calls, no reasoning tokens, about $0.0015 a letter at $0.30 in and $1.20 out per million tokens. Muse Spark Open (`accounts/fireworks/models/muse-spark-open`) took 14 s for the transcription alone and cannot stop reasoning, so it is selectable, not the default. |

The phone's own `speechSynthesis` speaks. No model is on the Help path. The API key lives on the server only; phones talk to relays under `/api/biscuit/*`.

Every number Biscuit speaks sits inside a quote the server verified as a verbatim substring of the transcription (`server/verify.ts`). A fact whose quote is not found is shown as unverified and never spoken. With the second reader on, each reader's quotes are verified against its own transcription, and a number is spoken only when the two readings agree (digits for money, dates, accounts and phones; the same hospital record for names). Rules and decisions: [docs/2026-10-27-second-reader.md](docs/2026-10-27-second-reader.md).

## Kindred's reader, trained (Meta's Glimmer 30B)

Biscuit's third reader is Kindred's own: Meta's open-weights Muse Glimmer 30B with a LoRA trained on October 28 on letters Biscuit wrote for itself, on Fireworks' Serverless Training API (free for Glimmer until November 30). It reads in the shadow: `FIREWORKS_READER_SHADOW` names the model, the reply to Rosa never waits for it, its outcome is logged after the reply as a `shadow_read` event, and Ana's Readers strip shows it with how many of the spoken reader's facts it agreed on. Rosa hears nothing from it. Method, blockers, rulings and the full tables: [docs/2026-10-28-kindred-reader.md](docs/2026-10-28-kindred-reader.md). Why it overfits the templates and the round-two plan: [docs/2026-10-29-reader-round-two.md](docs/2026-10-29-reader-round-two.md).

**Data.** No letter, picture, transcription or training row is in this repository, and none is real. `scripts/synth/` writes letters from seven templates (statement, past-due notice, financial assistance decision, utility bill, advertisement, appointment reminder, lab results) with real CMS hospital names and invented people, amounts, dates and 555-01xx phone numbers, renders each as a phone photo, and builds the truth from the same values it printed, so every quote is a verbatim line. The set regenerates from a seed anywhere (`/synth/` is ignored by git). Real documents are used for evaluation only, read from their public pages and never redistributed: a Riverside Health System itemized statement published by Virginia's Criminal Injuries Compensation Fund, the Western Reserve Hospital sample bill and statement, and the CMS sample Part A Medicare Summary Notice.

```bash
npx tsx scripts/synth/render.ts --out synth --count 700 --holdout 100 --seed 1     # 600 train, 100 held out, about 4 minutes
npx tsx scripts/synth/dataset.ts --in synth/train --out synth/train.jsonl && npx tsx scripts/synth/dataset.ts --in synth/holdout --out synth/holdout.jsonl
COOKBOOK=/path/to/fw-ai/cookbook python scripts/train/glimmer_sft.py --train synth/train.jsonl --holdout synth/holdout.jsonl --run oct28a
npx tsx scripts/eval/readers.ts --in synth/holdout --out synth/runs/eval --readers meta,deepseek   # the production readers
npx tsx scripts/eval/score.ts --truth synth/holdout --preds synth/runs/eval,synth/runs/oct28a      # the table below
python scripts/train/deploy.py create --model accounts/<account>/models/biscuit-glimmer-oct28a    # the shadow seat, $8 an hour awake, asleep in ten idle minutes
```

**Results, round two (October 29).** Every reader gets the same JPEG and the same two prompts; a fact counts as right only when its quote is verbatim in the reader's own transcription and its value agrees with the truth the way the agreement gate compares two readers. "Verified but wrong" is what Biscuit would have spoken that the page does not say. Round one (October 28) beat both live readers on held-out synthetic letters and was the weakest on real documents, inventing account numbers because every training letter had one. Round two taught absence (letters that lack fields, pages that are not letters, redaction bars), two more photo families, and 28 rows from real public pages labelled by the two readers' agreement. On 100 new held-out letters it beats both live readers; on six real public documents it reads 28 of 30 facts with 5 verified-but-wrong, between DeepSeek (29, 3) and Spark 1.3 (26, 6), up from 24 and 14. The seat rule (no more verified-but-wrong than either live reader on real pages) is not yet met, so it stays in the shadow. Glimmer rows' seconds are the pooled training sampler's, not serving latency. Round one, round two and what is left: [docs/2026-10-28-kindred-reader.md](docs/2026-10-28-kindred-reader.md), [docs/2026-10-29-reader-round-two.md](docs/2026-10-29-reader-round-two.md).

100 new held-out synthetic letters (round-two generator, 523 facts):

<!-- results:synth -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 97/100 | 97.5% | 483/523 (92.4%) | 18 | 4 | 59.0% | 64/65 | 3 | 3.8 |
| Spark 1.3 (Meta Model API) | 96/100 | 97.3% | 487/523 (93.1%) | 14 | 0 | 68.0% | 62/65 | 4.3 | 5.7 |
| Kindred's reader (Glimmer 30B, trained) | 100/100 | 98.3% | 515/523 (98.5%) | 10 | 0 | 100.0% | 64/65 | 11.1 | 17.6 |
<!-- /results:synth -->

Six real public documents (30 facts; Riverside itemization, Western Reserve bill and statement, two Medicare notice pages, an IRS balance-due notice):

<!-- results:real -->
| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash on Fireworks | 6/6 | 100.0% | 29/30 (96.7%) | 3 | 0 | 50.0% | 2/3 | 5.5 | 5.7 |
| Glimmer 30B, base, schema in the prompt | 6/6 | 100.0% | 26/30 (86.7%) | 3 | 0 | 83.3% | 2/3 | 27.2 | 29.9 |
| Kindred's reader, round one (Oct 28) | 6/6 | 100.0% | 24/30 (80.0%) | 14 | 1 | 50.0% | 2/3 | 50.4 | 61.8 |
| Kindred's reader, round two (Oct 29) | 6/6 | 100.0% | 28/30 (93.3%) | 5 | 1 | 100.0% | 2/3 | 15.5 | 15.5 |
| Spark 1.3 (Meta Model API) | 6/6 | 100.0% | 26/30 (86.7%) | 6 | 0 | 83.3% | 2/3 | 6.9 | 7.8 |
<!-- /results:real -->

## What was built when

| Date | What |
|---|---|
| 2026-10-26 | Design mocks and the written spec (no code). |
| 2026-10-27 | The web app, API, tests, deploy; the second reader. |
| 2026-10-28 | Kindred's reader: synthetic letters, the Glimmer 30B LoRA, the eval through the production verifier, the shadow seat; the mailbox collect mode and its calibration tools. |
| 2026-10-29 | Round two of Kindred's reader (letters that lack things, redaction bars, three photo families, real pages labelled by agreement) and its measurement; a simulated user trial, 36 personas on the real spoken lines (`docs/2026-10-29-user-trial.md`), and what it changed: the name on the letter is read first and a mismatch stops the reading and tells Ana, collectors and "not a bill" are said plainly, the hand-off is a question Biscuit asks, the mailbox phone is optional in words as well as in fact; the delivery-hour chime for homes without a mailbox phone (Ana sets the hour, Rosa's phone keeps the zone, a GitHub Actions schedule ticks `/api/biscuit/chime/tick` every ten minutes). |
| 2026-10-29 | Mailbox clips: a household that opts in on Ana's page keeps a 6-second clip of the box region for each movement; Ana taps who it was (Mail carrier, Not mail, Someone else, Skip) on a "Who was at the box" strip; from eight taps her mailbox gets its own SAM score floor and motion gate, applied on the frames route and sent to the phone; a second opt-in lets tapped clips into a de-identified export (`scripts/cam/export.ts`); retention runs on the chime tick; nothing is trained (`docs/2026-10-29-mailbox-clips.md`). |
| 2026-10-29 | The watched box by hand: on the mailbox phone's setup screen, Draw the box myself draws a rectangle over the live preview, corner handles resize it and a drag inside moves it, and Use this box saves it as drawn, with no padding; Adjust it by hand on SAM's find, Draw the box myself after a failed find and Adjust the box on the Watching screen reach the same editor; the region route records whether SAM or a hand set the box (migration 0006) and Ana's page says which. Once the box is set the phone goes straight to watching; the envelope test is optional (Test it on the phone or on Ana's page, which reaches the phone at its next heartbeat). The motion cooldown is 5 seconds after a sighting and backs off while sends see nothing (5, 15, 30, 60 s; two quiet minutes reset it), in place of a flat 90 seconds. The watch prompts are now "mail carrier", "person", "mail truck", "envelope".; later the same day the envelope test was removed (the box set, the phone watches), every movement the phone sends shows on Ana's page, and the phone shows the movement level it sees; the mailbox phone notices a frozen camera stream (the page lives, the frames stop) and restarts it, and Ana's page says Camera Asleep until it does |
| 2026-10-30 | QR codes on Ana's link screens: the mailbox phone and Android phones link by scanning; an iPhone's browser shows the code to type inside the Home Screen app (its storage is its own). Typing the six digits still works. The founder's first live test: Your Papers gained Show me a letter and Talk to Biscuit and each letter replays on a tap; Talk to Biscuit acts on the words (a letter, the papers, the mail, tell Ana) and shows the same moves as buttons; the photo step has Take the picture from the start and stops the camera once the picture is taken; a letter addressed to someone else is stored as a date, a kind and the status only (`docs/2026-10-30-usability-pass.md`). |
| 2026-10-29 | "Who was at the box" is a carousel with two groups, Needs your attention and Already classified; every new clip carries Biscuit's guess with its confidence and the guessed answer is the one-tap button; the taps keep a record per prompt (precision, a meaning learned for a person at this box, a raised floor for a prompt Ana keeps correcting); at a well-taught box Biscuit classifies sure clips itself and Not right corrects it in one tap; the export says whose label each row is (`docs/2026-10-29-mailbox-clips.md` §4). |
| 2026-10-29 | Ana's page in two voices: each card is a title, one plain line a daughter understands ("3 clips to check. Who was it?", "Good job! Biscuit is getting smarter: right 8 times out of 10."), the buttons in her words (The mail carrier, A car or the wind, Someone else, Skip), and a Details disclosure with every number, floor, prompt name and the full consent words, closed for her and open for the founder's household; the mailbox phone's screen keeps one plain line and puts its counts under Details. |
| 2026-10-29 | Title Case across Ana's page, her setup screens and the mailbox phone's screens: card titles (Letters Biscuit Read, Biscuit Said, Readers, Mailbox Phone, Who Was at the Box, Mail Time, Help, Recent, Delete), one short Title Case line each ("No Letter Read Yet", "Nothing Today", "Watching the Box · Last Movement 4:54 PM", "3 Clips to Check", "Usual Mail Time 3 PM"), buttons (The Mail Carrier, A Car or the Wind, Someone Else, Skip, Not Right, Yes, Right, Pause Watching, Set Up a Spare Phone), and every explanatory sentence moved under Details; Rosa's spoken screens untouched. |
| 2026-10-30 | Nothing technical on the user side at all: every Details disclosure and explanatory sentence is gone from Ana's page, her setup screens and the mailbox phone's screens, folded or not; the admin view with the numbers renders only for the founder's household at `/ana?admin=1` (`household.admin` and the flag together), and the mailbox phone shows its counts only in collect mode. |
| Not changed | Waive (https://waive.kindred-ai.dev): Biscuit reads its published policy sheets (`/atlas/{ccn}.json`) and sends Ana to its existing start page (`/start?ccn=`). Kindred ID: the verifier files under `server/kindred/` are copies of the shared verifiers. |

## Privacy

1. Rosa has no account; her phone holds a device token only.
2. Consent is Rosa's spoken or tapped yes after Biscuit reads what he will do; only the time is kept.
3. The server stores letter summaries (sender, amount, dates, the quotes), event times (each movement at the box among them: when, what SAM saw, the motion level), and the camera region. A letter addressed to someone else is stored as a date, a kind and the status "not mine": no sender, no amount, no quotes. What Rosa asks Biscuit to tell Ana is kept in her words, 300 characters at most, each time by her choice. Never images, audio, transcriptions or Rosa's words.
4. The mailbox phone looks only at the confirmed box region; frames leave only on motion, are checked, and are discarded. Nothing is recorded or streamed. Two exceptions, each a choice Ana makes on her page, off by default, and each said on the mailbox phone's screen while it holds: **Keep short clips of the box for me to check** keeps, for each movement, a 6-second clip of the box region (8 frames, each under 60 KB) with SAM's scores, so Ana can tap who it was (The Mail Carrier, A Car or the Wind, Someone Else, or Skip), with Biscuit's guess on every clip in plain words ("Biscuit Thinks It Was the Mail Carrier"); how sure it is, in numbers, is kept on the row and rendered only in the admin view; unchecked clips go after 7 days, tapped ones 30 days after the tap, and from eight taps that one mailbox gets its own SAM score floor and motion gate, each prompt its own record and, where her taps say so, its own meaning; once a prompt has been right nine times in ten over twenty of her taps, Biscuit classifies the sure clips itself, said as such, and one Not right hands a clip back. Her page reads as a Title Case title and one short Title Case line per card ("3 Clips to Check", "Good Job! Biscuit Is Getting Smarter"), the buttons, and the lists; no number, floor, prompt name or explanation is rendered for her, folded or not. The admin view with all of it exists only for the founder's household at `/ana?admin=1`. Numbers on the household row, frames only in kept clips, no trained model. **Help improve Biscuit for everyone** lets the clips she tapped into a de-identified export (hashed household id, box region only, the hour not the minute; `scripts/cam/export.ts`) for a later classifier or prompt set, and keeps them until she turns it off. Turning clips off removes them. A third exception is the founder's own household under collect mode (`CAM_COLLECT_OWNER`, `/cam?collect=1`), which keeps full frames for calibration (`docs/2026-10-28-mailbox-calibration.md`). All of it: `docs/2026-10-29-mailbox-clips.md`.
5. Biscuit speaks a number only inside a verified quote. The hospital decides; Biscuit promises nothing.
6. Biscuit sends nothing to a hospital. Ana approves every application in Waive.
7. Help opens the phone's own emergency call. Biscuit never dials by itself, never speaks on the line, and tells family by notification only.
8. One tap deletes everything, on Rosa's phone or on Ana's page. Only a daily count of deletions remains.
9. Meta calls use Standard mode, never Contributor.
10. No background listening and no wake word. Biscuit listens after a chime or a tap, and stops at "stop".

## Limits

English only. One family member told. The mailbox phone must stay on its page, plugged in. Without one, the chime is Ana's guess at the hour, ticked every ten minutes by a GitHub Actions schedule (Vercel's Hobby plan runs crons once a day), so it can run a few minutes late and never knows whether mail actually came. No wake word: a tap, the Talk button or a notification starts Biscuit. Informed Delivery, Kindred's reader taking a live seat, and more languages are next.

## Run it

```bash
npm install
cp .env.local.example .env.local   # MODEL_API_KEY, FIREWORKS_API_KEY + READER_SECOND=fireworks, VAPID keys (node scripts/vapid.mjs >> .env.local), DATABASE_URL, CRON_SECRET (the same value as the repo's Actions secret, for the chime tick)
npm run db:migrate
npm run dev                        # vercel dev on :3000 (KINDRED_AUTH_BYPASS=<email> stands in for Ana's session locally)
npm test && npm run typecheck && npm run build
./deploy.sh                        # vercel --prod
```

Tests run against the recorded Meta fixtures under `tests/fixtures/meta` and `tests/fixtures/fireworks` (no key needed; `npx tsx scripts/record-fixtures.ts fireworks` re-records the second reader's) and, when `DATABASE_URL` is set, against the database. Device QA: [docs/qa.md](docs/qa.md).
