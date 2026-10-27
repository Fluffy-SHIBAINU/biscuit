import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { pushSupported, subscribePush } from "../lib/push.js";
import SignIn from "./SignIn.jsx";

const WAIVE = "https://waive.kindred-ai.dev";
const KIND = { bill: "Bill", notice: "Notice", utility: "Utility", ad: "Advertising", other: "Letter" };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const money = (c) => (Number.isInteger(c) ? `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null);
const CAMERA_LINE = { online: "Online", offline: "Offline", paused: "Paused", not_set: "Not set up" };

function letterLine(l) {
  const parts = [money(l.amountCents), l.statementOn ? `statement ${l.statementOn}` : null, l.dueOn ? `due ${l.dueOn}` : null].filter(Boolean);
  const status = { handoff: "Waive case started, with Rosa's yes", waiting_hospital: "Waiting on the hospital", tossed: "Rosa tossed it", unknown_number: "Asks for a call to a number nobody publishes. Sent to you." }[l.status];
  return [parts.join(", "), status].filter(Boolean).join(" · ");
}

export default function Family() {
  const [fam, setFam] = useState(null);
  const [state, setState] = useState("loading");
  const [note, setNote] = useState("");
  const load = () => api("/family").then((f) => { setFam(f); setState("ok"); }).catch((e) => setState(e?.status === 401 ? "signin" : e?.status === 404 ? "new" : "error"));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (state === "signin") return <SignIn />;
  if (state === "new") { navigate("/ana/new"); return null; }
  if (state !== "ok") return <main className="screen ana"><span className="label">Biscuit · family page</span><p className="lead small">{state === "error" ? "Couldn't load the page. Try again in a moment." : "One moment."}</p></main>;

  const { household: h, letters, said, events, camera, help, devices } = fam;
  const needs = letters.filter((l) => l.status === "handoff" || l.needsReview);
  const rosaPhone = devices.find((d) => d.kind === "rosa");
  const act = (path, msg) => () => api(path, { method: "POST" }).then(() => { setNote(msg); load(); }).catch(() => setNote("That didn't work. Try again."));

  return (
    <main className="screen ana wide">
      <header className="row between wrap">
        <div><span className="label">Biscuit · family page</span><h1 className="display small">{h.called}</h1></div>
        <span className="label plain right">Signed in with Kindred ID<br />{h.called} shares letters and actions · she can hide any letter</span>
      </header>
      {note && <p className="lead small signal">{note}</p>}
      <div className="cols">
        <section className="card grow">
          <h2 className="h2">Letters Biscuit read</h2>
          {letters.length === 0 && <p className="lead small muted">None yet. When Biscuit reads a letter on {h.called}'s phone, it shows here.</p>}
          {letters.map((l) => (
            <div key={l.id} className="fact">
              <div className="row between"><span className={`pill ${l.status === "unknown_number" ? "bad" : l.kind === "bill" ? "signal" : "warn"}`}>{l.status === "unknown_number" ? "Unknown number" : KIND[l.kind] || "Letter"}</span><span className="label plain">{when(l.readAt)}</span></div>
              <strong>{l.sender || "Unknown sender"}</strong>
              <span className="lead small">{letterLine(l) || "Read aloud."}</span>
              {l.quotes?.length > 0 && <span className="quote small">{l.quotes.slice(0, 3).map((q, i) => <span key={i} className="mark">“{q.quote}”</span>).reduce((a, b) => [a, " · ", b])}</span>}
              {l.status === "handoff" && l.hospitalCcn && <a className="link" href={`${WAIVE}/start?ccn=${l.hospitalCcn}`} target="_blank" rel="noreferrer">Open in Waive</a>}
            </div>
          ))}
        </section>
        <div className="stack">
          <section className="card night">
            <span className="label night">Needs you</span>
            {needs.length ? needs.map((l) => (
              <div key={l.id} className="stack tight">
                <p className="lead small">{l.status === "handoff" ? `${l.sender}: ${h.called} said yes to the application. Open it in Waive, check what Biscuit read, and approve the packet.` : `${l.sender || "A letter"} needs a look.`}</p>
                {l.hospitalCcn && <a className="btn ana light" href={`${WAIVE}/start?ccn=${l.hospitalCcn}`} target="_blank" rel="noreferrer">Review in Waive</a>}
              </div>
            )) : <p className="lead small">Nothing waiting on you.</p>}
          </section>
          <section className="card">
            <span className="label">Biscuit said</span>
            {said.length === 0 && <p className="lead small muted">Nothing yet today.</p>}
            {said.slice(0, 6).map((e, i) => <p key={i} className="said"><span className="label plain">{clock(e.at)}</span> “{e.text}”</p>)}
            <span className="label plain">What Biscuit said is kept. {h.called}'s voice is not.</span>
          </section>
          <section className="card">
            <span className="label">Mailbox phone</span>
            <div className="row"><span className={`pill ${camera.status === "online" ? "ok" : camera.status === "not_set" ? "warn" : "bad"}`}>{CAMERA_LINE[camera.status]}</span><span className="lead small">{camera.status === "not_set" ? "No spare phone yet." : [camera.battery != null ? `${camera.charging ? "plugged in" : "on battery"}, ${camera.battery}%` : null, camera.lastMotionAt ? `last movement ${clock(camera.lastMotionAt)}` : "no movement seen yet", camera.testStatus === "pending" ? "test pending" : null].filter(Boolean).join(" · ")}</span></div>
            <div className="row wrap">
              {camera.status === "paused" ? <button type="button" className="btn ana small" onClick={act("/cam/resume", "Watching again.")}>Resume watching</button> : camera.status !== "not_set" && <button type="button" className="btn ana small" onClick={act("/cam/pause", "Paused. Nothing leaves the mailbox phone until you resume.")}>Pause watching</button>}
              <button type="button" className="btn ana small" onClick={() => navigate("/ana/link?kind=cam")}>{camera.status === "not_set" ? "Set up a spare phone" : "Find the mailbox again"}</button>
            </div>
            <span className="label plain">Watches the box region only · frames checked, then discarded · nothing stored, nothing streamed</span>
          </section>
          <section className="card">
            <span className="label">Help</span>
            <div className="row"><span className={`pill ${help.acked ? "ok" : "warn"}`}>{help.acked ? "Tested" : "Untested"}</span><span className="lead small">{h.called}'s phone calls 911 · this page is told at once{help.lastTestAt ? ` · last test ${when(help.lastTestAt)}` : ""}</span></div>
            {help.openHelpAt && <p className="lead small bad">{h.called} pressed Help at {clock(help.openHelpAt)}. Her phone called 911.</p>}
            <div className="row wrap">
              {pushSupported() && <button type="button" className="btn ana small" onClick={() => subscribePush({ ana: true }).then(() => setNote("This device will buzz when Rosa presses Help.")).catch(() => setNote("Notifications were not allowed."))}>Get notified on this device</button>}
              <button type="button" className="btn ana small" onClick={() => navigate("/ana/link")}>{rosaPhone ? "Link another phone" : "Link Rosa's phone"}</button>
            </div>
          </section>
          <section className="card">
            <span className="label">Recent</span>
            {events.slice(0, 8).map((e) => <p key={e.id} className="said"><span className="label plain">{when(e.at)}</span> {({ mail_seen: "Mail came.", handoff: "Waive case started.", help: "Help pressed.", help_cancel: "Help cancelled.", help_ok: `${h.called} said she's OK.`, help_test: "Help test sent.", help_test_ack: "Help test reached this page.", consent: `${h.called} said yes to Biscuit.` })[e.kind] || e.kind}</p>)}
          </section>
        </div>
      </div>
      <p className="foot">Nothing on this page goes to a hospital. You approve every application in Waive. {h.called} can keep any letter off this page by saying "don't share this one". Say "stop" to Biscuit and he stops.</p>
    </main>
  );
}
