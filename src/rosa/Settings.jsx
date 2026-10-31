import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speak, voicesReady } from "../lib/speech.js";
import { pickVoice } from "../lib/voice.js";
import { store, useStore } from "../lib/store.js";

export default function Settings() {
  const s = useStore();
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState([]);
  // What Biscuit remembers about Rosa, and the reminders she set, each with a way to take it back.
  const [memories, setMemories] = useState([]);
  const [reminders, setReminders] = useState([]);
  const loadMind = () => { api("/memories").then((r) => setMemories(r.memories || [])).catch(() => {}); api("/reminders").then((r) => setReminders(r.reminders || [])).catch(() => {}); };
  useEffect(() => { if (s.deviceToken) loadMind(); }, [s.deviceToken]);
  const forget = (id) => api(`/memories/${id}`, { method: "DELETE" }).then(loadMind).catch(() => {});
  const dropReminder = (id) => api(`/reminders/${id}`, { method: "DELETE" }).then(loadMind).catch(() => {});
  useEffect(() => { voicesReady().then((v) => setVoices(v.filter((x) => (x.lang || "").toLowerCase().startsWith("en")))); }, []);
  const chosen = pickVoice(voices, { name: s.voiceName || null });
  const choose = (name) => { store.set({ voiceName: name || null }); speak(["This is how I sound. Is this all right?"]); };
  async function wipe() {
    setBusy(true);
    try { await api("/household", { method: "DELETE" }); } catch { /* the phone is wiped either way */ }
    store.clear();
    await speak(["Everything is deleted."]);
    navigate("/");
  }
  return (
    <main className="screen">
      <div className="row between"><span className="label">Settings</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Home</a></div>
      <h1 className="display small">Biscuit on This Phone</h1>
      <section className="card facts">
        <div className="fact"><strong>Voice</strong><span className="label plain">{s.buttonsMode ? "Buttons Mode" : "On"}</span>{s.buttonsMode && <button type="button" className="btn secondary" onClick={() => store.set({ buttonsMode: false })}>Try Voice Again</button>}</div>
        <div className="fact"><strong>Biscuit's Voice</strong><span className="label plain">{s.neuralVoice ? "Biscuit's Own Voice" : chosen ? chosen.name : "The Phone's Voice"}</span>{!s.neuralVoice && voices.length > 1 && <select className="field-select" value={s.voiceName || ""} onChange={(e) => choose(e.target.value)} aria-label="Which voice Biscuit uses"><option value="">Best on this phone</option>{voices.map((v) => <option key={v.voiceURI || v.name} value={v.name}>{v.name}</option>)}</select>}</div>
        <div className="fact"><strong>Mail Chime</strong><span className="label plain">{s.pushSubscribed ? "On" : "Off · Turn It On from Home"}</span></div>
        <div className="fact"><strong>Sharing with Ana</strong><span className="label plain">{s.household?.shareLetters === false ? "Off" : "On"}</span></div>
      </section>
      <section className="card facts">
        <span className="label">What Biscuit Remembers</span>
        {memories.length === 0 && <p className="lead small muted">Nothing yet. Tell him about yourself when you talk.</p>}
        {memories.map((m) => <div key={m.id} className="fact"><strong>{m.fact}</strong><span className="label plain">{m.topic}</span><button type="button" className="btn secondary small" onClick={() => forget(m.id)}>Forget This</button></div>)}
      </section>
      <section className="card facts">
        <span className="label">Reminders</span>
        {reminders.length === 0 && <p className="lead small muted">None. Say "remind me about my pills at eight" when you talk.</p>}
        {reminders.map((r) => <div key={r.id} className="fact"><strong>{r.label} at {r.time}</strong><button type="button" className="btn secondary small" onClick={() => dropReminder(r.id)}>Remove</button></div>)}
      </section>
      <div className="spacer" />
      {!arm ? <button type="button" className="btn danger" onClick={() => { setArm(true); speak(["Delete everything? This cannot be undone. Tap Yes, delete, or say nothing."]); }}>Delete Everything</button>
        : <><button type="button" className="btn danger" disabled={busy} onClick={wipe}>Yes, Delete</button><button type="button" className="btn secondary" onClick={() => setArm(false)}>Keep It</button></>}
      <p className="foot">Delete removes everything Biscuit kept, here and on Ana's page.</p>
    </main>
  );
}
