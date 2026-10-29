# Biscuit: mailbox clips, Ana's taps, and what they teach (October 29, 2026)

The founder asked: "are we having clips from the camera for mailbox scanning? if not we should and try to let the users
select which one is the mailman by tapping and use that to train their own account and our overall model." Until today
the mailbox phone kept nothing: frames left on motion, SAM 3.1 checked them, they were gone, and the one exception was
the founder's own household under collect mode. This document is what changed, stated exactly, because the words on the
phone, on Ana's page and in the README now promise it.

Nothing is trained in this work. The taps tune the decision layer around SAM 3.1 for one mailbox, the way
`scripts/cam/calibrate.ts` did offline for the founder's frames, and a de-identified export is written for a later model.

## 1. What is kept, and only then

Two choices, both on Ana's family page in the Mailbox phone card, both off until she turns them on.

**Keep short clips of the box for me to check.** From the mailbox phone's next heartbeat (within a minute), each movement
at the box that passes the phone's motion gate keeps one row in `biscuit_cam_sample` with `clip = true`:

| Kept | Exactly |
|---|---|
| Scores | SAM 3.1's score for each watch prompt ("mail carrier", "mailbox door", "envelope") on the first detection frame, three decimals; 0 where nothing was found. |
| Seen | The prompt that fired at the household's floor, or none. |
| Level | The motion level that tripped the gate (mean absolute grey difference over the region, the phone's own number). |
| Frames | Up to 8 crops of the confirmed box region, 320 pixels wide, each under 60 KB on the phone (the server refuses more than 64 KB or more than 8), taken over 6 seconds from the moment of motion by `startWatcher` in `src/cam/watch.js`, uploaded once to `POST /api/biscuit/cam/clip/:id` within ten minutes of the movement. |
| Time, device | When, and which mailbox phone. |
| The tap | Ana's label (`carrier`, `nothing`, `other`, or `skip`) and when she tapped. |

Not kept: anything outside the box region, the full frame, the 640-pixel detection frames (checked and discarded as
before), the envelope test's frames, audio (the phone records none), and anything at all for a household that has not
turned this on. The chime never waits for the clip: the three detection frames go first and the clip follows.

**Help improve Biscuit for everyone.** Can be turned on only while clips are kept. The clips Ana tapped may then be
exported, de-identified (section 5), and stay past the 30 days until she turns it off.

## 2. Who sees it

Ana, signed in with Kindred ID as the household's owner, on her family page: the strip "Who was at the box" shows every
kept movement that has frames, as a filmstrip of the box region, the unchecked ones first. The mailbox phone's screen
says "Keeping short clips of the box for Ana to check" the whole time, and the Mailbox phone card on her page changes its
footer from "frames checked, then discarded" to the clip words. Rosa's phone shows no clips. The founder's export script
sees only the tapped clips of households with the second choice on, and only hashed. Nobody else.

## 3. Retention

Runs on the chime tick (`POST /api/biscuit/chime/tick`, every ten minutes from the GitHub Actions schedule), after the
chime and never in its way: `retireClips` in `server/clips.ts`. It touches rows with `clip = true` only; the founder's
collect-mode frames are deleted with the household, as before.

| Clip | Goes |
|---|---|
| Unchecked, or skipped | 7 days after the movement |
| Tapped (Mail carrier, Not mail, Someone else) | 30 days after the tap, unless the household has "Help improve Biscuit" on |
| Tapped, "Help improve Biscuit" on | When Ana turns that off (then 30 days from the tap applies again), or with the household |
| Keep clips turned off | At once: every clip, or only the unchecked ones while "Help improve Biscuit" is still on |
| Any | With the household: one tap deletes everything |

The numbers the taps taught (the floor, the gate, the counts behind the result line) stay when clips are turned off:
they are numbers, not pictures.

## 4. What the taps teach one mailbox

`PATCH /api/biscuit/family/clip/:id` stores the label and recomputes the household's settings from every tap it has
(`tuneHousehold`, `server/clips.ts`); the result lives on its `biscuit_cam` row (`floor`, `gate`, `tuning`). Rules, the
same as the offline calibration script's, with the guards a self-applied setting needs:

- Nothing changes below 8 taps. A skipped clip is not a tap.
- **Floor** (the SAM score at which an answer counts, default 0.50): needs at least 3 deliveries and 3 non-deliveries.
  The lowest floor on the grid 0.30 to 0.90 at which the three watch prompts, scored together on the first frame, raise
  a false alarm on at most one non-delivery in ten. Not applied if it would catch fewer than half the deliveries.
- **Gate** (the motion the phone needs before any frame leaves it, default 12): needs at least 3 deliveries. The level
  nine deliveries in ten still clear, rounded to a tenth, never below 12.
- Where a rule is not met, the default stays and the result line says so.

Applied where it acts: `POST /api/biscuit/cam/frames` judges every prompt at the household's floor, and both it and the
heartbeat return the gate, which `applyGate` in `src/cam/watch.js` sets as the phone's motion threshold (raised or
lowered back to 12 when the gate is gone). Ana sees one line, for example "From your 14 taps: the carrier shows at score
0.62 or more; 3 of 3 deliveries caught, 1 of 11 false alarms left." "Caught" means a tapped delivery that would chime
under the settings in force: its level clears the gate and its best first-frame score clears the floor.

