import React from "react";
import { navigate } from "../lib/navigate.js";

export default function Siri() {
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return (
    <main className="screen">
      <span className="label">Step 5 of 6 · {ios ? "Siri" : "Google"} shortcut · optional</span>
      <h1 className="display small">{ios ? "“Hey Siri, open Biscuit.”" : "“Hey Google, open Biscuit.”"}</h1>
      <section className="card"><span className="label">How</span><p className="lead small">{ios ? "Biscuit is on the Home Screen, so Siri already opens it by name. Say “Hey Siri, open Biscuit.” If Siri asks which app, choose Biscuit." : "Say “Hey Google, open Biscuit.” If it asks, pick the Biscuit shortcut on the home screen."}</p></section>
      <p className="lead small">The Talk button always works. The mail chime needs no voice assistant.</p>
      <div className="spacer" />
      <button type="button" className="btn big" onClick={() => navigate("/setup/done")}>Next</button>
      <button type="button" className="btn secondary" onClick={() => navigate("/setup/done")}>Skip</button>
    </main>
  );
}
