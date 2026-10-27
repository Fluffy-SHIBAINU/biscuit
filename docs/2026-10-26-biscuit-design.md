# Biscuit — design spec

Date: 2026-10-26. Status: for review. Product: Biscuit, a Kindred AI product. Event: Meta Global AI Developer Hackathon, Startups track, "Build for Your World". Build: 3 days. Submission: 1 day.

Mocks: https://claude.ai/artifact/LjF7QQr9WAkJZvrf9eqivC (Version 12, 40 boards). Board names in this document (A1, R4, C5b, E1, I2 and so on) refer to that canvas.

## 1. What Biscuit is

Biscuit is a voice helper that lives on a senior's phone and speaks when the mail comes. A spare phone on the windowsill watches the mailbox. When mail lands, Rosa's phone chimes. Biscuit asks to see each letter, reads it aloud, says only what it can quote from the page, asks one or two questions for context, and, for a hospital bill, starts a Waive case that her daughter Ana approves. Ana sees what Biscuit read and said on a family page. If Rosa needs help, her phone calls 911 and Ana is told at once.

Biscuit is "like Alexa, but for the phone itself": installable from a link, no account for Rosa, her papers stay on her phone, one tap deletes everything. Its mascot is a dog.

Cast: Rosa (the senior; speaks to Biscuit), Ana (her daughter and caregiver; sets Biscuit up, reads the family page, approves in Waive). No one else.

The Kindred standard applies to every line: primary sources only; every value carries its quote, or is labelled Observed or Derived; people decide; collect as little as possible.

## 2. Goals and success

1. A 3-minute demo video of hackathon-built work: Ana sets Rosa up; the mailbox phone sees the mail; Rosa's phone chimes; Biscuit reads a hospital bill with its quotes; one question; the offer; the Waive case starts; Ana's page; the Help button.
2. Stage one of judging: theme fit and real use of Meta models. Three models are in the live path through Meta Model API: SAM 3.1, Muse Voice Transcribe, Muse Spark 1.3.
3. Stage two: technical execution that holds up in production. Deployed at biscuit.kindred-ai.dev, installable, with real failure paths (section 10), tests (section 12), and honest limits in the README.
4. After the hackathon, two real households can use it as is.

Acceptance criteria for the MVP:

- Rosa's phone, installed from the link, reads a photographed hospital bill and speaks sender, amount and dates, each backed by a verbatim quote found in the transcription. A fact whose quote is not found is never spoken as a number.
- From the capture to the first spoken word: 12 seconds or less on Wi-Fi.
- A letter from the mailbox phone's event to the chime on Rosa's phone: 20 seconds or less.
- The offer names the hospital's own rule with its quote from the Waive sheet and never promises an outcome.
- Ana's page shows the letter summary, what Biscuit said, the hand-off, the mailbox phone status and Help events within 30 seconds of each.
- Help: a 2-second hold opens the phone's own "Call 911?" sheet; Ana's page and phone are told before the sheet appears; the setup test never dials.
- Every failure path in section 10 marked MVP is implemented and reachable.
- The server never stores an image, an audio clip or a letter's text.

## 3. Scope: three build days, one submission day

| Tier | What | When |
|---|---|---|
| Must | Rosa's phone: Home, Talk, Mail came, Show me the letter (SAM frame check), Reading with quote verification, One question, The offer with the Waive sheet, Docket, Consent, Help (911 plus family notification). Ana: Kindred ID sign-in, Who Biscuit helps, link code, family page, Help test. Mailbox phone: join by code, place, find by SAM text prompt and tap, envelope test, watching with motion detection, battery and offline notices. Server, push, deploy, README. QA on two real phones. | Days 1 to 3 |
| Should | Loudness step; buttons mode after three voice misses; Siri shortcut instructions; "don't share this one"; picked-up event; Baseten second reader behind a flag. | Day 3, only if the Must list is done by noon |
| Out | Informed Delivery row (boards I1 to I3); Glimmer private lane; more than one family member told; letter kinds beyond bill, notice, utility, ad and unknown-number; Spanish and other languages; more hospitals than Waive has sheets for. | After submission |

Cut rules, decided now so the days are not spent deciding:

