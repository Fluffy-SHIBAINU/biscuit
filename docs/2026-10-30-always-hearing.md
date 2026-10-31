# Biscuit hears all the time (October 30, 2026)

The founder's direction, after the companion shipped: "the conversation should not be transactional. Talk to biscuit
button isn't needed rather, biscuit should always hear by default and there should be an option to pause talking.
Biscuit should be able to hear all the time there should be no pause."

## What changed

- **The ear** (`src/lib/ear.js`). One microphone stream stays open while Rosa's phone shows the app. A `Segmenter` cuts
  the sound into utterances: speech, then 1.2 seconds of quiet; it keeps 300 ms from before the first word, drops blips
  under 300 ms and cuts anything over 10 seconds. An `EarCore` decides who hears each utterance: a screen that asked for
  the next one (a question, the mail, "did I get anything wrong?") comes first; otherwise the hearing router. While
  Biscuit speaks the ear is muted, and for 300 ms after, so he never answers himself; an utterance that began while he
  was speaking is dropped even when it ends after.
- **The hearing router** (`src/lib/hear.js`). A clip becomes words on the server (`/asr`, as before), then: commands
  (stop, help, pause, home, papers), a message for Ana and "the mail came" stay on the phone; everything else is the
  companion, which may move the screen (`read_letter`, `papers`, `mail_came`). The last twelve turns stay in memory and
  are forgotten after ten quiet minutes. One utterance is handled at a time.
- **The ear bar** (`src/components/EarBar.jsx`) sits at the foot of every one of Rosa's screens: "Biscuit is listening"
  with a dot that swells on sound, "One moment", "Biscuit is talking", "Biscuit is paused"; the last thing heard or said;
  one button: Pause, or Listen when paused, or Let Me Hear when the phone wants a tap before it opens the microphone.
- **Pause.** The button, "Biscuit, pause", "stop listening" or "go to sleep" close the ear (`store.earPaused`) until
  she taps Listen. A plain "stop" still only stops him talking. The ear also closes when the app is hidden and reopens
  when it is shown, and it is left alone while the letter camera is open (on some phones a second capture ends the
  first); it reopens when the camera screen is left.
- **Screens keep their code.** `listen()` in `speech.js` hands the next utterance from the open ear when it is
  running, else records on its own as before (the setup screens, before consent). `speak()` mutes the ear.
- **The room talks too.** The model's answer gained `ignore`: true when the words were plainly not for Biscuit (the
  television, a visitor, a fragment). Then nothing is spoken and nothing is remembered. No wake word: Rosa just talks.
- **Home and Your Papers** lose the Talk to Biscuit button (Home gains My Papers). `/talk` remains as a view of the
  last exchange with the helper buttons (a letter, the papers, Tell Ana).
- **Consent** now says: "I listen while this phone is open so you can just talk to me; tap Pause and I stop listening."

## Rulings

- **No wake word.** Asked for plainly ("always hear by default"). The cost is false answers to the television; the
  `ignore` flag and the pause are the mitigations. A wake word can be added as a Settings choice later.
- **Mute while speaking, not barge-in.** Hearing through his own voice would need echo cancellation we cannot trust
  on every phone; a false echo loop is worse than a lost interruption. "Stop" works between sentences, and the Stop
  link always works.
