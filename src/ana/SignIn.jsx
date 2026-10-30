import React from "react";
import Dog from "../components/Dog.jsx";
import { navigate } from "../lib/navigate.js";

export const ISSUER = "https://id.kindred-ai.dev";

export default function SignIn() {
  const local = /^(localhost|127\.0\.0\.1)/.test(window.location.host);
  const returnTo = `${window.location.origin}/ana/new`;
  return (
    <main className="screen ana">
      <span className="label">Biscuit · For the Family</span>
      <div className="row"><Dog size={64} /><h1 className="display small">Set Biscuit Up for Someone You Love</h1></div>
      <p className="lead small">About Twenty Minutes Together</p>
      <div className="spacer" />
      <a className="btn ana primary" href={`${ISSUER}/login?return_to=${encodeURIComponent(returnTo)}`}>Continue with Kindred ID</a>
      {local && <button type="button" className="btn ana" onClick={() => navigate("/ana/new")}>Continue (Local)</button>}
    </main>
  );
}