- Mailbox phone not detecting the envelope test by Day 2, 20:00: ship it as "test pending" and demo the chime from the tap fallback ("Mail came and I didn't say so? Tap here").
- Any Should item not started by Day 3, 14:00 is dropped.
- The demo video uses what is deployed, never a local build.

## 4. Architecture

```
biscuit/                               new public repository (first commit: this spec)
├── web/                               Vite + React PWA, one app, three surfaces
│   ├── src/rosa/*                     /  Rosa's phone: senior sizes (76 to 112 px buttons, 17 to 21 px text)
│   ├── src/ana/*                      /ana/*  Ana's pages: normal sizes
│   ├── src/cam/*                      /cam  the mailbox phone
│   ├── src/lib/{api,speech,store,push,navigate}.js
│   ├── public/sw.js                   service worker: install, web push, notification tap
│   └── styles/tokens.css              Kindred tokens (same values as DESIGN.md in eventhorizon)
├── api/                               Hono on Cloud Run, service biscuit-api
│   ├── server.ts                      routes under /api/biscuit/*, Kindred ID verifier on /ana writes
│   ├── _lib/{db,schema,auth,push,limits}.ts
│   ├── _lib/meta/{spark,sam,asr}.ts   the only code that holds MODEL_API_KEY
│   ├── _lib/{verify,compose,questions,hospitals,waive}.ts
│   └── data/hospitals.json            CMS Hospital General Information: name, city, state, CCN
├── tests/                             vitest: verify, compose, link codes, region math, motion, fixtures
├── vercel.json                        /api/:path* rewrite to Cloud Run; everything else to index.html
├── Dockerfile, cloudbuild.yaml, deploy.sh
└── docs/                              this spec, the QA script, the README disclosure table
```

Hosting and domains (same shapes as Tender):

- Frontend on Vercel, domain biscuit.kindred-ai.dev, DNS CNAME to Vercel.
- API on Cloud Run in the existing Kindred GCP project, 1 CPU, 1 GiB, min-instances 1, reached through the Vercel rewrite `/api/:path*`.
- Postgres: a new database `biscuit` on the existing Cloud SQL instance, node-postgres pool, drizzle migrations. Tables are all prefixed `biscuit_`. Nothing of Tender's or Waive's is touched.
- Kindred ID (id.kindred-ai.dev): Ana signs in with Google through it. The verifier files are copied from eventhorizon `id/verifiers/` (hono.ts for the API, vercel-middleware.ts for the /ana pages). Any return URL under kindred-ai.dev is already accepted by the Issuer, so no Issuer change is needed. Locally, `KINDRED_AUTH_BYPASS=<email>` stands in for the cookie, as in Tender.
- Waive (waive.kindred-ai.dev): read only, two existing routes. `GET /atlas/{ccn}.json` returns the published policy sheet with its quotes and ledger. `GET /start?ccn={ccn}` is Waive's confirm page for another Kindred product; its one button (`POST /start`) opens the case in Ana's Waive history because she is signed in there with the same Kindred ID. No Waive code change is needed.
- Meta Model API (`https://api.meta.ai/v1`, env `MODEL_API_KEY`): Spark 1.3 and SAM 3.1 through the Responses API, Voice Transcribe through `POST /v1/asr/transcribe`. The key lives on the API only; phones call Biscuit's relays.
- Web push: VAPID keys in env; subscriptions stored per device; the service worker acknowledges delivery to the server.
- Text to speech: the phone's own `speechSynthesis`. Meta ships no TTS.

Three data flows:

Setup. Ana signs in (A1), describes Rosa (A2), gets a link code (A3). Rosa's phone, already added to the Home Screen by Ana, enters the code (R1), claims a device token, runs the voice check (R2), hears what Biscuit will do and says yes (R3), sees Help (R4) and sends the test to Ana's page (R4b/R4c). The spare phone opens /cam, enters its own code (C1), gets its device token, finds the mailbox with Ana (C3 to C7) and starts watching (C8).

