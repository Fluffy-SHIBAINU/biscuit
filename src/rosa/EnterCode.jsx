import React, { useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { store } from "../lib/store.js";

export default function EnterCode() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  async function submit() {
    try {
      const r = await api("/link/claim", { method: "POST", json: { code }, token: null });
      store.set({ deviceToken: r.deviceToken, kind: r.kind, household: r.household });
      navigate(r.kind === "cam" ? "/cam" : "/setup/voice");
    } catch (err) {
      const left = Math.max(0, 2 - tries);
      setTries(tries + 1);
      setError(err?.status === 410 ? "That code has expired. Ask Ana for a new one." : `Didn't match. Check the numbers on Ana's phone. ${left} ${left === 1 ? "try" : "tries"} left.`);
      setCode("");
    }
  }

  return (
    <main className="screen">
      <span className="label">Set up · link this phone</span>
      <h1 className="display">Type the code from Ana's phone.</h1>
      <input className="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Six digit code" />
      {error && <p className="lead bad">{error}</p>}
      {tries >= 3 && <p className="lead">Three misses. Ana taps New code on her phone, then try again.</p>}
      <button type="button" className="btn big" disabled={code.length !== 6} onClick={submit}>Link</button>
      <div className="spacer" />
      <p className="foot">Rosa needs no account. This phone keeps a small key; Ana can unlink it from her page.</p>
    </main>
  );
}
