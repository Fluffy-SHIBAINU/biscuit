import { bigserial, boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const DEVICE_KINDS = ["rosa", "cam", "ana"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export const EVENT_KINDS = [
  "mail_seen", "mail_tapped", "letter_read", "handoff", "help", "help_cancel", "help_ok", "help_test", "help_test_ack",
  "cam_online", "cam_offline", "cam_battery", "cam_paused", "consent", "said", "delete",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export type Region = { x: number; y: number; w: number; h: number };

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
});

export const cam = pgTable("biscuit_cam", {
  householdId: uuid("household_id").primaryKey().references(() => household.id, { onDelete: "cascade" }),
  region: jsonb("region").$type<Region>().notNull(),
  setAt: ts("set_at").notNull(),
  testStatus: text("test_status").notNull().default("pending"),
  lastMotionAt: ts("last_motion_at"),
  samCallsToday: integer("sam_calls_today").notNull().default(0),
  samDay: date("sam_day"),
  paused: boolean("paused").notNull().default(false),
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