Mail day. The mailbox phone detects motion in the box region, sends three frames; SAM 3.1 confirms "mail carrier", "mailbox door" or "envelope"; the API records `mail_seen` and pushes to Rosa's phone. Rosa taps the notification (Mail), says yes, holds a letter in the frame; SAM 3.1 confirms a whole letter is in view; the phone uploads one JPEG; Spark 1.3 transcribes, then extracts facts with quotes; the API verifies every quote against the transcription and returns facts marked verified or not; the phone composes speech from verified facts only, speaks it, stores the letter in its docket, and sends Ana's page a summary (never the text). Biscuit asks up to two questions from a fixed list, fetches the Waive sheet for the hospital, speaks the hospital's rule with its quote, and offers to start the application. Rosa says yes: `handoff` is recorded, Ana's page shows "Needs you" with the Waive link, Rosa's docket shows "Waiting on Ana".

Help. Rosa holds Help for 2 seconds. The phone records `help`, pushes to Ana, then opens `tel:911`; the phone's own sheet asks "Call 911?". When Rosa returns to Biscuit, it says "Ana knows" and offers Call Ana (`tel:` to Ana's number) or I'm OK (records `help_ok`). Biscuit never dials by itself and never speaks on the line.

## 5. Identity, devices and sessions

- A household is created by Ana and keyed to her Kindred ID email. It holds Rosa's name, what Biscuit calls her, Ana's relation, living mode, language and `consented_at`.
- Devices: `rosa` (her phone) and `cam` (the spare phone). Each is linked with a six-digit code shown on Ana's page, good for ten minutes, three tries; the fourth try or expiry kills the code and Ana makes a new one. A claimed code returns a device token (32 random bytes, stored hashed) kept in the device's localStorage and sent as `Authorization: Bearer`. A device can be revoked from Ana's page.
- Rosa's phone and the mailbox phone never hold a Kindred session. Ana's pages and every Ana write need the `kindred_session` cookie, verified locally against the Issuer's JWKS.
- Rosa's docket, transcriptions and answers live in her phone's localStorage. The server holds letter summaries (section 7) only while the household's `share_letters` is true, which Rosa sets at consent.

## 6. Flows with acceptance criteria

### 6.1 Ana signs up and links Rosa's phone (A1 to A3, R1)

- A1: "Continue with Kindred ID". Cancelled or offline: nothing is created.
- A2: name, what Biscuit calls her, relation, living mode, language (English only in the MVP; the field is stored). Empty name keeps Next disabled.
- A3: the code and a QR of the claim URL; "Waiting for Rosa's phone"; New code.
- Rosa's phone opens biscuit.kindred-ai.dev from the Home Screen (Ana adds it there first; this step precedes R1 and is written on A3's screen). R1: the keypad, "Didn't match. Check the numbers on Ana's phone. 2 tries left."
- Done when Ana's page shows Rosa's phone with its first-seen time.

### 6.2 Rosa's phone (R2 to R5, Done)

- Voice check (R2, R2b): Rosa taps Talk and says "Hello Biscuit"; the phone records until 1.2 seconds of silence or 6 seconds; the clip goes to the ASR relay; the words come back on screen. Miss: "I didn't catch that. Hold the phone closer." Three misses: buttons mode, with voice retryable from Ana's page (Should).
- Rosa's yes (R3): Biscuit reads aloud what he will do and what he keeps; Rosa says yes or taps Yes, go on. The time is stored as `consented_at`; this is the only record. "No" pauses setup and turns nothing on. `share_letters` defaults to true and is read aloud as part of the text.
- Help (R4, R4b, R4c): the rules of section 6.5; "Send a test to Ana's page" records `help_test` and pushes to Ana; Ana's service worker acknowledges; the phone shows Got it or, after 30 seconds, Didn't get it with the fix (sign in on her phone, allow notifications). Help works without the page.
- Siri shortcut (R5): static instructions, skippable (Should).
- Done: the checklist with times; "Let Biscuit say hello".

### 6.3 The mailbox phone (C1 to C8b)

