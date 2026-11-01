import React, { useEffect, useRef } from "react";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { askChoices, cancelChoices } from "../lib/hear.js";
import { groupByDay, mailChoices, mailsLine, readLine, senderOf } from "../lib/mails.js";
import { statusLine } from "../lib/letters.js";
import { store, useStore } from "../lib/store.js";

const KIND = { bill: "Bill", notice: "Notice", utility: "Utility", ad: "Ad", other: "Letter" };
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** My Mails: every letter Biscuit has read, newest day first, each with Open and Read the Letter to Me; by voice too. */
export default function Docket() {
  const s = useStore();
  const letters = s.docket.filter((l) => l.status !== "hidden");
  const groups = groupByDay(letters);
  const ordered = groups.flatMap((g) => g.letters);
  const alive = useRef(true);
  const open = (l) => { cancelChoices(); stopSpeaking(); store.set({ lastReading: { ...l } }); navigate("/reading"); };
  const read = async (l) => { cancelChoices(); stopSpeaking(); await speak([readLine(l)]); if (alive.current) listenForOne(false); };

  // Biscuit says what there is and how to ask; "open two" or "read the one from Eversource" does it.
  async function listenForOne(sayList = true) {
    const key = await askChoices({ lines: sayList ? [mailsLine(ordered)] : [], sayOptions: false, options: mailChoices(ordered), alive: () => alive.current });
    if (!alive.current || !key) return;
    const [verb, id] = key.split(":");
    const l = ordered.find((x) => String(x.id) === id);
    if (!l) return;
    if (verb === "open") open(l); else read(l);
  }
  useEffect(() => { alive.current = true; if (ordered.length) listenForOne(); else speak(["No mail read yet. Say read a new letter when one comes."]); return () => { alive.current = false; cancelChoices(); stopSpeaking(); }; }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">My Mails</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); cancelChoices(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <h1 className="display small">{letters.length === 0 ? "No Mail Read Yet" : letters.length === 1 ? "One Letter" : `${letters.length} Letters`}</h1>
      {groups.map((g) => (
        <section key={g.day} className="mailday">
          <span className="label">{g.label}</span>
          {g.letters.map((l, i) => (
            <article key={l.id} className="mail">
              <div className="row between"><span className={`pill ${l.status === "handoff" ? "signal" : l.status === "unknown_number" ? "bad" : "warn"}`}>{KIND[l.kind] || "Letter"}</span><span className="label plain">{clock(l.readAt)}</span></div>
              <strong className="mail-from">{senderOf(l).replace(/^someone else's letter$/, "Someone Else's Letter").replace(/^an unknown sender$/, "Unknown Sender")}</strong>
              <span className="lead small">{statusLine(l)}</span>
              <div className="row pair">
                <button type="button" className="btn secondary small" onClick={() => open(l)}>Open</button>
                <button type="button" className="btn secondary small" onClick={() => read(l)}>Read the Letter to Me</button>
              </div>
            </article>
          ))}
        </section>
      ))}
      <div className="spacer" />
      <p className="foot">Say <strong>open one</strong> or <strong>read one</strong>, or the name on the letter.</p>
    </main>
  );
}
