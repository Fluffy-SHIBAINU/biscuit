import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate, useSearch } from "../lib/navigate.js";
import MailTime from "./MailTime.jsx";
import Qr from "./Qr.jsx";
import { linkUrl } from "../lib/qrlink.js";

export default function LinkCode() {
  const search = useSearch();
  const kind = new URLSearchParams(search).get("kind") === "cam" ? "cam" : "rosa";
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

  const phone = kind === "cam" ? "the Spare Phone" : "Rosa's Phone";
  return (
    <main className="screen ana">
      <span className="label">Set Up · {kind === "cam" ? "3 of 3 · Mailbox Phone" : "2 of 3 · Rosa's Phone"}</span>
      <h1 className="display small">{kind === "cam" ? "Make a Spare Phone the Mailbox Camera" : "Link Rosa's Phone"}</h1>
      <section className="card">
        <span className="label">On {phone}</span>
        <Qr text={code ? linkUrl(code, kind, window.location.origin) : ""} alt={`Link code for ${phone}`} />
        <p className="lead small center">Scan With {phone} · Or Type the Code</p>
        {kind === "rosa" ? (
          <ol className="steps"><li>Open <strong>biscuit.kindred-ai.dev</strong> in Safari or Chrome.</li><li>Share, then <strong>Add to Home Screen</strong>, then open Biscuit from there.</li><li>Type this code.</li></ol>
        ) : (
          <><ol className="steps"><li>Open <strong>biscuit.kindred-ai.dev/cam</strong> on any old phone with a camera.</li><li>Type this code, then allow the camera.</li><li>Keep it plugged in by a window that sees the mailbox.</li></ol><MailTime /></>
        )}
      </section>
      <div className="codebox">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : "…"}</div>
      <p className="lead small">{linked ? `${phone[0].toUpperCase() + phone.slice(1)} Linked` : left === "expired" ? "Code Expired · Make a New One" : `Good for ${left || "10:00"} · Waiting for ${phone}`}</p>
      <div className="spacer" />
      {linked ? (
        kind === "rosa" ? <button type="button" className="btn ana primary" onClick={() => navigate("/ana/link?kind=cam")}>Next: The Mailbox Phone</button> : <button type="button" className="btn ana primary" onClick={() => navigate("/ana")}>Open Your Page</button>
      ) : (
        <button type="button" className="btn ana" onClick={fresh}>New Code</button>
      )}
      <button type="button" className="btn ana" onClick={() => navigate(kind === "rosa" ? "/ana/link?kind=cam" : "/ana")}>{kind === "rosa" ? "Skip to the Mailbox Phone" : "Skip This, No Spare Phone"}</button>
    </main>
  );
}