- Join (C1, C1b): /cam asks for a camera code from Ana's page, then the camera; a refused camera shows the browser's own path to allow it; three refusals skip the phone. The page requests a screen wake lock and dims its UI while watching.
- Place and find (C3 to C6): the live view; "Find my mailbox" sends one 1280-pixel JPEG to SAM 3.1 with the prompt "mailbox"; the best box and mask come back; Biscuit asks "Is this your mailbox?". No: Ana taps the box, a point prompt returns the box. None found: "I couldn't find a mailbox from here", move the phone, look again once, then tap. Wrong twice after a tap: move the phone. Still nothing: the camera is "not set up"; Rosa's phone keeps the tap fallback. The confirmed box, padded by 20 percent, is the region, stored normalised on the server and on the phone.
- Envelope test (C7, C7b): Ana opens and closes the lid within 60 seconds. Motion in the region starts the three-frame send; SAM 3.1 is asked "mailbox door" on each frame; a hit is "Works". No change in 60 seconds: try again, closer, less glare; the second miss sets the camera anyway with `test_status = pending` on Ana's page, cleared by the first real delivery.
- Watching (C8): every 500 ms the page draws the region into a 160-pixel-wide greyscale canvas and compares it with the previous frame; a mean absolute difference above the threshold for two consecutive samples is motion. Then three frames 500 ms apart go to the API; the API asks SAM 3.1 "mail carrier", then "mailbox door", then "envelope", stopping at the first hit; a hit records `mail_seen` and pushes to Rosa's phone. A 90-second cooldown follows any send. A heartbeat every 60 seconds carries battery level and charging state when the Battery API exists.
- Battery and offline (C8b): below 20 percent the page speaks "Plug me in" once, again at 12 percent; below 10 percent watching pauses and Ana's page says "battery low". Three missed heartbeats mark the camera offline on Ana's page with the time; reopening /cam within 30 days needs no code.
- Caps: 400 SAM calls per household per day; above the cap the camera pauses and Ana's page says so. Frames are never written to disk on the server.

### 6.4 One mail day (Main, Mail, Camera, Reading, Question, Action, Docket)

- Home (Main): today's mail line from the last `mail_seen`; Talk; Show me a letter; Help; "Waiting on" from the docket; the fallback link "Mail came and I didn't say so? Tap here", which records `mail_tapped` and opens Mail.
- Mail: opened by the notification tap or the fallback link; Biscuit speaks "You've got mail, Rosa. Want me to look through it?" and listens for yes or no; Yes, look and Not now also work by tap.
- Show me the letter (Camera): the back camera; one frame per second goes to the relay, which asks SAM 3.1 "letter"; pass when the mask covers at least 35 percent of the frame and its box touches no edge; the phone then captures a full-resolution JPEG (long side 2000 pixels, under 2 MB). Fail: "A little closer" with the cut-off edge named; after 10 seconds, Take it anyway.
- Reading: the API's `letter/read` returns `{transcription, facts}` where every fact has `{field, value, quote, verified}`; the phone speaks only verified facts, in the order sender, kind, amount, statement date, due date, financial assistance mention. Unreadable (Spark returns under 40 words or no sender): "I can't read this one. Keep it for Ana." Nothing is stored for an unreadable letter.
- One question (Question): the API returns up to two questions chosen by Spark from a fixed list of six by letter kind (section 9.3). Answers come by voice or by the Yes, No, Not sure buttons. Answers are stored on the phone and, when shared, as a short code on the letter summary.
- The offer (Action): the hospital name from the letter is matched against `hospitals.json` (state from the letter or the household; exact normalised name first, then a token-overlap score with a 0.8 floor); the API fetches the Waive sheet by CCN. If the sheet is published, Biscuit speaks the free-care rule with its quote and offers "I can start the application with Ana. Shall I?". If no sheet or no match: "I can send this to Ana" and the letter goes to Ana's page as needs-review. Yes records `handoff` with the CCN and the letter id; Ana's page shows "Needs you" with the link `https://waive.kindred-ai.dev/start?ccn={ccn}`; Rosa's docket shows "Waiting on Ana". A household estimate ("one person at home, Social Security only") is spoken only when both answers exist and the sheet carries a dollar threshold for that household size; it is labelled Derived and ends with "The hospital decides."
- Docket: the phone's letters with status (read, waiting on Ana, waiting on the hospital, due in N days, unknown number, tossed) and "Read them to me". Dates come from quotes or from the sheet, never from the model's own words.
- Utilities and ads: read aloud the same way; a utility's due date goes on the docket; an ad is offered "Toss it?" and stored only as a count. A letter that asks Rosa to call a number matching neither the Waive sheet's contacts for that hospital nor Medicare's published number (1-800-633-4227) is marked "unknown number" and sent to Ana's page; Biscuit never reads such a number aloud as one to call.
- Stop: the word "stop" at any point ends speech and listening; the Stop link does the same.

