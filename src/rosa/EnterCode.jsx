import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { browserTz } from "../lib/mailtime.js";
import { codeFromSearch, installFirst } from "../lib/qrlink.js";
import { store } from "../lib/store.js";

const isStandalone = () => Boolean(window.navigator.standalone) || Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches);

export default function EnterCode() {
  // A code scanned from Ana's page arrives in the URL and links by itself; on an iPhone's browser Rosa first adds Biscuit to
  // the Home Screen, since the installed app keeps its own storage, so the page shows the code to type there instead.
  const scanned = codeFromSearch(window.location.search);
  const waitForInstall = Boolean(scanned) && installFirst({ ua: navigator.userAgent, standalone: isStandalone(), kind: scanned.kind });
  const [code, setCode] = useState(scanned?.code ?? "");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

  async function submit(c = code) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api("/link/claim", { method: "POST", json: { code: c, tz: browserTz() }, token: null });
      store.set({ deviceToken: r.deviceToken, kind: r.kind, household: r.household });
      navigate(r.kind === "cam" ? "/cam" : "/setup/voice");
    } catch (err) {
      const left = Math.max(0, 2 - tries);
      setTries(tries + 1);
      setError(err?.status === 410 ? "That code has expired. Ask Ana for a new one." : `Didn't match. Check the numbers on Ana's phone. ${left} ${left === 1 ? "try" : "tries"} left.`);
      setCode("");
    } finally { setBusy(false); }
  }
  useEffect(() => { if (scanned && !waitForInstall && !auto.current) { auto.current = true; submit(scanned.code); } }, []);

  if (waitForInstall) {
    return (
      <main className="screen">
        <span className="label">Set up · link this phone</span>
        <h1 className="display">Add Biscuit to the Home Screen first.</h1>
        <ol className="steps"><li>Tap Share, then <strong>Add to Home Screen</strong>.</li><li>Open Biscuit from the icon.</li><li>Type this code there.</li></ol>
        <div className="codebox">{scanned.code.slice(0, 3)} {scanned.code.slice(3)}</div>
        {error && <p className="lead bad">{error}</p>}
        <div className="spacer" />
        <button type="button" className="btn secondary" disabled={busy} onClick={() => submit(scanned.code)}>Link here anyway</button>
        <p className="foot">The Home Screen app is what lets Biscuit chime. Rosa needs no account.</p>
      </main>
    );
  }

  return (
    <main className="screen">
      <span className="label">Set up · link this phone</span>
      <h1 className="display">{busy && scanned ? "Linking this phone." : "Type the code from Ana's phone."}</h1>
      <input className="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Six digit code" />
      {error && <p className="lead bad">{error}</p>}
      {tries >= 3 && <p className="lead">Three misses. Ana taps New code on her phone, then try again.</p>}
      <button type="button" className="btn big" disabled={code.length !== 6 || busy} onClick={() => submit()}>Link</button>
      <div className="spacer" />
      <p className="foot">Rosa needs no account. This phone keeps a small key; Delete everything in Settings removes it.</p>
    </main>
  );
}
