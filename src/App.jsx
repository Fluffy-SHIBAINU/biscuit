import React from "react";
import { usePath } from "./lib/navigate.js";

function Placeholder({ surface }) {
  return (
    <main className="screen">
      <div className="label">Biscuit · Kindred</div>
      <h1 className="display">{surface}</h1>
      <p className="muted">Coming up.</p>
    </main>
  );
}

export default function App() {
  const path = usePath();
  if (path === "/cam" || path.startsWith("/cam/")) return <Placeholder surface="Mailbox phone" />;
  if (path === "/ana" || path.startsWith("/ana/")) return <Placeholder surface="Ana's page" />;
  return <Placeholder surface="Rosa's phone" />;
}
