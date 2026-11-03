# Submission text (Meta Global AI Developer Hackathon, November 4, 2026)

Paste-ready. Each block is one field of the form; trim to the field's limit.

## Project name

Biscuit, by Kindred AI

## One line

A voice companion that reads a senior's mail aloud, turns a hospital bill into the hospital's own financial-assistance
case, and hands it to the family: Muse Spark reads the page, SAM watches the mailbox, Muse Voice hears her.

## What it does

Rosa is 78 and lives alone. Mail comes she cannot read, and bills she may not owe. Her daughter Ana lives across town.

Ana sets Biscuit up once, in twenty minutes, from her laptop: who he helps, a code for Rosa's phone, a spare phone on the
windowsill that watches the mailbox. From then on Rosa just talks. Biscuit hears all day, on every screen, and chimes
when the mail comes. She holds a letter up to the phone; he checks the frame, reads the page, tells her what it is ("This
is a bill."), and says only the facts he can quote from the page. He asks the two questions that matter for a hospital
bill, by voice, with the answers he will accept. When the hospital's own financial-assistance rule applies (Massachusetts
General Hospital gives free care to households under 150% of the federal poverty level, from Waive's record of the
hospital's policy), he offers to start the application with Ana, and she gets it on her page the same minute, in Rosa's
own words, with a dot on the calendar for the day it is due. From Ana's page the bill goes to Waive (the application
under the hospital's rule) and the family to Lull (the Medicare programs that pay for a caregiver's break).

Biscuit is also a companion: reminders set by voice ("Biscuit, remind me about my pills at eight"), the weather at home,
things she has told him, and a two-second hold on the phone that tells Ana she needs help. He never gives a dose, never
dials, never files anything himself.

## Meta models

- **Muse Spark 1.3** (Meta Model API, Chat Completions): transcribes the letter picture, extracts the facts with verbatim
  quotes under a JSON schema, picks the follow-up questions, and runs the open conversation (a JSON answer with the
  reply, the job, memories, reminders, and an "ignore" flag for words not meant for him).
- **SAM 3.1** (Meta Model API, Responses API): finds the mailbox at setup, checks that a whole letter is in the frame
  before the picture is taken, and watches the mailbox region for the carrier, a person, a truck, an envelope.
- **Muse Voice Transcribe 1.0** (Meta Model API, `/v1/asr/transcribe`): hears Rosa on Android and the mailbox phone;
  each clip is a 16 kHz WAV the phone records itself, nothing kept after the call. (iPhone uses the phone's own
  recognizer, because a held microphone capture routes playback to the earpiece.)
- **Muse Glimmer 30B** (open weights) with a LoRA trained on Fireworks' Serverless Training API on letters Biscuit wrote
  for itself: a third reader that reads in the shadow and is scored against the spoken reader on Ana's page.

A second reader from another model family (DeepSeek V4.1 Flash on Fireworks) reads every letter at the same time; a
number is spoken only when both readers read it the same way, and every number sits inside a quote verified as a
verbatim substring of the page. A fact read two ways is shown, never spoken.

## How it is built

Hono API on Vercel Functions, Postgres on Neon, a Vite and React progressive web app installed on Rosa's phone and the
mailbox phone, web push for the chime and for Ana, Google Gemini text-to-speech for Biscuit's voice (Fenrir). 336 tests.
Production: https://biscuit.kindred-ai.dev. Source: https://github.com/Fluffy-SHIBAINU/biscuit (the build log in the
README dates every decision from October 27 to November 4).

## Why families, and why Kindred

Biscuit is the front door to two Kindred products already live: Waive, the record of every hospital's own
financial-assistance policy, quoted line by line, that prepares the application the hospital must honor; and Lull, the
Medicare and VA programs that pay for a caregiver's break. A bill that reaches Ana through Biscuit arrives as a case
under the hospital's rule, not a photo. Nothing is filed by the software; people decide.

## Demo video

`video/out/biscuit-story.mp4`, 2:54, 1920x1080. One story, narrated: a $1,234.50 hospital bill reaches Rosa, who cannot
read it; Biscuit reads it, asks her two questions by voice, finds Massachusetts General's own free-care rule, and hands
the case to her daughter Ana, who starts the application; the rest of the day he is company. Every screen is the deployed
product (Playwright as an iPhone against production, as a laptop for Ana's page); Biscuit's lines are his own voice;
the narrator is a Gemini voice reading the founder's script; the scene pictures beside the phone are generated stills.
Script, plan and pipeline: `docs/2026-11-04-demo-video-v2-plan.md`, `docs/2026-11-03-demo-video.md`.
