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
| Scores | SAM 3.1's score for each watch prompt (since October 29 "mail carrier", "person", "mail truck", "envelope"; before that "mail carrier", "mailbox door", "envelope") on the first detection frame, three decimals; 0 where nothing was found. |
| Seen | The prompt that fired at the household's floor, or none. |
| Level | The motion level that tripped the gate (mean absolute grey difference over the region, the phone's own number). |
| Frames | Up to 8 crops of the confirmed box region, 320 pixels wide, each under 60 KB on the phone (the server refuses more than 64 KB or more than 8), taken over 6 seconds from the moment of motion by `startWatcher` in `src/cam/watch.js`, uploaded once to `POST /api/biscuit/cam/clip/:id` within ten minutes of the movement. |
| Time, device | When, and which mailbox phone. |
| The tap | Ana's label (`carrier`, `nothing`, `other`, or `skip`) and when she tapped. |

Not kept: anything outside the box region, the full frame, the 640-pixel detection frames (checked and discarded as
before), audio (the phone records none), and anything at all for a household that has not
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

- Nothing changes below 8 taps. A skipped clip is not a tap; a Not right is.
- **Floor** (the SAM score at which an answer counts, default 0.50): needs at least 3 deliveries and 3 non-deliveries.
  The lowest floor on the grid 0.30 to 0.90 at which the watch prompts, scored together on the first frame, raise a
  false alarm on at most one non-delivery in ten. Not applied if it would catch fewer than half the deliveries.
- **Gate** (the motion the phone needs before any frame leaves it, default 12): needs at least 3 deliveries. The level
  nine deliveries in ten still clear, rounded to a tenth, never below 12.
- Where a rule is not met, the default stays and the result line says so.

Applied where it acts: `POST /api/biscuit/cam/frames` judges every prompt at its floor, and both it and the heartbeat
return the gate, which `applyGate` in `src/cam/watch.js` sets as the phone's motion threshold (raised or lowered back to
12 when the gate is gone). Ana sees one line, for example "From your 14 taps: the carrier shows at score 0.62 or more;
3 of 3 deliveries caught, 1 of 11 false alarms left." "Caught" means a tapped delivery that would chime under the
settings in force: its level clears the gate and its best first-frame score clears the floor.

### 4.1 The guess on every clip (October 29, later)

As a clip is made, `guessLabel(scores, tuning)` in `server/clips.ts` says what Biscuit thinks it shows, and the row
keeps it (`guess`: label, confidence, the prompt it rests on, the rule's version). The card says it in her words,
"Biscuit Thinks It Was the Mail Carrier", and makes that answer the dark button, so one tap confirms and another
corrects; the number ("Guess: carrier · 80% · rests on “envelope”") is under the card's Details.

- The mapping, before the taps say otherwise: "mail carrier", "mail truck" or "envelope" above its floor means the
  carrier, the strongest of them carrying the guess; "person" alone above the floor means someone else; nothing above
  the floor means not mail.
- The confidence is the margin: a score at the floor is 50 percent, at 1.0 it is 100 percent, scaled between; for a
  quiet clip, how far under the floor the best score sits. It is multiplied by the prompt's record at this box (below)
  and never shown above 95 percent, because a score is not a certainty.

### 4.2 What each prompt has earned here

With the taps, `tuning.prompts` keeps a record per prompt, and one for the quiet clips ("none"): how many of the clips
whose guess rested on it Ana checked (a tap, or Not right), how many she tapped as the prompt predicted, the precision
that gives, and two things it can change:

- **The mapping follows the taps.** From 8 taps, when at least 3 of her taps on clips that rested on a non-carrier
  prompt agree by a strict majority on another answer, that is what the prompt means at this box: "person" at a box
  where the carrier walks up means the carrier; at a box where a neighbour passes it means someone else, or no mail.
  Carrier prompts keep their meaning; their failures are score problems, handled by the floor. A prompt whose learned
  meaning is not the carrier no longer chimes "mail came" on its own; the default meaning of a person is a guess, not a
  lesson, so until the taps say otherwise a person at the box still chimes.
- **A prompt Ana keeps correcting gets a higher floor and a lower confidence.** Right less than half the time over 3 or
  more clips: its own floor becomes the lowest grid value above the household's at which it is right at least half the
  time, else 0.90; and every guess on it is multiplied by (agreed + 1) / (checked + 1).

Only Ana's taps teach. Clips Biscuit classified itself are counted apart (`tuning.auto`: how many, how many she
corrected) and never raise a prompt's own record. A Not right counts against the prompt; a tap after it is the final
word.

### 4.3 When Biscuit classifies a clip itself

`autoClassifies(guess, tuning)`: the household has at least 20 taps, the prompt the guess rests on has been right at
least nine times in ten over at least 10 checked clips, and the guess is at 90 percent or more. Then the clip is made
with the label already on it and `labelledBy = "biscuit"`, and goes straight to "Already classified · by Biscuit", where
a single Not right takes the label off, marks the guess rejected, hands the clip back to "Needs your attention" and counts
as a tap against the prompt; "Yes, right" is a tap for it. Everything else waits for Ana.

This is a decision layer tuned on one mailbox, not a trained model: four scores from SAM 3.1 read through a handful of
numbers on the household's camera row. It can be wrong in the ways those numbers allow, and the record says how often.

