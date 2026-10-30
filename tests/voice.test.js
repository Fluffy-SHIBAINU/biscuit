import { expect, test } from "vitest";
import { pickVoice, sentences } from "../src/lib/voice.js";

const v = (name, lang = "en-US", localService = true) => ({ name, lang, localService, voiceURI: name });

// The phone's best English voice: an enhanced or premium one over a compact one, a warm male voice first since Biscuit is "he",
// a named choice over everything, and never a non-English voice.
test("pickVoice prefers a premium or enhanced English voice, male first, and honours a saved name", () => {
  const voices = [v("Samantha"), v("Tom (Enhanced)"), v("Ava (Premium)"), v("Thomas", "fr-FR"), v("Google US English", "en-US", false)];
  expect(pickVoice(voices).name).toBe("Tom (Enhanced)");
  expect(pickVoice(voices, { prefer: "female" }).name).toBe("Ava (Premium)");
  expect(pickVoice(voices, { name: "Samantha" }).name).toBe("Samantha");
  expect(pickVoice(voices, { name: "Nobody" }).name).toBe("Tom (Enhanced)");
  expect(pickVoice([v("Thomas", "fr-FR")])).toBeNull();
  expect(pickVoice([])).toBeNull();
  expect(pickVoice([v("Samantha"), v("Google US English", "en-US", false)]).name).toBe("Google US English");
});

// Long lines are spoken sentence by sentence, so the voice breathes between them and a stop lands at a sentence end.
test("sentences splits on sentence ends and keeps short lines whole", () => {
  expect(sentences("This is from Mass General. It looks like a bill. The amount due is $1,850.00.")).toEqual(["This is from Mass General.", "It looks like a bill.", "The amount due is $1,850.00."]);
  expect(sentences("Shall I send this to Ana?")).toEqual(["Shall I send this to Ana?"]);
  expect(sentences("Dr. Smith's office called. Call 1-800-633-4227.")).toEqual(["Dr. Smith's office called.", "Call 1-800-633-4227."]);
  expect(sentences("")).toEqual([]);
});
