# Biscuit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Biscuit MVP in three build days: a senior's phone that chimes when a spare phone sees the mail, reads a letter aloud with verified quotes, hands a hospital bill to Waive, tells family, and calls 911 on Help; deployed at biscuit.kindred-ai.dev.

**Architecture:** One Vite React PWA with three surfaces (Rosa `/`, Ana `/ana`, mailbox phone `/cam`) and one Hono API served as a single Vercel Function, on Neon Postgres through drizzle. Every Meta Model API call goes through three relay modules on the API; phones never hold the key. Rosa's docket lives in her phone's localStorage; the server keeps summaries, event times and the camera region only.

**Tech Stack:** Node 24, Vite 6, React 18 (JSX), Hono 4 with `hono/vercel`, `pg` + drizzle-orm + drizzle-kit, `web-push`, `jose` (Kindred ID verifier copied from eventhorizon `id/verifiers/`), vitest, TypeScript for `api/` and tests, Vercel CLI 65.

**Spec:** `docs/2026-10-26-biscuit-design.md` (approved 2026-10-27). Section numbers below (§6.3, §9.2 …) refer to it.

## Global Constraints

- Hosting: one Vercel project `biscuit` (scope `shawns-projects-77a58c52`), Neon resource `neon-cordovan-planet`; `DATABASE_URL` is already in Vercel env and `.env.local`. No Google Cloud. No cron jobs (§4).
- Vite root is the repository root (`index.html`, `src/`, `public/`) so Vercel's `api/` and `middleware.ts` sit beside it; the spec's `web/src` paths map to `src/`.
- All tables are prefixed `biscuit_` (§7). The server never stores images, audio, transcriptions or spoken words (§7, §11).
- Meta Model API base `https://api.meta.ai/v1`, env `MODEL_API_KEY`, Standard mode only, temperature 0 for Spark (§9). Models: `muse-spark-1.3`, `sam-3.1`, `muse-voice-transcribe-1.0`.
- Request bodies under Vercel's 4.5 MB: letter JPEG ≤ 2 MB, frame JPEG ≤ 300 KB, audio ≤ 15 s (§8).
- Limits: 60 requests a minute per device token; 20 `letter/read` an hour per household; 400 SAM calls a day per household (§8).
- Kindred tokens: paper `#F2F4F6`, sheet `#FFFFFF`, ink `#0B1220`, ink-2 `#364152`, muted `#5A6577`, rule `#D6DCE4`, signal `#0E7490`, brand `#06B6D4`, ok `#047857`, bad `#B42318`, warn `#B45309`, night `#080D18`; fonts Libre Caslon Display (display), Libre Caslon Text (quotes), Geist (UI), Geist Mono (labels). Rosa's screens: buttons 76 to 112 px, text 17 to 21 px. Ana's: 60 px, 16 to 17 px.
- Copy is fixed by the mocks (https://claude.ai/artifact/LjF7QQr9WAkJZvrf9eqivC, Version 12); when a screen's words are not in this plan, take them from the board named.
- Commits are small and frequent; no attribution lines in commit messages.

## Review Focus

1. A letter whose amount prints as `$1,850.00` but whose extraction says `1850`: the quote check must fail and the amount must not be spoken. Test in Task 6 (`verifyFacts` drops a fact whose quote is absent) and Task 7 (`composeReading` speaks the quote's own digits).
2. A phone whose push permission was refused or whose browser has no service worker: `mail_seen` must still reach Home's "today's mail" line and the Mail screen through the fallback link. Test in Task 12 (`GET /docket` returns the last `mail_seen` with no subscription on file).
3. A revoked device token or a deleted household on a phone that still holds the token: every device route answers `401 {"error":"unlinked"}`, never a 500. Test in Task 4.
4. Motion at the box while a send is in flight, or after the daily SAM cap: the mailbox phone must send nothing. Tests in Task 18 (`MotionDetector` cooldown) and Task 19 (`allowSamCall` at 400).
5. A hospital whose name on the bill differs from CMS ("Mass General" vs "Massachusetts General Hospital"): the matcher must either find the right CCN with a score ≥ 0.8 or return null, never a wrong hospital. Test in Task 10.

---

## Day 1

### Task 1: Repository scaffold, build and deploy pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.js`, `vitest.config.ts`, `vercel.json`, `drizzle.config.ts`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/lib/navigate.js`, `src/styles/tokens.css`, `src/styles/app.css`, `public/manifest.webmanifest`, `public/icon.svg`, `api/[[...route]].ts`, `api/_lib/app.ts`, `deploy.sh`, `README.md`
- Test: `tests/health.test.ts`

**Interfaces:**
- Produces: `createApp(): Hono` in `api/_lib/app.ts` with `GET /api/biscuit/health` → `{ok: true, version: string}`; `api/[[...route]].ts` exports `export default handle(createApp())` from `hono/vercel`. `navigate(path: string): void` and `usePath(): string` in `src/lib/navigate.js` (history.pushState plus a `popstate` listener; never `window.location.href`). `vercel.json` rewrites every path except `/api/*` to `/index.html`. `deploy.sh` runs `vercel env add` for each non-empty key in `.env.local` that is not already set, skipping keys that start with `VERCEL_`, `POSTGRES_`, `PG`, `NEON_` or `VITE_NEON_` and `DATABASE_URL` (Neon owns those), then `vercel --prod --yes`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/health.test.ts
import { createApp } from "../api/_lib/app";
test("health answers", async () => {
  const res = await createApp().request("/api/biscuit/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/health.test.ts`
Expected: FAIL, module `../api/_lib/app` not found.

- [ ] **Step 3: Scaffold**

`npm init -y`; install `hono pg drizzle-orm web-push jose react react-dom` and dev `vite @vitejs/plugin-react vitest typescript tsx drizzle-kit dotenv @types/node @types/pg @types/web-push @types/react @types/react-dom`. Scripts: `dev` = `vercel dev --listen 3000`, `build` = `vite build`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `db:generate` = `drizzle-kit generate`, `db:migrate` = `tsx scripts/migrate.ts`. `tsconfig.json`: `module` `ESNext`, `moduleResolution` `bundler`, `strict`, `include` `api`, `tests`, `scripts`, `middleware.ts`. `index.html` loads `/src/main.jsx`; `App.jsx` switches on `usePath()` with a placeholder per surface. `tokens.css` holds the Global Constraints colours and fonts (Google Fonts link in `index.html`).

- [ ] **Step 4: Run the test and the build**

Run: `npx vitest run tests/health.test.ts && npm run build && npm run typecheck`
Expected: PASS; `dist/` exists; no type errors.

- [ ] **Step 5: First deploy and the domain**

Run: `./deploy.sh` then `curl -s https://biscuit.kindred-ai.dev/api/biscuit/health`
Expected: `{"ok":true,"version":"..."}` and the SPA placeholder at `https://biscuit.kindred-ai.dev/`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: scaffold web, API function, deploy script"
```

### Task 2: Database schema and migrations

**Files:**
- Create: `api/_lib/schema.ts`, `api/_lib/db.ts`, `scripts/migrate.ts`, `drizzle/` (generated)
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: drizzle tables `household`, `device`, `linkCode`, `event`, `letter`, `cam`, `rate` exactly as §7 plus `biscuit_rate(key text primary key, window_start timestamptz, count int)`; `getDb(): NodePgDatabase<typeof schema>` (lazy, `pg.Pool` with `max: 2`, reads `DATABASE_URL`); `EventKind` union of the §7 kinds; `Region = {x: number; y: number; w: number; h: number}` (fractions of the frame, 0 to 1).

- [ ] **Step 1: Write the failing test**

```ts
// tests/schema.test.ts
import * as s from "../api/_lib/schema";
test("every table is prefixed", () => {
  for (const t of [s.household, s.device, s.linkCode, s.event, s.letter, s.cam, s.rate])
    expect(String((t as any)[Symbol.for("drizzle:Name")])).toMatch(/^biscuit_/);
});
test("device kinds", () => expect(s.DEVICE_KINDS).toEqual(["rosa", "cam", "ana"]));
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the schema and `getDb()`**

`drizzle.config.ts` reads `DATABASE_URL` through `dotenv` (`.env.local`). `scripts/migrate.ts` loads `.env.local` with `dotenv` `override: true` and runs `migrate(db, {migrationsFolder: "drizzle"})`.

- [ ] **Step 4: Generate, migrate, test**

Run: `npm run db:generate && npm run db:migrate && npx vitest run tests/schema.test.ts && psql "$DATABASE_URL" -c '\dt biscuit_*'`
Expected: PASS; seven `biscuit_` tables listed on Neon.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: biscuit schema and migrations on Neon"
```

### Task 3: Meta client and the three relays with recorded fixtures

**Files:**
- Create: `api/_lib/meta/client.ts`, `api/_lib/meta/spark.ts`, `api/_lib/meta/sam.ts`, `api/_lib/meta/asr.ts`, `scripts/record-fixtures.ts`, `tests/fixtures/meta/{spark-transcribe,spark-extract,spark-questions,sam-mailbox,sam-letter,asr}.json`, `tests/fixtures/letter-synthetic.jpg` (a photo of `docs/sample-bill.html` printed), `tests/fixtures/mailbox.jpg`, `tests/fixtures/hello.webm`
- Test: `tests/meta.contract.test.ts`

**Interfaces:**
- Produces: `LetterKind = "bill" | "notice" | "utility" | "ad" | "other"`; `metaFetch(path: string, init: RequestInit & {timeoutMs?: number}): Promise<Response>` (adds `Authorization: Bearer ${MODEL_API_KEY}`, 30 s timeout, logs `{model, path, ms, inputTokens, outputTokens}` and never bodies); `transcribeLetter(jpeg: Buffer): Promise<string>`; `extractFacts(transcription: string): Promise<Extraction>` where `Extraction` is the §9.1 schema with every field `{value, quote} | null`; `chooseQuestions(kind: LetterKind, known: string[]): Promise<string[]>` returning question ids from §9.3; `detect(jpeg: Buffer, prompt: {text: string} | {point: {x: number; y: number}}): Promise<Detection[]>` with `Detection = {box: {x, y, w, h} (fractions), score: number, mask?: string}`; `parseSam(raw: unknown, width: number, height: number): Detection[]`; `transcribeClip(audio: Buffer, mime: string, opts: {language: string; keywords: string[]}): Promise<string>`.
- Consumes: the Meta cookbook (github.com/meta-models/meta-model-cookbook) for exact request shapes: Responses API `POST /v1/responses` with `input_image` as a data URL and `text.format` json_schema for structured output; `POST /v1/responses` with model `sam-3.1`; `POST /v1/asr/transcribe` multipart. The recorder captures the real shapes; the parsers are written against the recordings.

- [ ] **Step 1: Record real responses once**

Run: `npx tsx scripts/record-fixtures.ts` (needs `.env.local`; writes the six JSON files, redacting nothing because the inputs are synthetic).
Expected: six files; `spark-transcribe.json` contains the text "Amount Due: $1,850.00".

- [ ] **Step 2: Write the failing contract tests**

```ts
// tests/meta.contract.test.ts (fetch is stubbed with the fixtures; no network)
test("transcribeLetter returns the printed text", async () => {
  expect(await transcribeLetter(jpeg)).toContain("Amount Due: $1,850.00");
});
test("extractFacts carries quotes", async () => {
  const x = await extractFacts(transcription);
  expect(x.amount_due).toEqual({ value: "$1,850.00", quote: "Amount Due: $1,850.00" });
  expect(x.kind).toBe("bill");
});
test("parseSam returns fractional boxes with scores", () => {
  const d = parseSam(samMailboxFixture, 1280, 960);
  expect(d[0].score).toBeGreaterThanOrEqual(0.5);
  expect(d[0].box.x).toBeGreaterThanOrEqual(0); expect(d[0].box.x + d[0].box.w).toBeLessThanOrEqual(1);
});
test("transcribeClip returns words", async () => {
  expect((await transcribeClip(webm, "audio/webm", { language: "en", keywords: ["Biscuit"] })).toLowerCase()).toContain("hello biscuit");
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/meta.contract.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the client and relays**

Spark prompts (verbatim, as module constants): transcription, "Transcribe every printed word on this page in reading order. Keep line breaks. Write numbers, dates and amounts exactly as printed. Add nothing."; extraction, "From this transcription, fill the schema. Every quote must be copied exactly from the transcription. Use null when the page does not say."; questions, "Choose at most two question ids for this letter kind and these known answers." Image to data URL with `image/jpeg`. `parseSam` normalises pixel boxes to fractions.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/meta.contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Meta relays for Spark, SAM and Voice Transcribe with recorded fixtures"
```

### Task 4: Device tokens, link codes and device auth

**Files:**
- Create: `api/_lib/tokens.ts`, `api/_lib/codes.ts`, `api/_lib/auth.ts`, `api/_lib/routes/link.ts`
- Modify: `api/_lib/app.ts`
- Test: `tests/codes.test.ts`, `tests/tokens.test.ts`

**Interfaces:**
- Produces: `newToken(): {token: string; hash: string}` (32 random bytes base64url, sha256 hex hash); `hashToken(token: string): string`; `newCode(): string` (six digits, leading zeros allowed); `codeState(row: {expiresAt: Date; tries: number; usedAt: Date | null}, now: Date): "ok" | "expired" | "exhausted" | "used"` with expiry 10 minutes and `tries >= 3` exhausted; `deviceAuth(): MiddlewareHandler` setting `c.var.device` and `c.var.household` from the Bearer token, answering `401 {"error":"unlinked"}` when the hash is unknown; `POST /api/biscuit/link/claim {code}` → `200 {deviceToken, household: {called, language}}`, `410 {"error":"expired"}`, `429 {"error":"exhausted"}`, `404 {"error":"no_match"}` (and `tries` incremented).
- Consumes: Task 2 tables.

- [ ] **Step 1: Write the failing tests**

```ts
test("codeState", () => {
  const t0 = new Date("2026-10-27T10:00:00Z");
  const row = { expiresAt: new Date(t0.getTime() + 600_000), tries: 0, usedAt: null };
  expect(codeState(row, t0)).toBe("ok");
  expect(codeState(row, new Date(t0.getTime() + 600_001))).toBe("expired");
  expect(codeState({ ...row, tries: 3 }, t0)).toBe("exhausted");
  expect(codeState({ ...row, usedAt: t0 }, t0)).toBe("used");
});
test("newCode is six digits", () => expect(newCode()).toMatch(/^\d{6}$/));
test("hash is stable and tokens differ", () => {
  const a = newToken(), b = newToken();
  expect(a.token).not.toBe(b.token); expect(hashToken(a.token)).toBe(a.hash);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/codes.test.ts tests/tokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement tokens, codes, auth and the claim route**

The claim route runs in one transaction: load the code, compute `codeState`, increment `tries` on a wrong code, mark `usedAt` and insert the device on success.

- [ ] **Step 4: Run the tests and a live claim against Neon**

Run: `npx vitest run tests/codes.test.ts tests/tokens.test.ts` then, with a code inserted by hand, `curl -s -X POST localhost:3000/api/biscuit/link/claim -H 'content-type: application/json' -d '{"code":"000000"}'`
Expected: PASS; the curl answers `404 {"error":"no_match"}`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: device tokens, link codes, device auth"
```

### Task 5: Voice loop on Rosa's phone (Talk)

**Files:**
- Create: `src/lib/api.js`, `src/lib/store.js`, `src/lib/speech.js`, `src/rosa/Home.jsx`, `src/rosa/Talk.jsx`, `api/_lib/routes/rosa.ts` (`POST /asr`)
- Modify: `src/App.jsx`, `api/_lib/app.ts`
- Test: `tests/speech.test.js` (silence detection), `tests/asr.route.test.ts`

**Interfaces:**
- Produces: `api(path, {method, json, form, raw}): Promise<any>` adding the device token from `store.deviceToken`; `store` with `deviceToken`, `household`, `docket: Letter[]`, `answers`, `consentedAt`, `clear()` over localStorage key `biscuit`; `speak(lines: string[], opts?: {rate?: number}): Promise<void>` (speechSynthesis, rate 0.9, resolves on end; `stopSpeaking()`); `listen(opts?: {maxMs?: number, silenceMs?: number}): Promise<Blob>` recording with MediaRecorder until 1.2 s of silence (RMS below 0.02 from an AnalyserNode) or 6 s; `isSilent(samples: Float32Array, threshold = 0.02): boolean` exported for the test; `POST /api/biscuit/asr` multipart `audio` → `{text}` (413 above 15 s or 2 MB).
- Consumes: `transcribeClip` (Task 3), `deviceAuth` (Task 4).

- [ ] **Step 1: Write the failing tests**

```js
test("isSilent", () => {
  expect(isSilent(new Float32Array(2048).fill(0.001))).toBe(true);
  expect(isSilent(new Float32Array(2048).fill(0.2))).toBe(false);
});
```
```ts
test("asr route rejects a long clip", async () => {
  const form = new FormData(); form.set("audio", new Blob([new Uint8Array(2_100_000)], { type: "audio/webm" }), "a.webm");
  const res = await app.request("/api/biscuit/asr", { method: "POST", body: form, headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(413);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/speech.test.js tests/asr.route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Home per board "1 · Home": the dog, "Good morning, Rosa.", today's mail card, Talk (112 px), Show me a letter (76 px), Help (76 px, red outline, present only when `store.consentedAt`), Waiting on card, the footer line "Biscuit is a computer helper from Kindred. Say stop and he stops." Talk: press, `listen()`, `POST /asr`, a templated reply ("I heard: …"), `speak`. The word "stop" anywhere in a transcript calls `stopSpeaking()` and returns Home.

- [ ] **Step 4: Run the tests and try it on the iPhone over `vercel dev`**

Run: `npx vitest run tests/speech.test.js tests/asr.route.test.ts`
Expected: PASS; on the phone, "Hello Biscuit" comes back as text within 4 s and is spoken.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Rosa home and the talk loop"
```

### Task 6: Quote verification

**Files:**
- Create: `api/_lib/verify.ts`
- Test: `tests/verify.test.ts`

**Interfaces:**
- Produces: `normalize(s: string): string` (NFKC, curly quotes to straight, en and em dashes to `-`, soft hyphens removed, whitespace collapsed, case kept); `verifyQuote(quote: string, transcription: string): boolean`; `verifyFacts(x: Extraction, transcription: string): Fact[]` where `Fact = {field: string; value: string; quote: string; verified: boolean}`, one per non-null field, `verified` false when the quote is not a substring.

- [ ] **Step 1: Write the failing tests**

```ts
const T = "Statement Date: 10/03/2026\nAmount Due:  $1,850.00\nSee “Financial Assistance” below — call us.";
test("verbatim quotes verify", () => expect(verifyQuote("Amount Due: $1,850.00", T)).toBe(true));
test("typography is normalised", () => expect(verifyQuote('See "Financial Assistance" below - call us.', T)).toBe(true));
test("a changed digit fails", () => expect(verifyQuote("Amount Due: $1,350.00", T)).toBe(false));
test("verifyFacts marks the unverified one", () => {
  const facts = verifyFacts({ kind: "bill", amount_due: { value: "1850", quote: "Amount Due: 1850" }, statement_date: { value: "10/03/2026", quote: "Statement Date: 10/03/2026" } } as any, T);
  expect(facts.find(f => f.field === "amount_due")?.verified).toBe(false);
  expect(facts.find(f => f.field === "statement_date")?.verified).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/verify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `verify.ts`**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: verbatim quote verification"
```

### Task 7: Speech composer and the letter read route

**Files:**
- Create: `api/_lib/compose.ts`, `api/_lib/routes/letter.ts` (`POST /letter/frame`, `POST /letter/read`)
- Modify: `api/_lib/app.ts`
- Test: `tests/compose.test.ts`, `tests/letter.route.test.ts`

**Interfaces:**
- Produces: `composeReading(facts: Fact[], kind: LetterKind): string[]` spoken lines in the order sender, kind, amount, statement date, due date, financial assistance mention, using only `verified` facts and the quote's own digits; `frameCheck(d: Detection[]): {ok: boolean; coverage: number; cutEdge: "top" | "bottom" | "left" | "right" | null}` with ok when coverage ≥ 0.35 and the box touches no edge (within 0.01); `POST /letter/frame` JPEG ≤ 300 KB → frameCheck result; `POST /letter/read` JPEG ≤ 2 MB → `{transcription, facts, kind, sender, hospital: null}` (hospital is filled in Task 13), `422 {"error":"unreadable"}` when the transcription has under 40 words or no sender; counts `letter_read` events for the 20 an hour limit (`429 {"error":"rate"}`).
- Consumes: Tasks 3, 4, 6.

- [ ] **Step 1: Write the failing tests**

```ts
test("composeReading speaks verified facts in order", () => {
  const lines = composeReading([
    { field: "sender", value: "Massachusetts General Hospital", quote: "Massachusetts General Hospital", verified: true },
    { field: "amount_due", value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true },
    { field: "due_date", value: "11/02/2026", quote: "Due Date: 11/02/2026", verified: false },
  ], "bill");
  expect(lines[0]).toBe("This is from Massachusetts General Hospital.");
  expect(lines.join(" ")).toContain("$1,850.00");
  expect(lines.join(" ")).not.toContain("11/02/2026");
});
test("frameCheck names the cut edge", () => {
  expect(frameCheck([{ box: { x: 0.1, y: 0.1, w: 0.7, h: 0.9 }, score: 0.9 }])).toEqual({ ok: false, coverage: 0.63, cutEdge: "bottom" });
  expect(frameCheck([{ box: { x: 0.1, y: 0.1, w: 0.7, h: 0.7 }, score: 0.9 }]).ok).toBe(true);
});
test("read route refuses a short page", async () => { /* stub transcribeLetter to return "Hi there"; expect 422 unreadable */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/compose.test.ts tests/letter.route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Spoken templates: sender "This is from {sender}."; kind "It looks like a {bill|notice|utility bill|advertisement|letter}."; amount "The amount due is {quote digits}."; statement "The statement date is {value}."; due "It is due {value}."; assistance "It mentions financial assistance." Sender absent: "I can't see who sent this." as line one.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/compose.test.ts tests/letter.route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: letter frame check, read route and speech composer"
```

### Task 8: Show me the letter and Reading screens

**Files:**
- Create: `src/lib/camera.js`, `src/rosa/Letter.jsx`, `src/rosa/Reading.jsx`
- Modify: `src/App.jsx`, `src/rosa/Home.jsx`
- Test: `tests/camera.test.js`

**Interfaces:**
- Produces: `openCamera(video: HTMLVideoElement, facing = "environment"): Promise<MediaStream>`; `grabJpeg(video, longSide: number, maxBytes: number): Promise<Blob>` (canvas, quality stepping down from 0.9 until under `maxBytes`); `fitLongSide(w: number, h: number, longSide: number): {w: number; h: number}` exported for the test.
- Consumes: Task 7 routes, `speak`, `store`.

- [ ] **Step 1: Write the failing test**

```js
test("fitLongSide", () => {
  expect(fitLongSide(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 });
  expect(fitLongSide(1000, 800, 2000)).toEqual({ w: 1000, h: 800 });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/camera.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the screens**

Letter per board "3 · Show me the letter": live video, one 1280-px frame a second to `/letter/frame`, the status card ("Not yet" with the cut edge; "A little closer. The bottom is cut off."), auto-capture at 2000 px on `ok`, "Take it anyway" after 10 s. Reading per board "4 · Biscuit reads it": the lines from `composeReading` spoken and shown, each verified fact over its quote in Libre Caslon Text with the `rgba(6,182,212,.22)` mark, unverified facts shown grey as "unverified, not spoken". Unreadable: speak "I can't read this one. Keep it for Ana." and return Home. A read letter is appended to `store.docket` with `{id, readAt, kind, sender, facts, transcription}`.

- [ ] **Step 4: Run the test and the phone**

Run: `npx vitest run tests/camera.test.js`
Expected: PASS; on the iPhone, the printed sample bill is captured and spoken within 12 s of the capture.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: letter capture with SAM frame check and the reading screen"
```

## Day 2

### Task 9: Questions

**Files:**
- Create: `api/_lib/questions.ts`, `api/_lib/routes/question.ts` (`POST /question`), `src/rosa/Question.jsx`
- Modify: `api/_lib/app.ts`, `src/rosa/Reading.jsx`
- Test: `tests/questions.test.ts`

**Interfaces:**
- Produces: `QUESTIONS: Record<"Q1"|"Q2"|"Q3"|"Q4"|"Q5"|"Q6", {text: string; kinds: LetterKind[]; needsSheet?: boolean}>` with the §9.3 texts; `allowedQuestions(kind: LetterKind, hasSheet: boolean, known: string[]): string[]`; `pickQuestions(kind, hasSheet, known, chooser = chooseQuestions): Promise<string[]>` returning at most two ids from the allowed set, falling back to the first two allowed when the chooser fails or returns an id outside the set; `POST /question {kind, hasSheet, known}` → `{questions: [{id, text}]}`.
- Consumes: `chooseQuestions` (Task 3).

- [ ] **Step 1: Write the failing tests**

```ts
test("allowed questions by kind", () => {
  expect(allowedQuestions("bill", true, [])).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  expect(allowedQuestions("ad", false, [])).toEqual(["Q6"]);
  expect(allowedQuestions("bill", true, ["Q1"])).not.toContain("Q1");
});
test("pickQuestions ignores an id outside the set", async () => {
  expect(await pickQuestions("ad", false, [], async () => ["Q1"])).toEqual(["Q6"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/questions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Question screen per board "5 · One question": the question spoken, Yes / No / Not sure buttons (76 px), voice answers mapped by the words yes, no, "not sure"; Q2 accepts a number by voice or by taps. Answers go to `store.answers[letterId]`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/questions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: fixed question list, chooser and screen"
```

### Task 10: Hospital list and matcher

**Files:**
- Create: `scripts/build-hospitals.mjs`, `api/data/hospitals.json`, `api/_lib/hospitals.ts`
- Test: `tests/hospitals.test.ts`

**Interfaces:**
- Produces: `matchHospital(name: string, state?: string): {ccn: string; name: string; city: string; state: string; score: number} | null` (exact normalised name first; then token overlap score = shared tokens over the longer token set with stop words "the", "of", "and", "hospital", "medical", "center" removed from the denominator; floor 0.8); `hospitals.json` rows `{ccn, name, city, state}` from the CMS Hospital General Information dataset Tender uses (`CMS_HGI_URL` in eventhorizon `api/_lib/tender/sources/facilities.ts`).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

```ts
test("exact name", () => expect(matchHospital("Massachusetts General Hospital", "MA")?.ccn).toBe("220071"));
test("short form scores high enough", () => expect(matchHospital("Mass General Hospital", "MA")?.ccn).toBe("220071"));
test("a stranger returns null", () => expect(matchHospital("Rosa's Bakery", "MA")).toBeNull());
test("a near miss returns null", () => expect(matchHospital("General Hospital", "MA")).toBeNull());
```

Review Focus 3 belongs to Task 4: add there `test("an unknown token is unlinked", ...)` expecting `401 {"error":"unlinked"}` from `GET /api/biscuit/docket` with `Bearer nope`.

- [ ] **Step 2: Build the data and run the tests**

Run: `node scripts/build-hospitals.mjs && npx vitest run tests/hospitals.test.ts`
Expected: FAIL on the matcher, data file written (about 5,000 rows).

- [ ] **Step 3: Implement `hospitals.ts`**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/hospitals.test.ts`
Expected: PASS. If 220071 is not Mass General's CCN in the data, fix the test to the data's CCN, not the data.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: CMS hospital list and name matcher"
```

### Task 11: Waive sheet relay

**Files:**
- Create: `api/_lib/waive.ts`, `api/_lib/routes/sheet.ts` (`GET /sheet?ccn=`), `tests/fixtures/waive-sheet.json` (fetched once from `https://waive.kindred-ai.dev/atlas/220071.json`)
- Modify: `api/_lib/app.ts`
- Test: `tests/waive.test.ts`

**Interfaces:**
- Produces: `summarizeSheet(raw: any): SheetSummary` with `SheetSummary = {ccn, hospital: string, freeCare: {maxFpl: string; quote: string; sourceUrl: string | null} | null, decisionDays: number | null, ecaWaitDays: number | null, phone: string | null, checkedOn: string, url: string}` reading `eligibility.free_care_max_fpl.{value, quote, source_id, checked_on}`, `apply.decision_days.value`, `collections.eca_wait_days.value`, `contacts.phone.value`, and the `sources[]` entry whose `id` matches `source_id` for `sourceUrl`; `fetchSheet(ccn: string): Promise<SheetSummary | null>` (null on 404); `url` is `https://waive.kindred-ai.dev/atlas/{ccn}`; `startUrl(ccn)` is `https://waive.kindred-ai.dev/start?ccn={ccn}`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

```ts
test("summarizeSheet reads the free care rule with its quote", () => {
  const s = summarizeSheet(fixture);
  expect(s.freeCare?.maxFpl).toBeTruthy(); expect(s.freeCare?.quote?.length).toBeGreaterThan(10);
  expect(s.url).toBe("https://waive.kindred-ai.dev/atlas/220071");
});
test("summarizeSheet survives a sheet without eligibility", () => expect(summarizeSheet({ ccn: "1", name: "X", sources: [] }).freeCare).toBeNull());
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/waive.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/waive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Waive sheet relay"
```

### Task 12: The offer, the hand-off and the docket

**Files:**
- Create: `api/_lib/routes/docket.ts` (`POST /letter`, `PATCH /letter/:id`, `POST /handoff`, `POST /events`, `GET /docket`), `src/rosa/Offer.jsx`, `src/rosa/Docket.jsx`
- Modify: `api/_lib/routes/letter.ts` (fill `hospital` with `matchHospital`), `api/_lib/compose.ts` (`composeOffer`), `src/App.jsx`, `src/rosa/Question.jsx`
- Test: `tests/compose.test.ts` (extend), `tests/docket.route.test.ts`

**Interfaces:**
- Produces: `unknownNumber(facts: Fact[], sheet: SheetSummary | null): boolean` (true when a verified `phone_numbers` fact matches neither the sheet's phone nor Medicare's 1-800-633-4227, digits compared); a letter flagged gets status `unknown_number`, `needs_review` true, and Biscuit says "This asks you to call a number I don't know. I'm sending it to Ana." instead of the offer; `composeOffer(sheet: SheetSummary | null, answers: Record<string, string>): string[]` ("{hospital} gives free care to households at or below {maxFpl} percent of the federal poverty level." then "The hospital decides." then "I can start the application with Ana. Shall I?"; no sheet: "I can send this to Ana."); the routes of §8 for letters, handoff and events; `POST /handoff {letterId, ccn}` → `{waiveUrl}` recording event `handoff` and setting the letter's status `handoff`; `GET /docket` → `{letters, lastMailSeen, waiting}`.
- Consumes: Tasks 10, 11, 4.

- [ ] **Step 1: Write the failing tests**

```ts
test("composeOffer with a sheet", () => {
  const lines = composeOffer({ hospital: "Massachusetts General Hospital", freeCare: { maxFpl: "400", quote: "…", sourceUrl: null } } as any, {});
  expect(lines[0]).toBe("Massachusetts General Hospital gives free care to households at or below 400 percent of the federal poverty level.");
  expect(lines.at(-1)).toBe("I can start the application with Ana. Shall I?");
});
test("composeOffer without a sheet", () => expect(composeOffer(null, {})).toEqual(["I can send this to Ana."]));
test("handoff records the event and the Waive link", async () => { /* expect {waiveUrl: "https://waive.kindred-ai.dev/start?ccn=220071"} and one handoff event */ });
test("unknownNumber flags a number nobody publishes", () => {
  const sheet = { phone: "617-555-0100" } as any;
  expect(unknownNumber([{ field: "phone_numbers", value: "617-555-0100", quote: "call 617-555-0100", verified: true }], sheet)).toBe(false);
  expect(unknownNumber([{ field: "phone_numbers", value: "1-800-633-4227", quote: "call 1-800-MEDICARE (1-800-633-4227)", verified: true }], null)).toBe(false);
  expect(unknownNumber([{ field: "phone_numbers", value: "888-555-0199", quote: "call 888-555-0199 now", verified: true }], sheet)).toBe(true);
});
test("docket returns the last mail_seen without any push subscription", async () => { /* insert mail_seen for a household whose devices have push_subscription null; GET /docket -> lastMailSeen set */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/compose.test.ts tests/docket.route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Offer per board "6 · The offer": the hospital's rule card with the quote and "Waive sheet · checked {checkedOn}", Biscuit's lines, "Yes, start it with Ana" (112 px), "Not now", footer "Biscuit sends nothing to the hospital. Ana approves everything before it goes anywhere." Docket per board "7 · Your papers": each letter with its status line; "Read them to me". A utility's due date goes on the docket (status `read`, `due_on` set); an ad is offered "Shall I toss it?" and, on yes, stored only as `PATCH /letter/:id {status: "tossed"}` with no quotes. `POST /letter` is called only when `store.household.shareLetters` is true.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/compose.test.ts tests/docket.route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: offer, Waive hand-off, docket"
```

### Task 13: Kindred ID, household and Ana's setup screens

**Files:**
- Create: `api/_lib/kindred/{kindred-auth.ts,hono.ts}` (copied from eventhorizon `id/verifiers/`), `middleware.ts`, `api/_lib/routes/ana.ts` (`POST /household`, `POST /link/new`, `GET /family`), `src/ana/SignIn.jsx`, `src/ana/WhoFor.jsx`, `src/ana/LinkCode.jsx`, `src/rosa/EnterCode.jsx`
- Modify: `api/_lib/app.ts`, `api/_lib/auth.ts` (`anaAuth()`), `src/App.jsx`
- Test: `tests/ana.route.test.ts`

**Interfaces:**
- Produces: `anaAuth(): MiddlewareHandler` = `requireKindredUser({env: process.env})` then loads the household by `owner_email` into `c.var.household` (`404 {"error":"no_household"}` when none, except on `POST /household`); `middleware.ts` exports `createMiddleware()` with `config.matcher = ["/ana/:path*"]`; `POST /household {seniorName, called, relation, living, language}` → `{id}`; `POST /link/new {kind}` → `{code, expiresAt}`; `GET /family` → `{household, letters, said: Event[], camera, help, devices}`.
- Consumes: Task 4, Task 2. Local: `KINDRED_AUTH_BYPASS` in `.env.local`.

- [ ] **Step 1: Write the failing tests**

```ts
test("household needs a session", async () => {
  const res = await app.request("/api/biscuit/household", { method: "POST", body: "{}" });
  expect(res.status).toBe(401);
});
test("link/new makes a six digit code good for ten minutes", async () => { /* with KINDRED_AUTH_BYPASS set in the test env */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ana.route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Screens per boards A1, A2, A3 and R1: A1 "Continue with Kindred ID" links to `https://id.kindred-ai.dev/login?return_to=https://biscuit.kindred-ai.dev/ana/new`; A2 the form; A3 the code, a QR of `https://biscuit.kindred-ai.dev/link?code=…`, "Waiting for Rosa's phone…" polling `GET /family` every 5 s, "New code"; A3 also says "First add Biscuit to Rosa's Home Screen: Share, Add to Home Screen." R1 the keypad with "Didn't match. Check the numbers on Ana's phone. 2 tries left."

- [ ] **Step 4: Run the tests and the flow**

Run: `npx vitest run tests/ana.route.test.ts`
Expected: PASS; locally with the bypass, A1 to R1 links a device and A3 shows "Rosa's phone linked".

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Kindred ID for Ana, household, link codes, setup screens"
```

### Task 14: Web push, service worker, Mail came

**Files:**
- Create: `api/_lib/push.ts`, `api/_lib/routes/push.ts` (`POST /push/subscribe` device and Ana, `POST /push/ack`), `public/sw.js`, `src/lib/push.js`, `src/rosa/Mail.jsx`
- Modify: `api/_lib/routes/docket.ts` (`POST /events` of kind `mail_tapped`), `src/App.jsx`, `src/rosa/Home.jsx` (the fallback link)
- Test: `tests/push.test.ts`

**Interfaces:**
- Produces: `sendPush(db, householdId: string, kinds: ("rosa"|"ana")[], payload: {title: string; body: string; url: string; eventId?: number}): Promise<{sent: number}>` (web-push with VAPID; a 404 or 410 from the push service deletes that subscription); `subscribePush(): Promise<boolean>` on the phone (registers `sw.js`, `pushManager.subscribe` with `VAPID_PUBLIC_KEY` from `GET /api/biscuit/push/key`); `sw.js` shows the notification, posts `/api/biscuit/push/ack {eventId}` with the device token kept in IndexedDB, and on click opens `payload.url`.
- Consumes: Task 2.

- [ ] **Step 1: Write the failing test**

```ts
test("sendPush drops a dead subscription", async () => {
  // stub web-push sendNotification to reject with {statusCode: 410}; expect the device's push_subscription to be null afterwards and {sent: 0}
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/push.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Mail per board "2 · Mail came": opened by the notification tap or Home's "Mail came and I didn't say so? Tap here." (which posts `mail_tapped`); speaks "You've got mail, Rosa. Want me to look through it?"; listens for yes or no; Yes, look (112 px) goes to Letter; Not now returns Home.

- [ ] **Step 4: Run the test and a real push**

Run: `npx vitest run tests/push.test.ts`; on the installed iPhone app, subscribe, then `curl -X POST localhost:3000/api/biscuit/events -d '{"kind":"mail_seen"}'` with the cam token.
Expected: PASS; the phone shows the notification within 5 s and tapping it opens Mail.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: web push, service worker, mail came"
```

### Task 15: Ana's family page

**Files:**
- Create: `src/ana/Family.jsx`
- Modify: `src/App.jsx`, `api/_lib/routes/ana.ts` (`POST /cam/pause`, `POST /cam/resume` setting `cam.paused`; `GET /family` shape complete: camera `{status: "online"|"offline"|"paused"|"not_set", battery, lastEventAt, testStatus}`, help `{lastTestAt, acked: boolean, openHelpAt}`)
- Test: `tests/family.test.ts`

**Interfaces:**
- Produces: `cameraStatus(cam: CamRow | null, lastHeartbeatAt: Date | null, now: Date): "online"|"offline"|"paused"|"not_set"` (offline after three missed 60-second heartbeats, that is 180 s); the page polls `GET /family` every 30 s and renders the Family board's sections.
- Consumes: Task 13.

- [ ] **Step 1: Write the failing test**

```ts
test("cameraStatus", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  expect(cameraStatus(null, null, now)).toBe("not_set");
  expect(cameraStatus({ paused: false } as any, new Date(now.getTime() - 179_000), now)).toBe("online");
  expect(cameraStatus({ paused: false } as any, new Date(now.getTime() - 181_000), now)).toBe("offline");
  expect(cameraStatus({ paused: true } as any, now, now)).toBe("paused");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/family.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the page**

Sections and copy from the Family board: Letters Biscuit read, Needs you (Review in Waive → `startUrl(ccn)`), Biscuit said, Mailbox phone (Pause watching, Find the mailbox again, Run the mail test), Help (Send a test to this page, Also told), Delete this household, the footer line.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/family.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: family page"
```

### Task 16: Mailbox phone: join, place, find, confirm, tap

**Files:**
- Create: `api/_lib/cam.ts`, `api/_lib/routes/cam.ts` (`POST /cam/find`, `POST /cam/region`, `POST /cam/heartbeat`), `src/cam/Join.jsx`, `src/cam/Place.jsx`, `src/cam/Found.jsx`
- Modify: `api/_lib/app.ts`, `src/App.jsx`
- Test: `tests/cam.test.ts`

**Interfaces:**
- Produces: `padRegion(box: Box, pad = 0.2): Region` (grow by 20 percent of the box on each side, clamped to 0..1); `bestDetection(d: Detection[], minScore = 0.5): Detection | null`; `POST /cam/find` JPEG plus `prompt=mailbox` or `point=x,y` → `{box, score} | 404 {"error":"not_found"}`; `POST /cam/region {region}`; `POST /cam/heartbeat {battery, charging}` updating `device.last_seen_at`.
- Consumes: Tasks 3, 4.

- [ ] **Step 1: Write the failing tests**

```ts
test("padRegion grows and clamps", () => {
  expect(padRegion({ x: 0.5, y: 0.5, w: 0.2, h: 0.1 })).toEqual({ x: 0.46, y: 0.48, w: 0.28, h: 0.14 });
  expect(padRegion({ x: 0, y: 0, w: 0.2, h: 0.1 }).x).toBe(0);
});
test("bestDetection", () => expect(bestDetection([{ box: { x: 0, y: 0, w: 1, h: 1 }, score: 0.4 }])).toBeNull());
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/cam.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Screens per boards C1, C1b, C3, C4, C5, C5b, C6: the camera code (from `POST /link/new {kind: "cam"}` on Ana's page), camera permission with the browser path on refusal (three refusals: "Set the camera up later"), live view, "Find my mailbox" (one 1280-px JPEG), "Is this your mailbox?", "No, that's not it" to the tap screen (point prompt), "I couldn't find a mailbox from here." with Look again (once) and Tap where it is; a wake lock is requested on join.

- [ ] **Step 4: Run the tests and the Android phone**

Run: `npx vitest run tests/cam.test.ts`
Expected: PASS; on the Android phone pointed at a printed mailbox photo, the box is found and confirmed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: mailbox phone join, placement, SAM find and confirm"
```

### Task 17: Mailbox phone: motion, envelope test, watching, battery

**Files:**
- Create: `src/cam/motion.js`, `src/cam/Test.jsx`, `src/cam/Watching.jsx`, `api/_lib/routes/cam.ts` (`POST /cam/frames`, `POST /cam/test`)
- Modify: `api/_lib/cam.ts`, `src/App.jsx`, `api/_lib/push.ts` use
- Test: `tests/motion.test.js`, `tests/cam.test.ts` (extend)

**Interfaces:**
- Produces: `toGray(data: Uint8ClampedArray, width: number, height: number, region: Region, outW = 160): Uint8Array`; `meanAbsDiff(a: Uint8Array, b: Uint8Array): number`; `class MotionDetector { constructor(opts = {threshold: 12, consecutive: 2, cooldownMs: 90_000}); sample(gray: Uint8Array, now: number): "idle" | "motion" | "cooldown" }` (motion when `meanAbsDiff` ≥ threshold on two consecutive samples and no send in the last 90 s); `allowSamCall(cam: {samCallsToday: number; samDay: string | null}, today: string): boolean` (false at 400 or above, resets on a new day); `POST /cam/frames` three JPEGs → `{seen: "mail carrier" | "mailbox door" | "envelope" | null}` asking the prompts in that order and stopping at the first hit, incrementing `sam_calls_today` per SAM call, recording `mail_seen` and pushing to Rosa's phone on a hit, `429 {"error":"cap"}` with `cam_paused` when the cap is reached; `POST /cam/test {result: "works"|"pending"}`.

- [ ] **Step 1: Write the failing tests**

```js
test("motion needs two consecutive samples then cools down", () => {
  const m = new MotionDetector(); const still = new Uint8Array(100).fill(10); const moved = new Uint8Array(100).fill(40);
  expect(m.sample(still, 0)).toBe("idle");
  expect(m.sample(moved, 500)).toBe("idle");
  expect(m.sample(still, 1000)).toBe("motion");
  expect(m.sample(moved, 1500)).toBe("cooldown");
  expect(m.sample(still, 92_000)).toBe("motion");
});
```
```ts
test("allowSamCall", () => {
  expect(allowSamCall({ samCallsToday: 399, samDay: "2026-10-27" }, "2026-10-27")).toBe(true);
  expect(allowSamCall({ samCallsToday: 400, samDay: "2026-10-27" }, "2026-10-27")).toBe(false);
  expect(allowSamCall({ samCallsToday: 400, samDay: "2026-10-26" }, "2026-10-27")).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/motion.test.js tests/cam.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Watching per board C8: samples every 500 ms, three frames 500 ms apart on motion, the dim status rows, "Pause watching", heartbeat every 60 s with the Battery API when present; speaks "Plug me in" at 20 and 12 percent, pauses under 10 (board C8b). Envelope test per C7 and C7b: a 60-second window with the prompt "mailbox door" only; "Works" posts `test works`, the second miss offers "Set it anyway" posting `pending`.

- [ ] **Step 4: Run the tests and the two-phone chain**

Run: `npx vitest run tests/motion.test.js tests/cam.test.ts`
Expected: PASS; opening and closing a real mailbox (or the printed photo swapped) chimes the iPhone within 20 s.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: motion detection, envelope test, watching, battery"
```

## Day 3

### Task 18: Help

**Files:**
- Create: `src/rosa/Help.jsx`, `src/rosa/AfterHelp.jsx`, `src/rosa/SetupHelp.jsx`, `api/_lib/routes/help.ts` (`POST /help/test`, events `help`, `help_cancel`, `help_ok`)
- Modify: `src/rosa/Home.jsx` (the 2-second hold), `src/App.jsx`, `src/ana/Family.jsx` (Help section live)
- Test: `tests/help.test.ts`

**Interfaces:**
- Produces: `holdToHelp(el: HTMLElement, onFire: () => void, ms = 2000): () => void` in `src/lib/hold.js` (pointerdown starts a timer, pointerup or pointercancel before `ms` clears it, returns the unbind function); on fire the phone posts `help`, then `window.location.assign("tel:911")` inside the same pointerup handler; the Help screen (E1) shows the Stop button posting `help_cancel`; AfterHelp (E1b) on return (`visibilitychange` back to visible after a `help` event) with Call Ana (`tel:` to the stored number) and I'm OK (`help_ok`); `POST /help/test` records `help_test` and pushes to Ana's devices; the test screen (R4b/R4c) polls `GET /help/test/:eventId` for `help_test_ack` for 30 s.
- Consumes: Task 14.

- [ ] **Step 1: Write the failing test**

```ts
test("help test resolves acked after the service worker ack", async () => {
  /* post /help/test with a Rosa token; post /push/ack {eventId} with Ana's token; GET /help/test/:id -> {acked: true} */
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/help.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement per boards R4, R4b, R4c, E1, E1b**

Copy from the boards; the setup screen's button says "Send a test to Ana's page · never dials"; Biscuit never calls `tel:` outside the hold's own pointerup.

- [ ] **Step 4: Run the test and the phone**

Run: `npx vitest run tests/help.test.ts`
Expected: PASS; on the iPhone the hold shows the system "Call 911?" sheet (press Cancel) and Ana's laptop page shows "Rosa pressed Help" within 10 s.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: help with the phone's own 911 call and family notification"
```

### Task 19: Consent, voice check and the setup chain on Rosa's phone

**Files:**
- Create: `src/rosa/VoiceCheck.jsx`, `src/rosa/Consent.jsx`, `src/rosa/Done.jsx`
- Modify: `src/App.jsx`, `api/_lib/routes/docket.ts` (`POST /events` kind `consent` sets `household.consented_at`; `PATCH /household {shareLetters}`), `src/rosa/EnterCode.jsx` (continue into the chain)
- Test: `tests/consent.test.ts`

**Interfaces:**
- Produces: the chain R1 → R2 → R3 → R4 → R5 (static Siri instructions, skippable) → Done; `POST /events {kind: "consent"}` sets `consented_at` once and is idempotent; `shareLetters` default true, stored on the household and in `store.household`.
- Consumes: Tasks 5, 18.

- [ ] **Step 1: Write the failing test**

```ts
test("consent is recorded once", async () => { /* two posts; consented_at unchanged by the second; household.consented_at not null */ });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/consent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement per boards R2, R2b, R3, R5, Done**

Consent text read aloud (R3): "I'm Biscuit. I speak up when the mail comes and when you ask. I read your letters out loud and keep a list of them on this phone. Ana sees what I read, unless you tell me not to share one. If you press Help, this phone calls 911 and Ana is told. Say stop and I stop. Shall I go on?" Three voice misses on R2 set `store.buttonsMode = true`.

- [ ] **Step 4: Run the test and the chain on the phone**

Run: `npx vitest run tests/consent.test.ts`
Expected: PASS; the chain completes and Done lists the times.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: voice check, consent, setup chain"
```

### Task 20: Failure paths, limits, delete

**Files:**
- Create: `api/_lib/limits.ts`, `api/_lib/routes/household.ts` (`DELETE /household` device and Ana, `PATCH /household`)
- Modify: every route file for the error shapes of §8; `src/rosa/*` and `src/cam/*` for the fail screens not yet built (R1 tries, C1b three refusals, C6 second miss, C7b set anyway, C8b)
- Test: `tests/limits.test.ts`, `tests/household.test.ts`

**Interfaces:**
- Produces: `checkRate(db, key: string, limit: number, windowSec: number, now: Date): Promise<boolean>` over `biscuit_rate` (upsert; false when `count >= limit` inside the window); `deviceAuth` applies 60 a minute per token; `letter/read` applies 20 an hour per household; `DELETE /household` deletes the household row (cascades) and inserts a `delete` event in a household-less audit table `biscuit_delete_count(day date primary key, count int)`; the phone's Settings screen with "Delete everything" (spoken confirmation "Delete everything? Say yes.").

- [ ] **Step 1: Write the failing tests**

```ts
test("checkRate allows 60 then refuses", async () => { /* 60 calls true, the 61st false, true again after 61 s */ });
test("delete removes everything and counts once", async () => { /* household gone, letters gone, devices gone, delete_count for today incremented */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/limits.test.ts tests/household.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the `biscuit_delete_count` table to `schema.ts` and a migration.

- [ ] **Step 4: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: rate limits, delete, remaining failure screens"
```

### Task 21: Device QA script, three runs, fixes

**Files:**
- Create: `docs/qa.md`
- Modify: whatever the runs find

- [ ] **Step 1: Write `docs/qa.md`**

Twelve steps with a pass line and a latency column: 1 Ana signs in and describes Rosa; 2 link code on the iPhone; 3 voice check; 4 consent; 5 Help test reaches Ana's page; 6 mailbox phone joins and finds the printed mailbox; 7 envelope test; 8 mail motion chimes the iPhone (≤ 20 s); 9 the sample bill is read with quotes (≤ 12 s); 10 question, offer, hand-off, Waive start page opens on the laptop; 11 Help hold shows "Call 911?" (cancel) and Ana's page; 12 delete everything.

- [ ] **Step 2: Run it three times on the real devices, deployed**

Run: `./deploy.sh` then the script.
Expected: every step passes on the third run; failures from earlier runs are fixed and committed one by one.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: device QA script and fixes"
```

### Task 22: README and privacy

**Files:**
- Create or modify: `README.md`

- [ ] **Step 1: Write it**

Sections: what Biscuit is (three paragraphs), install from a link, the Meta models and where each is used (table), the disclosure table (what was built when; nothing before 2026-10-27 but this spec and the scaffold scripts; Waive unchanged), privacy (the ten rules of §11), limits (no wake word, Standard mode, English only, one family member, Informed Delivery not built), how to run locally (`vercel dev`, `.env.local.example`), tests (`npm test`).

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: README with model disclosure and privacy"
```

## Day 4

### Task 23: Video and submission

- [ ] **Step 1: Record the segments from the deployed site** per §13 timing (0:00 problem, 0:25 chime, 0:50 reading, 1:30 question and offer, 1:55 Waive and Ana's page, 2:25 Help, 2:45 models and what is kept), one take per segment, two phones and a laptop.
- [ ] **Step 2: Cut to under 3:00, export 1080p.**
- [ ] **Step 3: Make the repository public** (`gh repo create kindred-ai/biscuit --public --source=. --push` or the GitHub UI), check the README against the rules, confirm `.env.local` is not in history (`git log --all -- .env.local` prints nothing).
- [ ] **Step 4: Submit the Cerebral Valley form** with the repo and video links; recheck https://biscuit.kindred-ai.dev after submission.
- [ ] **Step 5: Tag** `git tag v0.1.0-hackathon && git push --tags`.

## Should items (only after Task 21 passes on Day 3 before 14:00)

- Loudness step (R2 "Louder" raises `speak` volume one step), buttons mode retry from Ana's page, "don't share this one" (voice phrase sets the letter hidden), picked-up event (second door-open after a delivery), Baseten second reader behind `READER_SECOND=baseten` (amounts and dates must agree or the fact is unverified), streaming ASR.
