# Biscuit: the second reader (Fireworks)

Approved by the founder on 2026-10-27 from the canvas row "Fireworks: every letter read twice" (mocks F0 to F3). This document is the contract the code follows; the spec of 2026-10-26 stays the authority for everything it does not change.

## 1. What changes for Rosa and Ana

- Every letter picture is read by two models at once: Muse Spark 1.3 on Meta Model API (as today) and a second reader served per token by Fireworks: DeepSeek V4.1 Flash (`accounts/fireworks/models/deepseek-v4p1-flash`) unless `FIREWORKS_READER_MODEL` names another model (Muse Spark Open, Meta's open weights, is `accounts/fireworks/models/muse-spark-open`; §5 says why it is not the default). Each reader transcribes the page and extracts the facts with quotes under the same JSON schema; each quote is verified against that reader's own transcription, as today.
- Biscuit speaks a fact only when both readers read it the same way. A fact the readers read two ways is shown on Rosa's screen as "Not said aloud" with both quotes and reaches Ana's page as "Check", with both quotes and which reader said which. A fact only one reader found is shown, not spoken.
- One reader slow or down: the other reads alone inside the budget; the screen says "Read once" and why; Ana's page says "Read once". Both down: Rosa hears "Both my readers are away. Let's try again in a minute." and nothing is stored.
- Ana can ask for another look: her page's "Ask Rosa for another look" chimes Rosa's phone ("Ana would like another look at the letter from Mass General. Tap to show it again."), Rosa's Home shows the same with a "Show it" button, and both readers read the letter again. No picture is ever stored; the new read is a new row on Ana's page, and it clears the request for that sender.
- Ana's page gets a "Readers" strip: for the latest read, each reader's state (ok, failed, timed out, unreadable) and the time.
- The second reader is on only when `READER_SECOND=fireworks` and `FIREWORKS_API_KEY` are set. Without them Biscuit reads once with Meta as today ("single": no pill, no notice).

## 2. Acceptance

1. Both readers agree on the synthetic bill: Rosa hears the same lines as today; the Reading screen shows "Read twice ✓" and "Both readers: the same line" under each fact; Ana's row says "Read twice ✓".
2. Readers differ on the statement date: the date is not spoken; Biscuit says "The statement date I read two ways, so I won't say it. Ana will check."; the screen shows both quotes; Ana's row says "Check" with both quotes and reader names, and "Needs you" lists it.
3. The second reader times out (10 s): Rosa hears Meta's read; the screen shows "Read once" and "DeepSeek V4.1 Flash on Fireworks didn't answer in 10 seconds. Meta's reader read it alone." (the reader's label names the model); Ana's strip shows that reader "Timed out".
4. Meta fails and Fireworks answers: Rosa hears Fireworks' read, marked "Read once"; the hospital match and the Waive sheet come from that read.
5. Both fail: 503 `readers_down`; the phone speaks the line above; nothing is stored.
6. `READER_SECOND` unset or not `fireworks`: today's behaviour byte for byte (lines, facts, events), `readBy: "single"`.
7. Ana taps "Ask Rosa for another look": Rosa's devices get the push, Rosa's Home shows the request, Ana's Recent shows "Asked Rosa for another look."; a new read from the same sender clears it.
8. A fact read two ways never reaches `amountCents`, `statementOn`, `dueOn`, the docket status line or the spoken lines.

## 3. Rules

- Agreement is by field. For `amount_due`, `statement_date`, `due_date`, `account_last4` and `phone_numbers` the values agree when their digits are equal; for every other field when the normalised values are equal ignoring case. A sender or hospital name also agrees when the longer reading is the shorter one with a department added on a word boundary ("Massachusetts General Hospital" and "Massachusetts General Hospital Patient Financial Services"; two words at least), or when both match the same CMS hospital record. The primary reader's quote is the one shown and spoken; a fact only the second reader found is ignored.
- When both readers answered, only `agreed` facts are spoken. When one reader answered, every verified fact of the survivor is spoken (as today). A fact with an unverified quote is never spoken, whatever the other reader said.
- Each reader has 10 seconds (`READ_TIMEOUT_MS`); the two run in parallel, so the read costs the slower of the two, never the sum.
- The server stores no transcription and no picture. It stores, per letter, `read_by` (`single`, `twice`, `once`) and `checks` (field, and for each reader its value and quote), the same kind of content as the quotes it already keeps for Ana's page.
- The `letter_read` event (already recorded per read) carries `readBy`, each reader's status and milliseconds, and the counts of agreed and differing facts. No content.

## 4. Files

