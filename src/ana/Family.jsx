import React, { useEffect, useState } from "react";
import Details from "../components/Details.jsx";
import { api } from "../lib/api.js";
import { cameraLine, cameraSummary } from "../lib/camline.js";
import { seenWords } from "../lib/clips.js";
import { readerName } from "../lib/letters.js";
import { helpLine, lettersLine, readersLine, recentLine, saidLine } from "../lib/lines.js";
import { mailTimeLine } from "../lib/mailtime.js";
import { navigate, useSearch } from "../lib/navigate.js";
import { isAdminView } from "../lib/admin.js";
import { pushSupported, subscribePush } from "../lib/push.js";
import { ClipCarousel, ClipConsent, ClipConsentDetails } from "./Clips.jsx";
import MailTime from "./MailTime.jsx";
import SignIn from "./SignIn.jsx";

const WAIVE = "https://waive.kindred-ai.dev";
const KIND = { bill: "Bill", notice: "Notice", utility: "Utility", ad: "Advertising", other: "Letter" };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const money = (c) => (Number.isInteger(c) ? `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null);
const CAMERA_LINE = { online: "Online", offline: "Offline", paused: "Paused", asleep: "Camera Asleep", not_set: "Not Set Up" };
const FIELD_PHRASE = { amount_due: "The amount", statement_date: "The statement date", due_date: "The due date", sender: "The sender", hospital_name: "The hospital's name", account_last4: "The account number", phone_numbers: "A phone number", financial_assistance: "The help-paying line" };
const READER_STATE = { ok: ["ok", "OK"], timeout: ["bad", "Timed Out"], failed: ["bad", "Error"], unreadable: ["warn", "Couldn't Read"] };

/** The pill that says how a letter was read: twice and clean, twice with a line read two ways, or once. */
export function readPill(l) {
  if (l.readBy === "once") return ["warn", "Read Once"];
  if (l.readBy === "twice") return l.checks?.length ? ["warn", "Check"] : ["ok", "Read Twice ✓"];
  return null;
}

function letterLine(l) {
  const parts = [money(l.amountCents), l.statementOn ? `statement ${l.statementOn}` : null, l.dueOn ? `due ${l.dueOn}` : null].filter(Boolean);
  const status = { handoff: "Waive case started, with Rosa's yes", waiting_hospital: "Waiting on the hospital", tossed: "Rosa tossed it", unknown_number: "Asks for a call to a number nobody publishes. Sent to you." }[l.status];
  return [parts.join(", "), status].filter(Boolean).join(" · ");
}

export default function Family() {
  const [fam, setFam] = useState(null);
  const [state, setState] = useState("loading");
  const [note, setNote] = useState("");
  const search = useSearch();
  const load = () => api("/family").then((f) => { setFam(f); setState("ok"); }).catch((e) => setState(e?.status === 401 ? "signin" : e?.status === 404 ? "new" : "error"));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (state === "signin") return <SignIn />;
  if (state === "new") { navigate("/ana/new"); return null; }
  if (state !== "ok") return <main className="screen ana"><span className="label">Biscuit · Family Page</span><p className="lead small">{state === "error" ? "Couldn't load the page. Try again in a moment." : "One Moment"}</p></main>;

  const { household: h, letters, said, events, camera, help, devices, readers } = fam;
  // The admin view: the founder's household and ?admin=1, never anyone else; nothing of it is rendered otherwise.
  const adminView = isAdminView(search, h.admin);
  const Admin = ({ children }) => (adminView ? <Details open>{children}</Details> : null);
  const needs = letters.filter((l) => l.status === "handoff" || l.needsReview);
  const rosaPhone = devices.find((d) => d.kind === "rosa");
  const act = (path, msg) => () => api(path, { method: "POST" }).then(() => { setNote(msg); load(); }).catch(() => setNote("That didn't work. Try again."));
  const RECENT = { cam_frozen: "The camera fell asleep; the mailbox phone needs a tap.", mail_seen: "Mail came.", mail_due: "Chimed: the mail usually comes about now.", handoff: "Waive case started.", help: "Help pressed.", help_cancel: "Help cancelled.", help_ok: `${h.called} said she's OK.`, help_test: "Help test sent.", help_test_ack: "Help test reached this page.", consent: `${h.called} said yes to Biscuit.` };
  const recentWords = (e) => RECENT[e.kind] || (e.kind === "rosa_said" ? `${h.called} said: “${e.data?.text || ""}”` : e.kind === "look_requested" ? `Asked ${h.called} for another look at the letter from ${e.data?.sender || "a sender"}.` : e.kind === "cam_motion" ? (e.data?.seen ? `Movement at the box · saw ${seenWords(e.data.seen)}.` : "Movement at the box · nothing recognised.") : e.kind);

  return (
    <main className="screen ana wide">
      <header className="row between wrap">
        <div><span className="label">Biscuit · Family Page</span><h1 className="display small">{h.called}</h1></div>
        <span className="label plain right">Signed in with Kindred ID</span>
      </header>
      {note && <p className="lead small signal">{note}</p>}
      <div className="cols">
        <section className="card grow">
          <h2 className="h2">Letters Biscuit Read</h2>
          {lettersLine(letters.length) && <p className="lead small muted">{lettersLine(letters.length)}</p>}
          {letters.map((l) => (
            <div key={l.id} className="fact">
              <div className="row between"><span className="row"><span className={`pill ${l.status === "unknown_number" ? "bad" : l.kind === "bill" ? "signal" : "warn"}`}>{l.status === "unknown_number" ? "Unknown Number" : KIND[l.kind] || "Letter"}</span>{readPill(l) && <span className={`pill ${readPill(l)[0]}`}>{readPill(l)[1]}</span>}</span><span className="label plain">{when(l.readAt)}</span></div>
              <strong>{l.sender || "Unknown sender"}</strong>
              <span className="lead small">{letterLine(l) || "Read aloud."}</span>
              {l.quotes?.length > 0 && <span className="quote small">{l.quotes.slice(0, 3).map((q, i) => <span key={i} className="mark">“{q.quote}”</span>).reduce((a, b) => [a, " · ", b])}</span>}
              {(l.checks || []).map((c) => (
                <p key={c.field} className="lead small">{FIELD_PHRASE[c.field] || "One line"} was read two ways and not said to {h.called}: {c.quotes.map((q, i) => <span key={i}>{i > 0 && " · "}<span className="quote"><span className="mark">“{q.quote}”</span></span> <span className="label plain">{readerName(q.reader)}</span></span>)}</p>
              ))}
              {(l.checks?.length > 0 || l.readBy === "once") && (
                <div className="row wrap">
                  <button type="button" className="btn ana small" onClick={act(`/family/letter/${l.id}/again`, `${h.called}'s phone will ask her to show it again. Both readers read it again; Biscuit keeps no picture.`)}>Ask {h.called} for Another Look</button>
                  {l.lookRequestedAt && <span className="label plain">Asked {when(l.lookRequestedAt)}</span>}
                </div>
              )}
              {l.status === "handoff" && l.hospitalCcn && <a className="link" href={`${WAIVE}/start?ccn=${l.hospitalCcn}`} target="_blank" rel="noreferrer">Open in Waive</a>}
            </div>
          ))}
          <Admin>
            <span className="label plain">When Biscuit reads a letter on {h.called}'s phone, its summary shows here: the sender, the amount, the dates and the quotes Biscuit spoke, never the picture or the full text. Letters she hid never appear. Read Twice means two readers agreed on what was said; Check means a line was read two ways and not spoken.</span>
          </Admin>
        </section>
        {(h.keepClips || camera.clips?.total > 0) && <ClipCarousel household={h} camera={camera} onLabelled={load} admin={adminView} />}
        <div className="stack">
          <section className="card night">
            <span className="label night">Needs You</span>
            {needs.length ? needs.map((l) => (
              <div key={l.id} className="stack tight">
                <p className="lead small">{l.status === "handoff" ? `${l.sender}: ${h.called} said yes to the application. Open it in Waive, check what Biscuit read, and approve the packet.` : l.checks?.length ? `${l.sender || "A letter"}: ${l.checks.length === 1 ? "one line" : `${l.checks.length} lines`} read two ways, not said to ${h.called}. See the letter, or ask her for another look.` : `${l.sender || "A letter"} needs a look.`}</p>
                {l.hospitalCcn && <a className="btn ana light" href={`${WAIVE}/start?ccn=${l.hospitalCcn}`} target="_blank" rel="noreferrer">Review in Waive</a>}
              </div>
            )) : <p className="lead small">Nothing Waiting on You</p>}
          </section>
          <section className="card">
            <span className="label">Biscuit Said</span>
            {saidLine(said.length) && <p className="lead small muted">{saidLine(said.length)}</p>}
            {said.slice(0, 6).map((e, i) => <p key={i} className="said"><span className="label plain">{clock(e.at)}</span> “{e.text}”</p>)}
            <Admin>
              <span className="label plain">What Biscuit said is kept. {h.called}'s voice is not.</span>
            </Admin>
          </section>
          <section className="card">
            <span className="label">Readers</span>
            <p className="lead small">{readersLine(readers)}</p>
            <Admin>
              {readers && <span className="label plain">Last letter {when(readers.at)}. Two readers read every letter; {h.called} hears only what both read the same way.</span>}
              {!readers && <span className="label plain">Two readers read every letter; {h.called} hears only what both read the same way.</span>}
              {readers && readers.list.map((r) => <div key={r.name} className="row"><span className={`pill ${r.shadow ? "signal" : (READER_STATE[r.status] || READER_STATE.failed)[0]}`}>{r.shadow ? "Shadow" : (READER_STATE[r.status] || READER_STATE.failed)[1]}</span><span className="label plain">{readerName(r)}{r.shadow ? ` · ${r.status === "ok" ? `agreed on ${r.agreed} of ${r.of}` : (READER_STATE[r.status] || READER_STATE.failed)[1].toLowerCase()}` : ""}{Number.isFinite(r.ms) ? ` · ${(r.ms / 1000).toFixed(1)} s` : ""}</span></div>)}
              <span className="label plain">Meta's reader is Spark 1.3 on Meta Model API; the second reader is DeepSeek V4.1 Flash on Fireworks. Kindred's reader, Meta's Glimmer 30B trained on synthetic letters, reads in the shadow: logged here, never spoken.</span>
            </Admin>
          </section>
          <section className="card">
            <span className="label">Mailbox Phone</span>
            <div className="row wrap"><span className={`pill ${camera.status === "online" ? "ok" : camera.status === "not_set" || camera.status === "asleep" ? "warn" : "bad"}`}>{CAMERA_LINE[camera.status]}</span>{camera.status === "online" && <span className="lead small">{cameraSummary(camera, h, clock)}</span>}</div>
            <div className="row wrap">
              {camera.status === "paused" ? <button type="button" className="btn ana small" onClick={act("/cam/resume", "Watching again.")}>Resume Watching</button> : camera.status !== "not_set" && <button type="button" className="btn ana small" onClick={act("/cam/pause", "Paused. Nothing leaves the mailbox phone until you resume.")}>Pause Watching</button>}
              <button type="button" className="btn ana small" onClick={() => navigate("/ana/link?kind=cam")}>{camera.status === "not_set" ? "Set Up a Spare Phone" : "Find the Mailbox Again"}</button>
            </div>
            <ClipConsent household={h} camera={camera} onSaved={load} />
            <Admin>
              <span className="label plain">{cameraLine(camera, clock)}</span>
              <span className="label plain">SAM calls today: {camera.samCallsToday ?? 0} of 800 · {camera.clips?.attention ?? 0} clips to check · {camera.clips?.classified ?? 0} classified{camera.floor != null ? ` · floor ${Number(camera.floor).toFixed(2)}` : ""}{camera.gate != null ? ` · gate ${camera.gate}` : ""}</span>
              <ClipConsentDetails />
              <span className="label plain">{h.keepClips ? "Watches the box region only · frames checked · a 6-second clip of the box kept for you to check, 7 days unchecked, 30 days after a tap · nothing streamed" : "Watches the box region only · frames checked, then discarded · nothing stored, nothing streamed"} · with no spare phone, {h.called}'s own phone chimes at the usual hour.</span>
            </Admin>
          </section>
          <section className="card">
            <span className="label">Mail Time</span>
            <p className="lead small">{mailTimeLine(h.mailMinutes)}</p>
            <MailTime initial={h.mailMinutes ?? null} onSaved={load} />
            <Admin>
              <span className="label plain">The hour the mail usually comes, your guess. On days the mailbox phone does not see the box, or with no spare phone at all, {h.called}'s own phone chimes about this hour and says it is the usual time, not a sighting. Not set means no chime.{h.tz ? ` Her phone's zone: ${h.tz}.` : ""}</span>
            </Admin>
          </section>
          <section className="card">
            <span className="label">Help</span>
            <span className={`pill ${help.acked ? "ok" : "warn"}`}>{helpLine(help)}</span>
            {help.openHelpAt && <p className="lead small bad">{h.called} pressed Help at {clock(help.openHelpAt)}. Her phone called 911.</p>}
            <div className="row wrap">
              <button type="button" className="btn ana small" onClick={act("/help/test/self", "Test sent. If this device buzzes, Help will reach you.")}>Send a Test to This Page</button>
              {pushSupported() && <button type="button" className="btn ana small" onClick={() => subscribePush({ ana: true }).then(() => setNote("This device will buzz when Rosa presses Help.")).catch(() => setNote("Notifications were not allowed."))}>Get Notified on This Device</button>}
              <button type="button" className="btn ana small" onClick={() => navigate("/ana/link")}>{rosaPhone ? "Link Another Phone" : `Link ${h.called}'s Phone`}</button>
            </div>
            <Admin>
              <span className="label plain">{h.called}'s phone calls 911 and this page is told at once. {help.lastTestAt ? `Last test ${when(help.lastTestAt)}, ${help.acked ? "reached this page" : "not acknowledged by this page"}.` : "No test sent yet; send one so you know it reaches you."}{help.openHelpAt ? ` Help open since ${when(help.openHelpAt)}.` : ""} Help opens the phone's own 911 call; Biscuit never dials by itself and tells family by notification only.</span>
            </Admin>
          </section>
          <section className="card">
            <span className="label">Recent</span>
            {recentLine(events.length) && <p className="lead small muted">{recentLine(events.length)}</p>}
            {events.slice(0, 8).map((e) => <p key={e.id} className="said"><span className="label plain">{when(e.at)}</span> {recentWords(e)}</p>)}
            <Admin>
              {events.filter((e) => e.kind === "cam_motion").slice(0, 8).map((e) => <span key={e.id} className="label plain">{when(e.at)} · movement · level {e.data?.level ?? "unknown"} · seen: {e.data?.seen ?? "nothing"}</span>)}
              <span className="label plain">Events kept: when, what kind, what SAM saw and the motion level for a movement; never an image here.</span>
            </Admin>
          </section>
        </div>
      </div>
      <section className="card">
        <span className="label">Delete</span>
        <button type="button" className="btn ana small" onClick={() => { if (window.confirm("Delete this household? This cannot be undone.")) api("/household/ana", { method: "DELETE" }).then(() => navigate("/ana/new")); }}>Delete This Household</button>
        <Admin>
          <span className="label plain">Removes everything Biscuit kept for this page and unlinks both phones. {h.called}'s own list stays on her phone until she deletes it there. Only a daily count of deletions remains.</span>
        </Admin>
      </section>
      <Admin>
        <p className="foot">Nothing on this page goes to a hospital. You approve every application in Waive. Sharing is {h.called}'s choice, made with her yes: she chose whether letters appear here when she said yes to Biscuit. Say "stop" to Biscuit and he stops.</p>
      </Admin>
    </main>
  );
}
