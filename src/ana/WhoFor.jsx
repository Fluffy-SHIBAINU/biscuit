import React, { useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";

export default function WhoFor() {
  const [f, setF] = useState({ seniorName: "", called: "", relation: "daughter", living: "alone", language: "en" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function next() {
    try {
      await api("/household", { method: "POST", json: { ...f, called: f.called || f.seniorName.split(" ")[0] } });
      navigate("/ana/link");
    } catch (err) {
      setError(err?.status === 401 ? "Please sign in first." : "Couldn't save that. Try again.");
    }
  }
  return (
    <main className="screen ana">
      <span className="label">Set Up · 1 of 3</span>
      <h1 className="display small">Who Does Biscuit Help?</h1>
      <label className="field"><span>Their Name</span><input value={f.seniorName} onChange={set("seniorName")} placeholder="Rosa Alvarez" /></label>
      <label className="field"><span>What Biscuit Calls Them</span><input value={f.called} onChange={set("called")} placeholder="Rosa" /></label>
      <label className="field"><span>You Are Their</span><select value={f.relation} onChange={set("relation")}><option value="daughter">Daughter</option><option value="son">Son</option><option value="spouse">Spouse</option><option value="grandchild">Grandchild</option><option value="friend">Friend</option><option value="caregiver">Caregiver</option></select></label>
      <label className="field"><span>They Live</span><select value={f.living} onChange={set("living")}><option value="alone">Alone</option><option value="with_family">With Family</option><option value="with_care">With Care</option></select></label>
      <label className="field"><span>Language</span><select value={f.language} onChange={set("language")}><option value="en">English</option></select></label>
      {error && <p className="lead small bad">{error}</p>}
      <div className="spacer" />
      <button type="button" className="btn ana primary" disabled={!f.seniorName.trim()} onClick={next}>Next</button>
    </main>
  );
}
