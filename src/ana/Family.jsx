import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import SignIn from "./SignIn.jsx";
import { pushSupported, subscribePush } from "../lib/push.js";

export default function Family() {
  const [fam, setFam] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    const load = () => api("/family").then((f) => { if (alive) { setFam(f); setState("ok"); } }).catch((e) => { if (!alive) return; setState(e?.status === 401 ? "signin" : e?.status === 404 ? "new" : "error"); });
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (state === "signin") return <SignIn />;
  if (state === "new") { navigate("/ana/new"); return null; }
  if (state !== "ok") return <main className="screen ana"><span className="label">Biscuit · family page</span><p className="lead small">{state === "error" ? "Couldn't load the page. Try again in a moment." : "One moment."}</p></main>;
  return (
    <main className="screen ana">
      <span className="label">Biscuit · family page</span>
      <h1 className="display small">{fam.household.called}</h1>
      <section className="card"><span className="label">Phones</span>{fam.devices.length ? fam.devices.map((d) => <p key={d.id} className="lead small">{d.label}{d.hasPush ? " · can chime" : ""}</p>) : <p className="lead small">No phone linked yet.</p>}<button type="button" className="btn ana" onClick={() => navigate("/ana/link")}>Link a phone</button></section>
      <section className="card"><span className="label">Letters Biscuit read</span>{fam.letters.length ? fam.letters.map((l) => <p key={l.id} className="lead small">{l.sender || "A letter"} · {l.status}</p>) : <p className="lead small">None yet.</p>}</section>
      {pushSupported() && <button type="button" className="btn ana" onClick={() => subscribePush({ ana: true }).catch(() => {})}>Get notified on this device</button>}
      <p className="foot">The full page arrives with the next build step.</p>
    </main>
  );
}
