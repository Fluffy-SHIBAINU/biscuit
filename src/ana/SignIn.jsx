import React from "react";
import Dog from "../components/Dog.jsx";
import { navigate } from "../lib/navigate.js";

export const ISSUER = "https://id.kindred-ai.dev";

export default function SignIn() {
  const local = /^(localhost|127\.0\.0\.1)/.test(window.location.host);
  const returnTo = `${window.location.origin}/ana/new`;
  return (
    <main className="screen ana">
      <span className="label">Biscuit · for the family</span>
      <div className="row"><Dog size={64} /><h1 className="display small">Set Biscuit up for someone you love.</h1></div>
      <p className="lead small">Rosa gets a phone that reads her mail aloud, and you get a page that shows what it read. Takes about twenty minutes together.</p>
      <div className="spacer" />
      <a className="btn ana primary" href={`${ISSUER}/login?return_to=${encodeURIComponent(returnTo)}`}>Continue with Kindred ID</a>
      {local && <button type="button" className="btn ana" onClick={() => navigate("/ana/new")}>Continue (local)</button>}
      <p className="foot">One Google sign-in for every Kindred product. Rosa needs no account. Her papers stay on her phone.</p>
    </main>
  );
}
