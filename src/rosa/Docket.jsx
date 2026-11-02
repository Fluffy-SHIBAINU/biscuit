import React, { useEffect, useRef } from "react";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { groupByDay, readLines, senderOf, sentToAna, todayLine } from "../lib/mails.js";
import { statusLine } from "../lib/letters.js";
import { store, useStore } from "../lib/store.js";

const KIND = { bill: "Bill", notice: "Notice", utility: "Utility", ad: "Ad", other: "Letter" };
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** My Mails: every letter Biscuit has read, newest day first, each with Open and Read the Letter to Me. One line on landing. */
export default function Docket() {
  const s = useStore();
  const letters = s.docket.filter((l) => l.status !== "hidden");
  const groups = groupByDay(letters);
  const alive = useRef(true);
  const open = (l) => { stopSpeaking(); store.set({ lastReading: { ...l } }); navigate("/reading"); };
  const read = (l) => { stopSpeaking(); speak(readLines(l)); };
  useEffect(() => { alive.current = true; speak([todayLine(letters)]); return () => { alive.current = false; stopSpeaking(); }; }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">My Mails</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <h1 className="display small">{letters.length === 0 ? "No Mail Read Yet" : letters.length === 1 ? "One Letter" : `${letters.length} Letters`}</h1>
      {groups.map((g) => (
        <section key={g.day} className="mailday">
          <span className="label">{g.label}</span>
          {g.letters.map((l, i) => (
            <article key={l.id} className="mail">
              <div className="row between"><span className="row"><span className={`pill ${l.status === "handoff" ? "signal" : l.status === "unknown_number" ? "bad" : "warn"}`}>{KIND[l.kind] || "Letter"}</span>{sentToAna(l) && <span className="pill ok">Sent</span>}</span><span className="label plain">{clock(l.readAt)}</span></div>
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
    </main>
  );
}
