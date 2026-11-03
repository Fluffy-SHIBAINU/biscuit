# The demo video (November 3, 2026)

Three minutes, 1920 by 1080, for the Meta Global AI Developer Hackathon submission (November 4, 9 PM ET). Everything on
screen is the deployed product at biscuit.kindred-ai.dev, recorded by `video/record.mjs` (Playwright driving Chromium as
an iPhone against production, and as a laptop against the local server for Ana's page); Biscuit's lines are his own
voice (Gemini text-to-speech, Fenrir, through the speak route); Rosa's lines are handed to the ear as text by the
recorder (the same router real speech takes) and shown as captions. Assembled with Remotion in `video/`.

## The story in one line

A daughter sets Biscuit up in twenty minutes; her mother just talks to him; a hospital bill becomes a Waive case under
the hospital's own rule, and the daughter gets the break Medicare owes her through Lull.

## Scenes and lines

| # | Time | Scene | On screen | Said |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Cold open | iPhone, Mail's Here | Biscuit: "Woof! Mail's here, Rosa. Shall I look?" "Say yes, or not now." Rosa (caption): "yes". |
| 2 | 0:10–0:21 | Why | Title card | Biscuit: "Rosa is seventy-eight and lives alone. She gets mail she can't read, and bills she may not owe. Ana lives across town." |
| 3 | 0:21–0:29 | Ana's setup | Ana's laptop: Who Biscuit Helps, the code for Rosa's phone | Biscuit: "Ana sets me up once. Twenty minutes." |
| 4 | 0:29–0:46 | Rosa's setup | The code, Say Hello, her yes read aloud, Help, Ready (four steps, captions) | — |
| 5 | 0:46–2:04 | Rosa just talks | Read a New Letter for Me; the frame checked; the picture; This Is a Bill; The Letter Says; Next; the two questions by voice; the offer with the hospital's quoted rule; Yes, Start It with Ana; Sent; My Mails | Biscuit live, in order: "Show me the letter." "Got it! One moment while I read." "This is a bill." "Is this the first bill for this visit? Say yes, no, or not sure." "Did you already pay this one?" "Massachusetts General Hospital gives free care to households…" "The hospital decides." "I can start the application with Ana. Shall I?" "Done! Ana has it on her page." "Today you got one mail." Rosa (captions): "not sure", "yes", a tap on Yes, Start It with Ana. Callouts: SAM 3.1 checks the frame; Muse Spark 1.3 reads the page; every number inside a quote from the page; Muse Voice Transcribe turns her words into text; the hospital's own rule, from Waive; handed to Ana. |
| 6 | 2:04–2:12 | Ana's page | Welcome, Ana, with Rosa; the bill under Today in Rosa's words; the calendar dot | Biscuit: "Ana sees what I read, in Rosa's own words." |
| 7 | 2:12–2:20 | Waive | Massachusetts General Hospital's own rule in Waive | Biscuit: "Waive holds the hospital's own rule, and starts the application." |
| 8 | 2:20–2:25 | Lull | The break you're owed: the Medicare programs that cover a caregiver's break | Biscuit: "Lull gets the family its break." |
| 9 | 2:25–2:30 | The mailbox | Mailbox Status on Ana's page | Biscuit: "A spare phone on the sill watches the box. Nothing is recorded." Callout: SAM 3.1 watches the box. |
| 10 | 2:30–2:59 | A companion, and Help | "Biscuit, remind me about my pills at eight." (caption); his answer; Settings shows the reminder; Pause; the Help hold; Ana knows | Biscuit: "I will chime at eight for your pills." "Ana knows." |
| 11 | 2:59–3:07 | Close | End card: biscuit.kindred-ai.dev, open source, Meta models in the live path | Biscuit: "I'm Biscuit, from Kindred. Ask me to read your mail." |

Total 3:07 (181.6 s). Timings come from `video/public/timeline.json`, built by `video/build-timeline.mjs` from the
recorder's `events.json`; a re-recording moves them.

## The pipeline

1. `node record.mjs [scene…]` (scenes: ana-setup, rosa-setup, rosa-loop, rosa-companion, ana-page). Chromium with a
   canvas camera showing `assets/bill.png`; the ear in scripted mode (`earMode: "scripted"` in the phone's storage), so
   Rosa's words go in through `window.biscuitHear(text)` once `window.biscuitMuted()` is false. Every line Biscuit asks
   the speak route for is logged and its clip fetched into `audio/`; every clip start is logged from the page (an
   `AudioBufferSourceNode.start` hook); marks name the moments the composition cuts on.
2. `node narrate.mjs`: the narration lines in his own voice, through the speak route, into `narration.json`.
3. `node build-timeline.mjs`: segments, captions, callouts and audio, times in seconds, into `public/timeline.json`;
   media copied under `public/`. Only the latest line sounds on the phone, so a line asked for well before another
   line's clip started is dropped (the camera page's "That's it! Hold still." under "Got it!").
4. `npx remotion render src/index.ts Demo out/biscuit.mp4 --browser-executable=<Playwright's Chromium>`: the headless
   shell cannot decode the recordings; Playwright's full Chromium can.

## Rules

The video uses what is deployed, never a local build (Ana's page is the local server over the production database,
same code). No line is dubbed over a screen that did not say it. Rosa's words are captions, never a synthetic voice.