- **Transcribe only voiced utterances.** Each clip is one `/asr` call; blips and silence never leave the phone.
- **Microphone permission.** A phone that wants a tap before the microphone opens shows Let Me Hear; a denied
  microphone shows the same button (the phone's own settings must allow it). The ear never asks on the setup screens.

## The companion review, folded in

An adversarial review (three lenses, each finding verified by a skeptic) ran over the companion commit; its confirmed
findings are fixed here:

1. A model-chosen `help` action started the Help flow (Ana alarmed, "calling 911" screen) without Rosa saying help.
   `help` is no longer an action; the prompt tells Biscuit to say "say Biscuit, help, or hold the Help button".
2. "help" anywhere in open conversation ("help me with the crossword") started Help. `saidHelp` now hears the word by
   itself, "I need help", "emergency" or "call 911".
3. A reminder the model promised but the server could not parse was silently dropped while the reply promised a chime.
   `parseTime` now reads noon, midnight, "eight o'clock", "eight tonight", "8 in the morning", "half past seven"; when it
   still cannot, the reply becomes "I couldn't set that reminder. Tell me a time, like eight in the morning." A town
   that cannot be found is admitted the same way.
4. `forget` matched the model's words as an unescaped `ILIKE` substring: "I" or "%" wiped every memory. Terms must be
   three letters and not a stopword, wildcards are escaped, at most three rows go per term, and the facts forgotten are
   returned.
5. `tell_ana` was recorded whenever non-empty, whatever the action. It is recorded only when the job was `tell_ana`,
   marked `via: "companion"`.
6. The no-dose rule lived only in the prompt. A reply that reads like dosing becomes the pharmacist line; a reminder
   label loses counts, milligrams and quantity words ("2 x 400 mg ibuprofen" is "ibuprofen").
7. A 15-minute reminder window could miss a late GitHub Actions tick and skip a day. The window is 90 minutes, never
   wrapping past midnight, still once a day.

Also from the review's longer list: the prompt takes the newest forty memories (not the oldest), the same fact is one
memory, the same reminder is one row, a failed weather call is retried after five minutes rather than cached for thirty.
Left open: the speak route's line cache is bounded by count (300 lines), not bytes.

## The second review, folded in

The same kind of review ran over the ear commit. Confirmed and fixed:

1. Two overlapping `speak()` calls shared one mute flag: a reading cut short by "Something's wrong" unmuted the ear under
   the question, and Biscuit heard himself say "Did I get anything wrong?". Only the newest speech may open the ear.
2. The tighter spoken "help" missed real calls: "Help, I've fallen and I can't get up", "Help! Help!", "Somebody help",
   "I need some help". `saidHelp` now hears help as the first word whatever follows, repeated help, "I need help", a fall,
   "can't get up", "can't breathe", "call an ambulance"; "help me with the crossword" and "help me remember" stay requests.
3. Words under way when Biscuit began to speak were kept and his whole reply transcribed with them. Muting now marks the
   utterance in flight as his.
4. A screen's wait on the ear outlived the screen: words said at Home within six seconds of leaving Mail went to the dead
   screen. Every listening screen releases the ear on unmount, and a claim from another path is released when words come.
5. A displaced wait looked like silence, so a tap on "Something's wrong" sent Reading to the questions. A displaced wait
   now says `displaced: true` and screens do nothing with it.
6. A paused Biscuit still recorded through screens' own `listen()`. Paused means paused: once she has agreed to the ear
   and closed it, no screen opens the microphone.

Also: a wait whose deadline passed during a sound that turned out to be a blip ends as quiet instead of swallowing the next
words; a busy or interrupted microphone is retried rather than left "blocked"; the bar says "Biscuit is talking" whenever
the ear is muted and returns to "listening" after a command; the bar clears the phone's home indicator; `parseTime` reads
"8pm", "eight thirty", "quarter past seven" and "12 tonight" (midnight); the dose guard no longer trips on "two letters"
or "another cup of tea", and a label that was all dose becomes "medicine".

Live test, first note: "Biscuit should be listening on all pages." The ear had waited for the consent record and stayed
out of the letter camera's way. Now the bar is on every one of Rosa's pages (not setup, not Ana's, not the mailbox phone);
without a consent record it says "Biscuit isn't listening yet" with Let Me Hear, and that tap is her yes (`earAllowedAt`)
as well as the gesture the phone may want. The camera page listens too: the ear is checked once the camera is open, and
if the phone hands the camera over to the microphone, the camera is reopened once.

Left open, by choice for now: a television left on in a loud room can keep the ear in ten-second clips (each a
transcription call); the ear closes when the screen locks (no wake lock); "stop" cannot be heard inside one long reading
because the ear is closed while he speaks; the speak route's line cache is bounded by count, not bytes.
