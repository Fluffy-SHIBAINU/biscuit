# Biscuit: the founder's first live test, and what it changed (October 30, 2026)

Five findings from Shawn testing Rosa's phone against his own mail, and the fix for each. All five shipped the same day.

## 1. Your Papers was a dead end

Finding: the list had "Read them to me" and Home, nothing else. Nowhere to show the next letter, nowhere to talk.

Fix: the screen gets the actions Rosa most needs there: Show me a letter, Talk to Biscuit, Read them to me. Each
letter in the list is a button: a tap plays that reading again (the spoken lines are kept with the letter on the phone).

## 2. Talk to Biscuit talked and did nothing

Finding: Biscuit repeated what it heard and offered a letter, then ended. No action followed from the words.

Fix: a small intent layer (`src/lib/talk.js`, tested) turns the words into one of five moves and acts: a letter, a bill
or the mail (show me the letter); my papers, what do I have (the list, read aloud); the mail came (the mail screen);
tell Ana … (the words go to Ana's page as "Rosa said", kept to 300 characters); anything else, or silence (Biscuit
says what it can do). The same moves are buttons on the screen from the first second: Read a letter, My papers, Tell
Ana. Stop and Help keep working everywhere.

## 3. The photo step dragged

Finding: "Hold the letter in the frame. I'll take the picture myself when it's clear" waited on a frame check a second;
"Take it anyway" appeared only after ten seconds; after the capture the camera stayed on screen under "Reading it now".

Fix: Take the picture is there from the start. The frame check still fires the capture on its own when the whole page
is in view. On capture the camera stops, the frame goes, and the screen is the dog, "Reading it now." and a small copy
of the picture taken, so it is plain which picture Biscuit is reading.

## 4. "Addressed to Sangful Yoon, not to you"

Finding: a letter addressed to someone other than the household's senior stops the reading and tells Ana. That is the
designed behaviour (the simulated trial asked for it), and it is right for Rosa; it surprised the founder because the
test household's senior is "Rosa" and the mail is his. Nothing changed in the rule; the words stay.

## 5. A read letter saved to the database must be private

What was already true: a letter is stored only when Rosa's sharing consent is on; the row holds sender, amount, dates,
status and the verified quotes, never the image, the transcription or her words; it can be read only with Rosa's own
device key (her docket) or Ana's signed-in session for that household; Neon encrypts the disk; model calls log model,
time and token counts, never text.

What was wrong: the server's list of letter statuses did not include "not mine", so a letter addressed to someone else
was stored as an ordinary read with its full summary. Found by the test written for this change.

What changed: a letter addressed to someone else is stored as a date, a kind and the status "not mine", nothing else:
no sender, no amount, no quotes, on the phone and on the server alike (the server strips them even if a phone sends
them). README's privacy list says so.

## Rulings

- Your Papers keeps "Read them to me" as the third button; the first is Show me a letter, since that is what Rosa does
  most.
- "Tell Ana" is a new event kind, `rosa_said`, listed on Ana's page as what Rosa said, in her words, 300 characters at
  most; it is the only place Rosa's words are kept, by her choice, each time.
- The intent layer is patterns, not a model: a letter is a letter, the mail is the mail, and anything unclear gets the
  menu rather than a guess.
- Rosa's screens stay in sentence case; they are spoken lines.
