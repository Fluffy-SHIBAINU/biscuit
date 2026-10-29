import React from "react";
import { navigate } from "../lib/navigate.js";

export default function Rest() {
  return (
    <main className="screen night">
      <span className="label night">Biscuit · Mailbox Phone</span>
      <h1 className="display small">Not Watching Yet</h1>
      <p className="lead small">Rosa Can Still Tap Mail Came</p>
      <div className="spacer" />
      <button type="button" className="btn secondary night" onClick={() => navigate("/cam/setup")}>Set the Camera Up Now</button>
    </main>
  );
}
