import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate, usePath } from "../lib/navigate.js";

export default function LinkCode() {
  usePath();
  const kind = new URLSearchParams(window.location.search).get("kind") === "cam" ? "cam" : "rosa";
  const [code, setCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [linked, setLinked] = useState(false);
  const [left, setLeft] = useState("");

  async function fresh() {
    setLinked(false);
    const r = await api("/link/new", { method: "POST", json: { kind } });
    setCode(r.code); setExpiresAt(new Date(r.expiresAt));
  }
  useEffect(() => { fresh().catch(() => navigate("/ana")); }, [kind]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (expiresAt) { const ms = expiresAt - Date.now(); setLeft(ms > 0 ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "expired"); }
      try { const fam = await api("/family"); if (fam.devices.some((d) => d.kind === kind)) setLinked(true); } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(t);
  }, [expiresAt, kind]);

  const phone = kind === "cam" ? "the spare phone" : "Rosa's phone";
  return (
    <main className="screen ana">
      <span className="label">Set up · {kind === "cam" ? "3 of 3 · mailbox phone" : "2 of 3 · Rosa's phone"}</span>
      <h1 className="display small">{kind === "cam" ? "Make a spare phone the mailbox camera." : "Link Rosa's phone."}</h1>
      <section className="card">
        <span className="label">On {phone}</span>
        {kind === "rosa" ? (
          <ol className="steps"><li>Open <strong>biscuit.kindred-ai.dev</strong> in Safari or Chrome.</li><li>Share, then <strong>Add to Home Screen</strong>, then open Biscuit from there (that's what lets it chime).</li><li>Type this code.</li></ol>
        ) : (
          <ol className="steps"><li>Open <strong>biscuit.kindred-ai.dev/cam</strong> on any old phone with a camera.</li><li>Type this code, then allow the camera.</li><li>Keep it plugged in by a window that sees the mailbox.</li></ol>
        )}
      </section>
      <div className="codebox">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : "…"}</div>
      <p className="label plain">{linked ? `${phone[0].toUpperCase() + phone.slice(1)} linked.` : left === "expired" ? "Code expired. Make a new one." : `Good for ${left || "10:00"} · waiting for ${phone}…`}</p>
      <div className="spacer" />
      {linked ? (
        kind === "rosa" ? <button type="button" className="btn ana primary" onClick={() => navigate("/ana/link?kind=cam")}>Next: the mailbox phone</button> : <button type="button" className="btn ana primary" onClick={() => navigate("/ana")}>Open your page</button>
      ) : (
        <button type="button" className="btn ana" onClick={fresh}>New code</button>
      )}
      <button type="button" className="btn ana" onClick={() => navigate(kind === "rosa" ? "/ana/link?kind=cam" : "/ana")}>{kind === "rosa" ? "Skip to the mailbox phone" : "Skip for now"}</button>
      <p className="foot">The code works once and dies in ten minutes. Three wrong tries on the phone: make a new one here.</p>
    </main>
  );
}