Honest limits: the scores are the first detection frame's, so a delivery SAM only saw on the second or third frame
counts as missed here even though it chimed. The prompt set is fixed; the taps move floors, meanings and confidence, not
the words. Lowering the household floor below 0.50 needs the same evidence as raising it (three non-deliveries that stay
quiet at the lower floor), so a household with no false alarms at all gets a floor of 0.30 from its first eight taps,
which is what the data says and what a label at 0.30 would correct.

SAM cost: an opted-in household scores the four watch prompts on the first frame of every movement (four calls, where an
immediate hit used to cost one), then the usual cascade on the other frames if nothing fired. The daily cap of 800 and
the pause above it are unchanged.

## 5. The overall model: the export, and what it becomes later

`npx tsx scripts/cam/export.ts [--out synth/cam-labels]` writes, for every household with "Help improve Biscuit" on,
every labelled, real (not test-run) movement: Ana's taps, and the classifications Biscuit made that she did not correct,
each row saying which:

- `<hash>/<sample>-<n>.jpg`: the box-region crops, as the phone sent them;
- `labels.jsonl`: one line per movement: `household` (sixteen hex characters of a salted SHA-256 of the household id;
  stable across exports, not the id, not reversible), `sample`, `at` (the hour, UTC), `label`, `positive` (mail or
  carrier), `labelledBy` ("ana" or "biscuit"), `guess` (Biscuit's label and confidence as the clip was made, or null),
  `level`, `seen`, `scores`, `frames` (the file paths);
- `manifest.json`: counts by label, households, movements, frames, the export time.

Not in it: the household id, the device, any name, any address (Biscuit stores none), the minute, the full frame,
anything from a household without the second choice, anything unchecked, skipped or rejected and not relabelled. `/synth/` is ignored by git; the
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

Later on October 29, the guess and the carousel:

- The guess rests on one prompt: the strongest carrier prompt above its floor, else the strongest other fired prompt,
  else none. A prompt's record is kept over the clips whose guess rested on it, not over every clip on which it fired,
  so a person co-firing beside the carrier does not count against "person".
- Only non-carrier prompts can learn a new meaning; carrier prompts keep theirs and lose the floor instead.
- A learned meaning away from the carrier stops that prompt's chime; the default meaning of a person does not.
- Confidence is capped at 95 percent; the auto-classification needs 90.
- Not right is a single tap: Biscuit's label comes off, the guess is marked rejected, the clip returns to Ana with the
  three taps, and the rejection counts against the prompt until she labels it.
- The carousel lists the newest 20 of each group with a poster and a frame count; the frames of the clip on stage are
  fetched once and kept for the page's life, so a tap costs one small request, not a reload of every clip.
- "Yes, right" on a clip Biscuit classified is Ana's tap of the same label: it counts for the prompt and makes the
  label hers.
- The founder's collect-mode rows carry the guess but are never classified by Biscuit, so the contact sheet and
  `calibrate.ts` keep reading only the founder's labels.

Later again on October 29, two voices on Ana's page:

- The daughter's side of every card is a Title Case title, one short Title Case line (`clipsSummary`, `cameraSummary`,
  `src/lib/lines.js`, `mailTimeLine`), the buttons in her words (The Mail Carrier, A Car or the Wind, Someone Else,
  Skip; the stored labels are unchanged) and Biscuit's guess as one line without a number. Everything with a number, a
  floor, a prompt name, an explanation or the full consent and retention words sits under a `<details>` disclosure
  labelled Details, one per card; the page footer is one Details at the bottom. Rosa's own screens are spoken lines and
  stay in sentence case.
- The disclosures open by default for the household whose owner `CAM_COLLECT_OWNER` names (`household.admin` on
  `GET /api/biscuit/family`, from `isCollectOwner`) and stay closed for everyone else. Nothing is hidden behind a route.
  Superseded on October 30: the founder ruled that no technical explanation is shown to the user at all, not even
  folded. Every Details disclosure and explanatory sentence left the user side of Ana's page, her setup screens and the
  mailbox phone's screens. The former Details content is an admin view, rendered (not hidden) only when the household is
  the admin one and the page is opened as `/ana?admin=1` (`isAdminView` in `src/lib/admin.js`); on the mailbox phone the
  counts, the movement level and the events render only in collect mode. The two consent sentences beside the switches
  stay, because consent must say what is kept.
- The consent toggles keep one sentence each; the first says "gone within 30 days", which is the upper bound (unchecked
  clips go after 7), and adds the exception when the second choice keeps tapped clips longer.
- The mailbox phone's screen keeps "Watching Rosa's mailbox." and one plain line (the last movement, whether clips are
  kept); its counts, the movement level, the events and the collect-mode card are under Details, open in collect mode.

- Clips are a second, separate row from collect mode. The founder's household keeps full frames under collect mode and
  gets no clip row for the same movement; the strip still shows those frames and the taps still label them.
- The clip follows the detection: three frames go at once as before, the eight small frames over six seconds follow and
  fill the row the reply named. The chime is not delayed for opted-in households.
- Only the three watch prompts are scored for clips (collect mode scores six): the taps tune a floor and a gate, and
  three calls a movement is the cost that fits an 800-a-day cap.
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
(de-identification). The migrations are `drizzle/0005_medical_firestar.sql` (nine added columns) and
`drizzle/0008_amusing_stardust.sql` (`guess` and `labelled_by` on the sample row), nothing dropped. Each was generated
and not applied; apply before deploying (`npm run db:migrate`, then `./deploy.sh`), since the family page and the frames
route select the new columns.