Honest limits: the scores are the first detection frame's, so a delivery SAM only saw on the second or third frame
counts as missed here even though it chimed. The prompt set is fixed; the taps move the floor and the gate, not the
words. Lowering the floor below 0.50 needs the same evidence as raising it (three non-deliveries that stay quiet at the
lower floor), so a household with no false alarms at all gets a floor of 0.30 from its first eight taps, which is what
the data says and what a label at 0.30 would correct.

SAM cost: an opted-in household scores the three watch prompts on the first frame of every movement (three calls, where
an immediate hit used to cost one), then the usual cascade on the other frames if nothing fired. The daily cap of 800
and the pause above it are unchanged.

## 5. The overall model: the export, and what it becomes later

`npx tsx scripts/cam/export.ts [--out synth/cam-labels]` writes, for every household with "Help improve Biscuit" on,
every tapped, real (not test-run) movement:

- `<hash>/<sample>-<n>.jpg`: the box-region crops, as the phone sent them;
- `labels.jsonl`: one line per movement: `household` (sixteen hex characters of a salted SHA-256 of the household id;
  stable across exports, not the id, not reversible), `sample`, `at` (the hour, UTC), `label`, `positive` (mail or
  carrier), `level`, `seen`, `scores`, `frames` (the file paths);
- `manifest.json`: counts by label, households, movements, frames, the export time.

Not in it: the household id, the device, any name, any address (Biscuit stores none), the minute, the full frame,
anything from a household without the second choice, anything unchecked or skipped. `/synth/` is ignored by git; the
export is never committed.

How it becomes training data, later and not here: the set is small images of one kind of scene with a three-way label.
Two honest routes, to be measured the way Kindred's reader was (`docs/2026-10-28-kindred-reader.md`), on held-out
households, never on the household it was fitted to:

1. **A SAM prompt set across households.** Run the calibration method over the pooled set: for candidate prompt lists
   (the three watch prompts, plus "person", "hand", "package" where collect-mode rows carry them) and floors, the hit
   rate on deliveries and the false-alarm rate on everything else, per household and pooled. If one list and floor beats
   today's three-at-0.50 on households it never saw, it becomes the default for new households; each household's own
   taps still override it. No weights, so nothing to serve.
2. **A small classifier on the crops.** Carrier against everything else on the 320-pixel crops (a few thousand
   parameters, or a frozen image encoder and a linear head), scored on held-out households. It would take a seat only
   under the same rule as Kindred's reader: not more false alarms than the prompt set on households it never saw, and
   never alone, since SAM's score stays the first word and the classifier can only hold a chime back or ask for it.

Either way the frames stay what they are: the box region, seconds long, from households that said yes twice.

## 6. Rulings made in this work

- Clips are a second, separate row from collect mode. The founder's household keeps full frames under collect mode and
  gets no clip row for the same movement; the strip still shows those frames and the taps still label them.
- The clip follows the detection: three frames go at once as before, the eight small frames over six seconds follow and
  fill the row the reply named. The chime is not delayed for opted-in households.
- Only the three watch prompts are scored for clips (collect mode scores six): the taps tune a floor and a gate, and
  three calls a movement is the cost that fits an 800-a-day cap.
- The envelope test keeps no clip.
- "Mail carrier" stores `carrier`, "Not mail" stores `nothing`, "Someone else" stores `other`, so the contact sheet and
  `calibrate.ts` read Ana's taps unchanged; "Skip" stores `skip` and counts as unchecked everywhere.
- The strip shows at most 8 clips, unchecked first, newest first, and skipped ones never; it loads apart from the
  30-second poll and refreshes when the count of unchecked clips changes.
- "Help improve Biscuit" needs "Keep clips" on to be turned on; turning "Keep clips" off leaves it as it was and spares
  the tapped clips while it is on.
- Retention rides on the chime tick rather than a new schedule; a failure there is logged and the chime still goes out.
- The floor and gate are `double precision` so 0.6 reads back as 0.6; `level` stays `real`.
- Every send now carries the motion level, not only collect mode's: the gate is tuned from it.

## 7. Tests, migration, deploy order

Tests: `tests/clips.test.ts` (the rules), `tests/cam.clips.test.ts` (the frames and clip routes with a fake store),
`tests/ana.clips.test.ts` (the consents, the strip, the taps, the real store, retention, against the database),
`tests/watch.test.js` (the burst and the gate on the phone), `tests/clips.lib.test.js` (the words), `tests/export.test.ts`
(de-identification). The migration is `drizzle/0005_medical_firestar.sql`: nine added columns, nothing dropped. It was
generated and not applied; apply it before deploying (`npm run db:migrate`, then `./deploy.sh`), since the family page
and the frames route select the new columns.