- `server/fireworks/client.ts` (new): `fireworksFetch`, `fireworksKey`, logging. `server/fireworks/spark.ts` (new): `DEFAULT_MODEL`, `SPARK_OPEN_MODEL`, `readerModel(env)`, `reasoningFor(model)`, `readerLabel(model)`, `fwChat`, `transcribeLetterFw`, `extractFactsFw`, `fireworksReaderFor(model)`; same prompts and schema as `server/meta/spark.ts`; `reasoning_effort` "none" where the model allows it and "low" for Muse Spark Open; `max_tokens`. A reader carries a `label` (the model's printed name); `attempt`, the read route's `readers` and the `letter_read` event pass it on, and the screens print it (`readerName` in `src/lib/letters.js`).
- `server/read.ts` (new): `Read`, `readWith(reader, jpeg)`, `withTimeout`, `ReadOutcome`.
- `server/agree.ts` (new): `agree(primary, secondary)`: `readBy`, facts with `agreement` and `spoken`, `checks`, `differLine`.
- `server/routes/letter.ts`: both readers in parallel, outcomes, the event data, the response fields `readBy`, `readers`, `checks`.
- `server/schema.ts`: `letter.readBy`, `letter.checks`, `letter.lookRequestedAt`; event kind `look_requested`. `drizzle/0002_*.sql`.
- `server/routes/docket.ts`: `POST /letter` accepts `readBy` and `checks`, clears a pending look request for the same sender. `server/routes/ana.ts`: `GET /family` returns `readers` and the new letter columns; `POST /letter/:id/again` records the event and pushes `LOOK_PAYLOAD` to Rosa's devices. `server/push.ts`: `LOOK_PAYLOAD`.
- `server/app.ts`: options `reader2` (`SparkDeps | null`) and `readTimeoutMs`.
- `src/lib/letters.js`: `spokenValue` honours `spoken`; `summaryOf` carries `readBy`, `checks`, `needsReview` when checks exist. `src/rosa/Reading.jsx`: pill, notice, per-fact lines. `src/rosa/Letter.jsx`: 503 line, entry fields. `src/rosa/Home.jsx`: the look request card. `src/ana/Family.jsx`: pills, checks, the button, the Readers strip, the Recent line.
- `scripts/record-fixtures.ts`: `fireworks` records `tests/fixtures/fireworks/spark-transcribe.json` and `spark-extract.json`. `README.md`, `.env.local.example`.

## 5. Decisions

- Agreement compares values, not quote strings: the two transcriptions differ in layout, and "Amount Due: $1,850.00" against "Amount Due $1,850.00" is the same reading. The digits rule keeps a date or an amount from passing on a lucky prefix.
- The budget per reader is 10 s, not the 8 s on the canvas: the measured Meta read is 5.7 s and the 12-second acceptance counts from capture; 8 s would turn ordinary variance into "read once".
- A fact only the second reader found is not shown: the primary reader defines the list, the second confirms or contradicts it. Showing second-only facts would need a third state on every screen for little gain.
- The look request lives on the letter row (`look_requested_at`), is cleared by a new read from the same sender, and is pushed once. No reminder.
- Fireworks keeps the same prompts, schema and temperature 0 as Meta, so a disagreement is a reading difference, not a prompt difference.
- The default second reader is DeepSeek V4.1 Flash, not Muse Spark Open (ruling of 2026-10-27, once the key arrived). Measured on the synthetic bill through Biscuit's own prompts: Spark Open on Fireworks serverless reasons on every call and refuses `reasoning_effort: "none"` ("Muse Spark is a reasoning model; disabling thinking (reasoning_effort='none') is not supported"), 447 to 673 reasoning tokens for a transcription, 14 s for the transcription alone with streaming and 23.6 s without, and 2 of 8 calls stalled past 60 s; the budget is 10 s. Every serverless vision model on the account was timed the same way; DeepSeek V4.1 Flash read the bill in 3.6 to 5.3 s for both calls with no reasoning tokens and every quote verified, at $0.30 in and $1.20 out per million tokens (Spark Open: $1.25 and $4.25). A second reader from another model family also makes the two readings independent in a way two Spark models are not. `FIREWORKS_READER_MODEL` keeps Spark Open one line away for when Fireworks serves it faster. Cost if wrong: the Fireworks lane names a non-Meta model; Meta's models still do every first read, the mailbox and the hearing.
- A sender that adds its department to the same name agrees (seen on the second DeepSeek run: "Massachusetts General Hospital Patient Financial Services" against Meta's "Massachusetts General Hospital"): one spoken "This is from" line and no check for a department. Cost if wrong: "X Medical Center" and "X Medical Center Foundation" count as one sender.
- No backup ear in this change: it is the last Day 2 item, only if everything above is green by evening.
