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

## What was built when

| Date | What |
|---|---|
| 2026-10-26 | Design mocks and the written spec (no code). |
| 2026-10-27 onward | Everything in this repository: web app, API, tests, deploy. |
| Not changed | Waive (https://waive.kindred-ai.dev): Biscuit reads its published policy sheets (`/atlas/{ccn}.json`) and sends Ana to its existing start page (`/start?ccn=`). Kindred ID: the verifier files under `server/kindred/` are copies of the shared verifiers. |

## Privacy

1. Rosa has no account; her phone holds a device token only.
2. Consent is Rosa's spoken or tapped yes after Biscuit reads what he will do; only the time is kept.
3. The server stores letter summaries (sender, amount, dates, the quotes), event times and the camera region. Never images, audio, transcriptions or Rosa's words.
4. The mailbox phone looks only at the confirmed box region; frames leave only on motion, are checked, and are discarded. Nothing is recorded or streamed.
5. Biscuit speaks a number only inside a verified quote. The hospital decides; Biscuit promises nothing.
6. Biscuit sends nothing to a hospital. Ana approves every application in Waive.
7. Help opens the phone's own emergency call. Biscuit never dials by itself, never speaks on the line, and tells family by notification only.
8. One tap deletes everything, on Rosa's phone or on Ana's page. Only a daily count of deletions remains.
9. Meta calls use Standard mode, never Contributor.
10. No background listening and no wake word. Biscuit listens after a chime or a tap, and stops at "stop".

## Limits

English only. One family member told. The mailbox phone must stay on its page, plugged in. No wake word: a tap, the Talk button or a notification starts Biscuit. Informed Delivery, a second reader on open weights, and more languages are next.

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
