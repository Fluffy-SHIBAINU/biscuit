import React from "react";
import { navigate } from "../lib/navigate.js";

export default function Rest() {
  return (
    <main className="screen night">
      <span className="label night">Biscuit · mailbox phone</span>
      <h1 className="display small">Not watching yet.</h1>
      <p className="lead small">Rosa can still tap Mail came on her phone, and Biscuit still reads letters.</p>
      <div className="spacer" />
      <button type="button" className="btn secondary night" onClick={() => navigate("/cam/setup")}>Set the camera up now</button>
    </main>
  );
}
