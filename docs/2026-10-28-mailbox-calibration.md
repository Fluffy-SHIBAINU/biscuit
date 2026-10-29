# Biscuit: calibrating the mailbox watcher on a real mailbox

## 0. Tonight, before bed (October 28): set the camera for tomorrow's delivery

Production has no household yet, so this is the whole setup. Fifteen minutes with three devices.

1. **Laptop, Ana's page:** https://biscuit.kindred-ai.dev/ana. Sign in with Google **as i.shawn.yoon@gmail.com** (that is
   the address `CAM_COLLECT_OWNER` names; another account would watch fine but keep no frames). Describe who Biscuit
   helps; read the six-digit code.
2. **iPhone (Rosa):** open https://biscuit.kindred-ai.dev in Safari, Share, Add to Home Screen, open Biscuit from the
   icon (the install is what lets it chime), type the code, say or tap yes at consent. On Ana's page tap "Get notified
   on this device"; on the iPhone tap "Send a test to Ana's page" and check the laptop buzzes. The mail chime arrives
   as a push to this installed app; keep the iPhone on Wi-Fi and not in Low Power Mode.
3. **Laptop:** Next: the mailbox phone; read its code.
4. **Android (the mailbox phone):** open https://biscuit.kindred-ai.dev/cam?collect=1, type the code, allow the
   camera, prop it on the sill facing the box, Find my mailbox, Yes, that's it (or Draw the box myself). The phone goes
   straight to Watching, which must say "Collecting". The envelope test is optional since October 29: Test it on the
   Watching screen, open and close the lid once, "Works." within 60 seconds, Back to watching.
5. **Leave it:** plugged in, screen on (the page holds a wake lock; turn off the phone's auto-lock to be sure), the
   box lit if a porch light exists. Headlights on a window are the main false alarm; each movement costs six SAM calls
   in collect mode and the day's cap is 800 (the day turns at 8 PM Eastern). If the screen says "Paused" in the
   morning, tap "Find the mailbox again" and confirm the box: that clears the pause.
6. **Tomorrow:** when the carrier comes, the iPhone chimes "You've got mail, Rosa." and Ana's page says "Mail came."
   Then section 2 below, from step 5, for the labels and the calibration report.


The watcher's model, SAM 3.1, is not trained here: it is Meta's segmentation model served by the Meta Model API, and it
finds "mail carrier", "person", "mail truck" and "envelope" by name (until October 29 the set was "mail carrier", "mailbox door", "envelope"). What a day at a real mailbox can tune is the decision layer
around it: which prompts to ask, the score at which an answer counts, and how much movement the phone needs before any
frame leaves it. This document is the run for the founder's second phone and the tools that turn its frames into those
three numbers.

## 1. What collect mode is

Normally a mailbox frame goes to SAM and is gone. In collect mode the phone keeps asking for the same thing, and the
server keeps each movement's three frames with the score every prompt gave the first frame, the prompt that fired, and the
motion level that tripped the gate. Two locks, both explicit:

- the server keeps frames only for the household whose owner `CAM_COLLECT_OWNER` names (production: the founder's email);
- the phone must ask on every send (`collect=1`), which it does only after the page was opened as `/cam?collect=1`;
  `/cam?collect=0` turns it off. The Watching screen shows a "Collecting" card the whole time.

Frames are kept in `biscuit_cam_sample` (migration `drizzle/0003_fair_the_fury.sql`) and are deleted with the household.
They are read by the owner's own scripts and shown on the household's own family page, in the "Who was at the box" strip,
where a tap labels them. In collect mode every prompt is scored on the first frame, so a movement costs at least six SAM
calls instead of one to nine; the daily cap of 800 still applies.

**Since October 29 collect mode is no longer the only way frames are kept.** Any household whose Ana turns on "Keep short
clips of the box for me to check" keeps, for each movement, a clip row (`clip = true`): the three watch prompts' scores on
the first frame and up to eight small crops of the box region over six seconds, with a 7-day retention when unchecked and
30 days after a tap. Ana's taps (Mail carrier, Not mail, Someone else) store `carrier`, `nothing` and `other`, the same
words as the sheet below, so `samples.ts` and `calibrate.ts` read them unchanged; "Skip" stores `skip` and counts as
unlabelled. From eight taps the household's own floor and gate are computed by the rules of section 3 and applied
automatically. Collect mode stays what it is: the founder's full frames, six prompts, kept with the household and outside
that retention. A second choice, "Help improve Biscuit for everyone", lets tapped clips into a de-identified export. All of
it: `docs/2026-10-29-mailbox-clips.md`.

## 2. The run (second phone, at the mailbox)

Before the run, from the repo: `npm run db:migrate` (adds the sample table; the agent could not apply it), then deploy.

1. Laptop: `/ana`, Next: the mailbox phone; read the code.
2. Second phone: open `https://biscuit.kindred-ai.dev/cam?collect=1`, type the code, allow the camera, point it at the
   mailbox, Find my mailbox, Yes, that's it (or Draw the box myself); it watches at once. The envelope test is optional:
   Test it, open and close the lid (QA steps 6 and 7).
3. Watching: the screen must show "Collecting" and "kept for calibration" next to the frame count.
4. Make the mailbox move, with a pause between events for the motion cooldown (since October 29: 5 seconds after a sighting, backing off to 15, 30 and 60 seconds while sends see nothing, reset by a sighting or two quiet minutes; before that a flat 90 seconds):
   - open the lid, put an envelope in, close it: 5 times (the "mail" label);
   - open the lid and close it, nothing left: 3 times ("carrier");
   - walk past, wave a hand near the box, park a car or let a shadow cross, nothing touching the box: 5 times ("nothing");
   - then leave it watching for an hour: whatever it sends in that hour is the ambient false-alarm rate.
   Rosa's phone (the iPhone) should chime "You've got mail, Rosa." on the mail events: QA step 8.
5. Laptop, in the repo: `npx tsx scripts/cam/samples.ts` writes `synth/cam/samples.json` and `synth/cam/sheet.html`.
   Open the sheet, label every movement, Download labels.json into `synth/cam/`, then
   `npx tsx scripts/cam/calibrate.ts` prints the report and writes `synth/cam/calibration.md`.
   `npx tsx scripts/cam/samples.ts --save` stores the labels on the rows.
6. Second phone: open `/cam?collect=0` to stop keeping frames.

## 3. What the report says

For each prompt: the lowest score floor at which it raised a false alarm on at most one movement in ten, and how much of
the mail it saw at that floor. The suggested set is every prompt that saw at least half the mail, each at its own floor,
scored together. Today's watcher (the three prompts at 0.5) is scored the same way for comparison. The motion gate
suggestion is the level nine mail events in ten still clear, never below today's 12, with the share of non-events it
would have kept on the phone.

Applying it across every household is three edits: `WATCH_PROMPTS` and the default floor in `server/cam.ts`, the default
threshold in `src/cam/motion.js`. For one household's own box the floor and gate now follow from Ana's taps without an
edit (`server/clips.ts`, `docs/2026-10-29-mailbox-clips.md`); this script remains the founder's view across the six
prompts, which the automatic path does not choose between.

## 4. Honest limits

One mailbox, one phone position, one day. The numbers fit that box and should be reapplied for another. A learned
classifier on a few hundred frames of one box would fit the box, not mail; the decision layer is the honest thing to tune.