### 6.5 Help (R4, E1, E1b)

- The Help button appears once consent exists; it needs no contacts to work.
- A 2-second hold, or "Biscuit, help" while Biscuit is listening, records `help` with the time, pushes "Rosa pressed Help, 3:14" to Ana's devices, and navigates to `tel:911` from the hold's release so the phone shows its own "Call 911?" sheet. Biscuit's screen (E1) shows what happened and a Stop button; Cancel on the phone's sheet or Stop records `help_cancel` and Ana's page says cancelled.
- Back in Biscuit after the call (E1b): "Ana knows." Call Ana opens `tel:` to Ana's number; I'm OK records `help_ok`. Help stays open on Ana's page until she taps it.
- Nothing in Help calls a model. The setup test pushes to Ana's page and never dials.

### 6.6 Ana's family page

Sections from the Family board: Letters Biscuit read (summaries, quotes, actions, hidden letters never appear), Needs you (the Waive link), Biscuit said (the spoken lines are kept; Rosa's voice is not), Mailbox phone (status, battery, last event, Pause watching, Find the mailbox again, Run the mail test), Help (status, test, who is told, Add a family member as a Should), Delete this household. The page polls every 30 seconds; no sockets in the MVP.

### 6.7 Delete

Rosa's phone: Settings, "Delete everything", one tap and a spoken confirmation; the phone clears localStorage and calls `DELETE /api/biscuit/household` with its device token, which deletes the household's letters, events, devices and camera rows and keeps only a dated `delete` count. Ana's page has the same button. Nothing is soft-deleted.

## 7. Data model

```sql
create table biscuit_household (
  id uuid primary key, owner_email text not null, senior_name text not null, called text not null,
  relation text, living text, language text not null default 'en', share_letters boolean not null default true,
  consented_at timestamptz, created_at timestamptz not null default now());

create table biscuit_device (
  id uuid primary key, household_id uuid not null references biscuit_household(id) on delete cascade,
  kind text not null check (kind in ('rosa','cam','ana')), token_hash text unique, label text,
  push_subscription jsonb, last_seen_at timestamptz, battery int, charging boolean,
  created_at timestamptz not null default now());

create table biscuit_link_code (
  code text primary key, household_id uuid not null references biscuit_household(id) on delete cascade,
  kind text not null check (kind in ('rosa','cam')), expires_at timestamptz not null,
  tries int not null default 0, used_at timestamptz);

create table biscuit_event (
  id bigserial primary key, household_id uuid not null references biscuit_household(id) on delete cascade,
  device_id uuid, kind text not null, at timestamptz not null default now(), data jsonb not null default '{}');
-- kinds: mail_seen, mail_tapped, letter_read, handoff, help, help_cancel, help_ok, help_test, help_test_ack,
--        cam_online, cam_offline, cam_battery, cam_paused, consent, said, delete

create table biscuit_letter (
  id uuid primary key, household_id uuid not null references biscuit_household(id) on delete cascade,
  read_at timestamptz not null, kind text not null, sender text, hospital_ccn text,
  amount_cents int, statement_on date, due_on date, quotes jsonb not null default '[]',
  answers jsonb not null default '{}', status text not null default 'read', needs_review boolean not null default false);
-- status: read, handoff, waiting_hospital, tossed, unknown_number

create table biscuit_cam (
  household_id uuid primary key references biscuit_household(id) on delete cascade,
  region jsonb not null, set_at timestamptz not null, test_status text not null default 'pending',
  last_motion_at timestamptz, sam_calls_today int not null default 0, sam_day date, paused boolean not null default false);
```

What is never stored on the server: images, audio, a letter's transcription or text, Rosa's spoken words, the Waive case token. `biscuit_event.data` holds at most a few short fields (a letter id, a battery level, a sender name). Rows exist only while the household does.

## 8. API

All routes under `/api/biscuit`. Device routes take `Authorization: Bearer <device token>`. Ana routes need a Kindred session. JSON unless noted; images and audio as `multipart/form-data`.

Device (Rosa's phone or the mailbox phone):

- `POST /link/claim {code}` → `{deviceToken, household: {called, language}}`; 410 on expiry, 429 after three tries.
- `POST /asr` audio/webm or audio/mp4 (≤ 15 s) → `{text}`.
- `POST /letter/frame` JPEG (≤ 300 KB) → `{ok, coverage, cutEdge}`.
- `POST /letter/read` JPEG (≤ 2 MB) → `{transcription, facts: [{field, value, quote, verified}], kind, sender, hospital: {ccn, name} | null}`.
- `POST /letter` summary → `{id}` (only when `share_letters`); `PATCH /letter/:id {status | answers | hidden}`.
- `POST /question {kind, known}` → `{questions: [{id, text}]}`.
- `GET /sheet?ccn=` → the Waive sheet subset `{hospital, freeCare: {rule, quote, thresholds}, discounts, url, checkedAt}` or 404.
- `POST /handoff {letterId, ccn}` → `{waiveUrl}`.
- `POST /events {kind, data}`; `GET /docket` (Ana-shared view of the phone's own list, used after a reinstall).
- `POST /push/subscribe {subscription}`.
- `POST /cam/find` JPEG plus `prompt=mailbox` or `point=x,y` → `{box, mask}`; `POST /cam/frames` three JPEGs → `{seen: string | null}`; `POST /cam/heartbeat {battery, charging}`; `POST /cam/region {region}`; `POST /cam/test {result}`.
- `DELETE /household`.

Ana (Kindred session):

- `POST /household` → `{id}`; `GET /family` → everything the family page shows; `POST /link/new {kind}` → `{code, expiresAt}`; `POST /help/test`; `POST /push/subscribe`; `POST /push/ack {eventId}` (from the service worker); `POST /cam/pause`, `POST /cam/resume`; `DELETE /household`.

Limits: 60 requests a minute per device token, 20 `letter/read` an hour per household, 400 SAM calls a day per household, image and audio size caps above. Every relay logs model, latency and token counts, never content.

## 9. Model contracts

### 9.1 Spark 1.3, letter reading (two calls, Standard mode, temperature 0)

Call one, transcription: the image and the instruction to transcribe every printed word in reading order, keeping line breaks, writing numbers exactly as printed, and adding nothing. Output: plain text.

Call two, extraction, with structured output on this schema:

```json
{ "kind": "bill | notice | utility | ad | other",
  "sender": {"value": "", "quote": ""},
  "hospital_name": {"value": "", "quote": ""} ,
  "amount_due": {"value": "", "quote": ""},
  "statement_date": {"value": "", "quote": ""},
  "due_date": {"value": "", "quote": ""},
  "financial_assistance": {"value": true, "quote": ""},
  "phone_numbers": [{"value": "", "quote": ""}],
  "account_last4": {"value": "", "quote": ""} }
```

Every field is nullable. The prompt states that each quote must be copied exactly from the transcription. The API then verifies each quote itself (9.2); the model's claim is never trusted.

### 9.2 Verification

`verify(quote, transcription)`: both sides are normalised (NFKC, curly quotes and dashes straightened, soft hyphens removed, whitespace collapsed, case kept) and the quote must be a substring of the transcription. A fact is `verified` only then. The speech composer takes verified facts only; a number that appears in speech must appear inside a verified quote. This is the same rule Tender uses in `verify.ts`, re-implemented here with its tests.

### 9.3 Spark 1.3, questions and speech

Questions are chosen, not written. The fixed list: Q1 "Is this the first bill for this visit?" (bill); Q2 "How many people live with you?" (bill with a hospital sheet); Q3 "Is Social Security your only income?" (bill with a hospital sheet); Q4 "Did you already pay this one?" (utility, bill); Q5 "Do you know this company?" (unknown number); Q6 "Shall I toss it?" (ad). Spark picks at most two by kind and known answers through structured output `{questions: ["Q1", "Q3"]}`. Spoken lines are templates filled with verified values; Spark writes no free speech in the MVP.

### 9.4 Muse Voice Transcribe

`POST /v1/asr/transcribe` with the clip, the household language and a keyword list: "Biscuit", "stop", "yes", "no", "help", "Medicare", "Social Security", the hospital names in `hospitals.json` for the household's state. Clips are discarded after the call. Streaming (`wss /v1/asr/realtime`) is a Should.

### 9.5 SAM 3.1

Text prompts, one noun phrase per request: "mailbox" (setup), "letter" (frame check), "mail carrier", "mailbox door", "envelope" (watching and the envelope test). Point prompt for Ana's tap. Thresholds: setup accepts the highest-scoring box with score ≥ 0.5; the letter check needs coverage ≥ 0.35 and no edge contact; watching needs one hit at score ≥ 0.5 in three frames. Images are resized on the phone (long side 1280 for SAM, 2000 for Spark).

### 9.6 Costs and caps

| Call | Price | A mail day with three letters |
|---|---|---|
| Spark 1.3 transcription plus extraction | $1.25 in, $4.25 out per M tokens | about 3 cents |
| Voice Transcribe, six clips | $0.18 an hour | under 1 cent |
| SAM 3.1, 20 frames | $2.50 per 1,000 images | 5 cents |
| Whole build, dev runs included | | under $15 of the $150 Meta credit |

Baseten ($100, `meta-models/muse-spark-open-1026`): a Should, a second reader whose amounts and dates must agree with Spark 1.3 before a number is spoken, behind `READER_SECOND=baseten`, and only if the dashboard shows per-token billing. Modal and Fireworks credits are not approved; nothing depends on them.

## 10. Failure paths (from the Flow board)

MVP, implemented and tested: code didn't match and expiry; voice check miss; "No" at consent; Help test not received; camera refused; mailbox not found, wrong box, tap; envelope test not seen; battery low, paused, offline; mail motion with nothing recognised; letter cut off and Take it anyway; unreadable letter; no Waive sheet or no hospital match; Help cancelled; stop at any time; delete.

Should: three voice misses to buttons mode; four mail days with no delivery prompting a re-test; not-picked-up reminder at 6 pm; "don't share this one".

## 11. Privacy and safety rules

1. Rosa has no account. Her phone holds a device token only.
2. Consent is Rosa's spoken or tapped yes after Biscuit reads what he will do; only the time is kept.
3. The server stores letter summaries, event times and the camera region. Never images, audio, transcriptions or spoken words.
4. The mailbox phone looks only at the confirmed box region; frames leave only on motion, are checked, and are discarded. Nothing is recorded or streamed.
5. Biscuit speaks a number only inside a verified quote. Estimates are labelled Derived and end with "The hospital decides."
6. Biscuit sends nothing to a hospital. Ana approves every application in Waive.
7. Help opens the phone's own emergency call. Biscuit never dials by itself, never speaks on the line, and tells family by notification only.
8. One tap deletes everything, on Rosa's phone or on Ana's page.
9. Meta calls use Standard mode, never Contributor.
10. No background listening and no wake word. Biscuit listens after a chime or a tap, and stops at "stop".

## 12. Testing and QA

Unit (vitest, no network): `verify` with typography cases; speech composer never emits a number outside a verified quote; link codes (expiry, tries, reuse); region padding and normalisation; motion detector against fixture frame pairs; hospital matcher against twenty names; question picker by kind.

Contract tests with recorded Meta responses (fixtures captured on Day 1 and committed without any letter content; the test letters are synthetic): the three relays parse real response shapes; a changed shape fails loudly.

Device QA script (docs/qa.md), run on an iPhone (Rosa) and an Android phone (mailbox phone) with Ana on a laptop, twelve steps from sign-in to delete, each with its pass line and a latency column. Run three times on Day 3; every failure gets a fix or a documented limit before the video.

## 13. The plan

Working days of about twelve hours. Dates are the founder's; the hackathon deadline is Wednesday, November 4, 9:00 PM ET.

Day 1 (foundation and the letter core)
- 3 h: repository, Vite PWA with the three surfaces, Hono API, drizzle schema and migration, vitest; Vercel project with the rewrite; Cloud Run service and the `biscuit` database; biscuit.kindred-ai.dev live with a hello page.
- 2 h: the three Meta relays with fixtures and contract tests; `MODEL_API_KEY` and VAPID keys in Cloud Run.
- 3 h: Rosa's Home and the Talk loop: record, ASR, templated reply, `speechSynthesis`.
- 4 h: Show me the letter with the SAM frame check; `letter/read` with the two Spark calls; `verify`; Reading screen; speech composer and its tests.
- Cut line: if the SAM frame check is not stable by 20:00, Take it anyway becomes the default and the check stays as a hint.

Day 2 (hand-off, Ana, the mailbox phone)
- 4 h: questions, `hospitals.json` and the matcher, the Waive sheet relay, the offer, `handoff`, the docket on the phone and the summaries on the server.
- 4 h: Kindred ID verifier, household and link codes, Ana's A1 to A3, Rosa's R1 to R3, the family page with polling, web push on both phones with the service worker and the ack.
- 4 h: /cam: join, live view, find with SAM text and point prompts, region, envelope test, watching with motion, heartbeat, battery, `mail_seen` to push to chime.
- Cut line at 20:00: camera stays "test pending" and the chime is demonstrated from the tap fallback.

Day 3 (Help, failure paths, QA)
- 2 h: Help: hold, event, push, `tel:911`, E1 and E1b, the test to Ana's page and its ack; consent screen R3 wired to `consented_at` and `share_letters`.
- 3 h: every MVP failure path of section 10; delete; caps and limits.
- 5 h: three runs of the QA script on real phones; fixes; latency measured against section 2.
- 2 h: README with the disclosure table (what was built when, which Meta models where, limits), the privacy section from section 11, and the one-paragraph "how to install".
- Should items only after the QA runs pass.

Day 4 (submission)
- Video, 3 minutes, from the deployed site: 0:00 Rosa and the mail problem; 0:25 the mailbox phone sees the mail, the chime; 0:50 reading the bill with quotes; 1:30 the question and the offer; 1:55 the Waive case and Ana's page; 2:25 Help; 2:45 the models and what is kept. Recorded with two phones and a laptop, one take per segment.
- Repository public; README checked against the rules (hackathon-built work only, model disclosure); credits claimed; the Cerebral Valley form submitted; the deployed site rechecked after submission.

## 14. Decisions

- A web app, installed from a link, not a native app: judges open a link; there is no store path in three days; the Home Screen install gives push on iOS.
- The mailbox camera is any spare phone running /cam: no hardware, no Bluetooth, no Wi-Fi onboarding; what is lost is pan and tilt, replaced by Ana pointing the phone and SAM finding the box.
- Help calls 911 through the phone's own emergency sheet and tells family by notification. No family call chain, no neighbour, no model on the path.
- Physical mail is the trigger. Informed Delivery is a stretch for later, because the senior does not use email and the enrolment needs an identity check.
- Biscuit never duplicates Waive: it reads Waive's sheet, hands Ana to Waive's own start page, and shows Rosa only the case status.
- Batch transcription per clip instead of streaming: simpler and robust in three days; streaming is a Should.
- Spark chooses questions from a fixed list and fills speech templates; no free-form speech, so the verifier can hold.
- The hospital list ships in the repository from CMS public data; no lookup service.
- One database on the existing Cloud SQL instance, new database name, all tables prefixed; nothing shared with Tender or Waive.
- Rosa's docket lives on her phone; the server keeps summaries only while `share_letters` is true.
- Ana's page polls; no sockets.

## 15. Needs the founder (before or on Day 1)

- DNS: CNAME biscuit.kindred-ai.dev to Vercel.
- The Meta Model API key, the Baseten key, and a check that the Baseten model bills per token.
- A Vercel project and a Cloud Run service in the Kindred GCP project; the `biscuit` database on the Cloud SQL instance.
- VAPID keys (generated once, stored in Cloud Run env).
- Two phones for QA and the video: an iPhone for Rosa, an Android phone as the mailbox phone, both with Chrome or Safari current.
- A synthetic hospital bill for the demo, printed, with a Mass General or another Waive-published hospital name.
