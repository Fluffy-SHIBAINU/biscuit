import React from "react";
import { usePath } from "./lib/navigate.js";
import { useStore } from "./lib/store.js";
import Home from "./rosa/Home.jsx";
import Talk from "./rosa/Talk.jsx";
import EnterCode from "./rosa/EnterCode.jsx";
import Letter from "./rosa/Letter.jsx";
import Reading from "./rosa/Reading.jsx";

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
  const s = useStore();
  if (path === "/cam" || path.startsWith("/cam/")) return <Placeholder surface="Mailbox phone" />;
  if (path === "/ana" || path.startsWith("/ana/")) return <Placeholder surface="Ana's page" />;
  if (path === "/link" || !s.deviceToken) return <EnterCode />;
  if (path === "/talk") return <Talk />;
  if (path === "/letter") return <Letter />;
  if (path === "/reading") return <Reading />;
  if (path === "/") return <Home />;
  return <Placeholder surface={path.slice(1)} />;
}
