# Biscuit device QA

Run on the deployed site, https://biscuit.kindred-ai.dev, with an iPhone (Rosa), an Android phone (the mailbox phone) and a laptop (Ana). Three runs on Day 3; every failure gets a fix or a documented limit before the video. Latency targets come from the spec §2.

Print `docs/sample-bill.html` first (Chrome, Print, Letter).

| # | Step | Pass line | Latency | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|---|---|
| 1 | Laptop: open /ana, sign in with Kindred ID, fill "Who Biscuit helps", Next. | Link-code screen shows a six-digit code and "Good for 10:00". | | | | |
| 2 | iPhone: open the site in Safari, Share, Add to Home Screen, open Biscuit from the icon, type the code. | "Say: Hello Biscuit." appears; laptop shows "Rosa's phone linked" within 10 s. | ≤ 10 s | | | |
| 3 | iPhone: say "Hello Biscuit". | The words appear and Biscuit says "Heard. Was I loud enough?" | ≤ 4 s | | | |
| 4 | iPhone: Consent is read aloud; say "yes" or tap Yes, go on; allow notifications when asked. | Help setup screen appears; laptop Recent shows "Rosa said yes to Biscuit". | | | | |
| 5 | Laptop: on /ana tap "Get notified on this device" and allow. iPhone: tap "Send a test to Ana's page". | iPhone shows "Got it" and the laptop buzzed/notified. | ≤ 30 s | | | |
| 6 | Laptop: Next: the mailbox phone. Android: open /cam, type the code, allow the camera, point it at the printed mailbox (or a real one), Find my mailbox. | A cyan box on the mailbox; "Is this your mailbox?"; Yes, that's it; "Set." | ≤ 5 s | | | |
| 7 | Android: Next: the envelope test; open and close the mailbox lid (or swap the printed picture). | "Works." within 60 s; laptop Mailbox phone shows Online. | ≤ 60 s | | | |
| 8 | Android: Done. Watch the box. Move something at the box. | iPhone notification "You've got mail, Rosa." | ≤ 20 s | | | |
| 9 | iPhone: tap the notification, say "yes", hold the printed bill in the frame. | Captures by itself; speaks "This is from Massachusetts General Hospital. It looks like a bill. The amount due is $1,850.00 …"; facts shown over quotes. | ≤ 12 s from capture | | | |
| 10 | iPhone: answer the question(s); hear the offer; say "yes". Laptop: Needs you, Review in Waive. | Waive's start page for CCN 220071 opens; iPhone docket shows "Ana has the application". | | | | |
| 11 | iPhone: hold Help 2 s; cancel the phone's "Call 911?" sheet; come back; tap I'm OK. | Laptop notified "Rosa pressed Help…" within 10 s; Recent shows Help pressed, then "says she's OK". | ≤ 10 s | | | |
| 12 | iPhone: Settings, Delete everything, Yes, delete. Laptop: reload /ana. | iPhone back to the code screen; laptop asks to set up again. | | | | |

Known limits to state rather than fix: no wake word (Talk, a tap or a notification starts Biscuit); the mailbox phone must stay on the page, plugged in; English only; one family member told.
