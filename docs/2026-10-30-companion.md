# Biscuit as a companion: voice first, a conversation that remembers (October 30, 2026)

The founder's direction: "The user (Rosa) should be able to use the app with just voice and buttons are just helpers
throughout the application. Rosa can also have any conversation with Biscuit and Biscuit learns her preference such as
Food, Cooking, Medication, Hobbys, Pets, and Weather, etc and have companion like conversation and provide assistance as
needed."

## What it is

Talk to Biscuit becomes an open conversation (and, later the same day, the Talk button itself goes: Biscuit hears all the time, `2026-10-30-always-hearing.md`). Rosa says anything; Biscuit answers in his own voice (cheerful, short,
one question at a time) and, when the words are a job, does the job: a letter, her papers, the mail, a message for Ana,
Help. He remembers what she tells him about herself, food she likes, how she cooks, when she takes her pills, her
hobbies, her pets, where she lives for the weather, and brings it back later. Every screen that speaks also listens
afterwards, so the phone can be used by voice alone; the buttons stay as helpers.

## How it works

- `POST /api/biscuit/companion` takes the last turns of the conversation from the phone and the phone's clock, builds
  Biscuit's system prompt (who he is, the rules, what he remembers, today's weather when the home is known, what is on
  her papers, whether the mail came) and asks Muse Spark 1.3 on the Meta Model API for a JSON answer: the reply to speak,
  an action (`none`, `read_letter`, `papers`, `mail_came`, `tell_ana`, `help`), things to remember (topic and fact),
  things to forget, a reminder to set (label and time), and a place when she says where she lives. The server applies
  the memory, reminder and place changes and returns the reply and the action. The conversation itself is not stored.
- Memory is a table of short facts per household (`biscuit_memory`: topic, fact, when), written only from what Rosa
  says, never from letters, read back into the prompt each turn, listed and deletable on Rosa's Settings screen. Biscuit
  says "I'll remember that" when he keeps something; "forget that" removes it.
- Reminders (`biscuit_reminder`: label, minutes after midnight, days or every day) ride the ten-minute tick that already
  chimes for the mail: within a quarter hour after the time, once a day, Rosa's phone gets "Time for your pills, Rosa."
  A reminder is a chime, never advice: Biscuit does not say what to take or how much, and says so if asked.
- Weather comes from Open-Meteo (no key, no account) for the home's place, geocoded once when Rosa or Ana names it, as
  one sentence in the prompt and in the answer when she asks.
- Voice first: after Biscuit speaks on any screen he listens; "stop" ends it, "help" starts Help, and the words for a
  letter, her papers, the mail, home and talking move between screens from anywhere. The conversation goes on by itself
  and rests after two quiet turns.

## Rules Biscuit keeps

- No medical advice: a reminder is a chime; questions about doses, interactions or symptoms get "that is one for your
  pharmacist or doctor" and an offer to tell Ana.
- Nothing from a letter is said unless it came through the reader's verified quotes; the companion never reads mail.
- Help is Rosa's word; Biscuit never dials.
- What Rosa says stays on the phone and in the model call for that turn; the server keeps only the facts she agreed to
  remember, the reminders she set, and what she asked Biscuit to tell Ana. Ana's page shows none of the conversation.

## Rulings

- Memories are Rosa's, not Ana's: they appear on Rosa's Settings screen with a delete each, and nowhere on Ana's page.
- Consent per memory is Biscuit saying so out loud ("I'll remember that"), with "forget that" and the Settings list as
  the way back; a written consent screen for each fact would end the conversation.
- The model answers in a fixed JSON shape, so an action is a field, never a guess from free text; anything outside the
  shape is dropped and the reply alone is spoken.
- The local intents (letter, papers, mail, tell Ana, stop, help) run before the model, so a job never waits on a call.
