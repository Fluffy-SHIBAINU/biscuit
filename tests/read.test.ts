import { expect, test } from "vitest";
import { attempt, readWith, withTimeout } from "../server/read.js";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const X = { kind: "bill", sender: { value: "Mass General", quote: "Mass General" }, hospital_name: null, amount_due: { value: "$10.00", quote: "Amount Due: $10.00" }, statement_date: null, due_date: null, financial_assistance: null, phone_numbers: [], account_last4: null } as any;
const jpeg = Buffer.from("ffd8ffd9", "hex");

test("withTimeout passes a fast value and rejects a slow one", async () => {
  expect(await withTimeout(Promise.resolve(1), 50)).toBe(1);
  await expect(withTimeout(new Promise((r) => setTimeout(() => r(2), 200)), 20)).rejects.toThrow("timeout");
});

test("readWith: a short page or no sender is unreadable; otherwise facts verified against that reader's own text", async () => {
  expect(await readWith({ transcribe: async () => "Hi there", extract: async () => X }, jpeg)).toBeNull();
  expect(await readWith({ transcribe: async () => words(50), extract: async () => ({ ...X, sender: null }) }, jpeg)).toBeNull();
  const read = await readWith({ transcribe: async () => `${words(50)} Mass General Amount Due: $10.00`, extract: async () => X }, jpeg);
  expect(read?.senderName).toBe("Mass General");
  expect(read?.facts.find((f) => f.field === "amount_due")?.verified).toBe(true);
});

test("attempt reports ok, unreadable, failed and timeout with milliseconds", async () => {
  const good = { transcribe: async () => `${words(50)} Mass General Amount Due: $10.00`, extract: async () => X };
  expect(await attempt("meta", good, jpeg, 1000)).toMatchObject({ name: "meta", status: "ok" });
  expect(await attempt("meta", { ...good, transcribe: async () => "short" }, jpeg, 1000)).toMatchObject({ status: "unreadable", read: null });
  expect(await attempt("fireworks", { ...good, transcribe: async () => { throw new Error("boom"); } }, jpeg, 1000)).toMatchObject({ status: "failed", read: null, error: "boom" });
  const slow = await attempt("fireworks", { ...good, transcribe: () => new Promise((r) => setTimeout(() => r("x"), 300)) }, jpeg, 20);
  expect(slow.status).toBe("timeout");
  expect(slow.ms).toBeGreaterThanOrEqual(15);
});

test("attempt carries the reader's label so the screens can name the model", async () => {
  const good = { label: "DeepSeek V4.1 Flash on Fireworks", transcribe: async () => `${words(50)} Mass General Amount Due: $10.00`, extract: async () => X };
  expect(await attempt("fireworks", good, jpeg, 1000)).toMatchObject({ name: "fireworks", label: "DeepSeek V4.1 Flash on Fireworks", status: "ok" });
  expect(await attempt("meta", { transcribe: good.transcribe, extract: good.extract }, jpeg, 1000)).not.toHaveProperty("label");
});
