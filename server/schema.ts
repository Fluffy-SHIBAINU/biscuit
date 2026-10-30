import { bigserial, boolean, date, doublePrecision, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const DEVICE_KINDS = ["rosa", "cam", "ana"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export const EVENT_KINDS = [
  "mail_seen", "mail_due", "mail_tapped", "letter_read", "handoff", "help", "help_cancel", "help_ok", "help_test", "help_test_ack",
  "cam_online", "cam_offline", "cam_battery", "cam_paused", "cam_motion", "cam_frozen", "consent", "said", "rosa_said", "delete", "look_requested", "shadow_read",
] as const;
export const READ_BY = ["single", "twice", "once"] as const;
export type ReadBy = (typeof READ_BY)[number];
/** A fact two readers read two ways: the field and each reader's value and quote. The same kind of content as `quotes`. */
export type Check = { field: string; quotes: { reader: string; value: string; quote: string }[] };
export type EventKind = (typeof EVENT_KINDS)[number];
export type Region = { x: number; y: number; w: number; h: number };
/** Who set the watched box: "sam" for SAM 3.1's find (padded by a fifth on each side), "hand" for a box the person drew over the live preview. */
export const REGION_SOURCES = ["sam", "hand"] as const;
export type RegionSource = (typeof REGION_SOURCES)[number];
export type GuessLabel = "carrier" | "nothing" | "other";
/** Biscuit's guess on a clip as it was made (server/clips.ts guessLabel): the label, how sure, the prompt it rests on (null when nothing fired), the rule's version; `auto` when Biscuit classified the clip itself, `rejected` when Ana said Not right. */
export type Guess = { label: GuessLabel; confidence: number; prompt: string | null; version: number; auto?: boolean; rejected?: boolean };
/** One prompt's record at this box: what it means here (the default mapping, or one learned from the taps), its own floor when raised, and how often a clip whose guess rested on it was tapped as it predicted. */
export type PromptStat = { label: GuessLabel; learned: boolean; floor: number | null; fired: number; agreed: number; precision: number | null };
/** What a household's taps on its clips taught its one mailbox (server/clips.ts): counts, the floor and gate applied (null keeps the default), how the taps fare under them, each prompt's record, and what Biscuit classified itself. */
export type Tuning = { taps: number; positives: number; negatives: number; floor: number | null; gate: number | null; caught: number; falseAlarms: number; at: string; prompts?: Record<string, PromptStat>; auto?: { classified: number; corrected: number } };
/** Who put the label on a clip: Ana's tap, or Biscuit at a well-taught box. */
export const LABELLED_BY = ["ana", "biscuit"] as const;
export type LabelledBy = (typeof LABELLED_BY)[number];

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const household = pgTable("biscuit_household", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerEmail: text("owner_email").notNull(),
  seniorName: text("senior_name").notNull(),
  called: text("called").notNull(),
  relation: text("relation"),
  living: text("living"),
  language: text("language").notNull().default("en"),
  shareLetters: boolean("share_letters").notNull().default(true),
  /** Minutes after local midnight when the mail usually comes (Ana's guess; Rosa's phone chimes then if the box was not seen), and the household's IANA zone, said by Rosa's phone. */
  mailMinutes: integer("mail_minutes"),
  tz: text("tz"),
  /** Clips, Ana's two choices on her page, both off until she turns them on: keep short clips of the box for her to check, and let the clips she tapped into the de-identified export. Each time is when the choice was turned on. */
  keepClips: boolean("keep_clips").notNull().default(false),
  keepClipsAt: ts("keep_clips_at"),
  shareClips: boolean("share_clips").notNull().default(false),
  shareClipsAt: ts("share_clips_at"),
  consentedAt: ts("consented_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const device = pgTable("biscuit_device", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: DEVICE_KINDS }).notNull(),
  tokenHash: text("token_hash").unique(),
  label: text("label"),
  pushSubscription: jsonb("push_subscription"),
  lastSeenAt: ts("last_seen_at"),
  battery: integer("battery"),
  charging: boolean("charging"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const linkCode = pgTable("biscuit_link_code", {
  code: text("code").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["rosa", "cam"] }).notNull(),
  expiresAt: ts("expires_at").notNull(),
  tries: integer("tries").notNull().default(0),
  usedAt: ts("used_at"),
});

export const event = pgTable("biscuit_event", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  householdId: uuid("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id"),
  kind: text("kind").notNull(),
  at: ts("at").notNull().defaultNow(),
  data: jsonb("data").notNull().default({}),
});

export const letter = pgTable("biscuit_letter", {
  id: uuid("id").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  readAt: ts("read_at").notNull(),
  kind: text("kind").notNull(),
  sender: text("sender"),
  hospitalCcn: text("hospital_ccn"),
  amountCents: integer("amount_cents"),
  statementOn: date("statement_on"),
  dueOn: date("due_on"),
  quotes: jsonb("quotes").notNull().default([]),
  answers: jsonb("answers").notNull().default({}),
  status: text("status").notNull().default("read"),
  needsReview: boolean("needs_review").notNull().default(false),
  readBy: text("read_by", { enum: READ_BY }),
  checks: jsonb("checks").$type<Check[]>().notNull().default([]),
  lookRequestedAt: ts("look_requested_at"),
});

export const cam = pgTable("biscuit_cam", {
  householdId: uuid("household_id").primaryKey().references(() => household.id, { onDelete: "cascade" }),
  region: jsonb("region").$type<Region>().notNull(),
  setAt: ts("set_at").notNull(),
  lastMotionAt: ts("last_motion_at"),
  samCallsToday: integer("sam_calls_today").notNull().default(0),
  samDay: date("sam_day"),
  paused: boolean("paused").notNull().default(false),
  /** Set while the mailbox phone reports a frozen camera stream (heartbeats keep coming, frames do not); cleared when it reports live again. */
  frozenAt: ts("frozen_at"),
  /** Who set the box (REGION_SOURCES); null for a box set before this was recorded. */
  regionSource: text("region_source", { enum: REGION_SOURCES }),
  /** Learned from Ana's taps on this one mailbox (server/clips.ts): the SAM score floor and the phone's motion gate, null until the taps support a number; `tuning` is the summary her page shows. */
  floor: doublePrecision("floor"),
  gate: doublePrecision("gate"),
  tuning: jsonb("tuning").$type<Tuning>(),
});

/** A kept mailbox movement: the founder's collect-mode frames (every prompt's score, full frames, kept with the household), or a clip for a household that opted in (the watch prompts' scores, up to eight small frames, retention in server/clips.ts). `label` is the tap or the sheet's word; `labelledAt` the time of the tap. */
export const camSample = pgTable("biscuit_cam_sample", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  householdId: uuid("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id"),
  at: ts("at").notNull().defaultNow(),
  test: boolean("test").notNull().default(false),
  level: real("level"),
  seen: text("seen"),
  scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
  frames: jsonb("frames").$type<string[]>().notNull().default([]),
  label: text("label"),
  clip: boolean("clip").notNull().default(false),
  labelledAt: ts("labelled_at"),
  /** Biscuit's guess as the clip was made, and who labelled it (null for a tap recorded before this was kept: Ana's). */
  guess: jsonb("guess").$type<Guess>(),
  labelledBy: text("labelled_by", { enum: LABELLED_BY }),
});

export const rate = pgTable("biscuit_rate", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

/** Deletions are counted by day and nothing else survives a delete. */
export const deleteCount = pgTable("biscuit_delete_count", {
  day: date("day").primaryKey(),
  count: integer("count").notNull().default(0),
});
