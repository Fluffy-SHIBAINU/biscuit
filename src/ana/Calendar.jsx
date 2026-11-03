import React, { useState } from "react";
import { actionDays, monthGrid, monthLabel, todayKey } from "../lib/calendar.js";

const money = (c) => (Number.isInteger(c) ? `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null);
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** A month of days with a dot on each date that needs something done; a tap on a date lists what is due. */
export default function Calendar({ letters, called }) {
  const now = new Date();
  const [ym, setYm] = useState([now.getFullYear(), now.getMonth()]);
  const [picked, setPicked] = useState(null);
  const days = actionDays(letters);
  const today = todayKey(now);
  const [year, month] = ym;
  const move = (n) => { const d = new Date(year, month + n, 1); setYm([d.getFullYear(), d.getMonth()]); };
  const shown = picked || today;
  const due = days[shown] || [];
  return (
    <section className="card calendar">
      <div className="row between">
        <button type="button" className="btn ana small cal-nav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <span className="h2">{monthLabel(year, month)}</span>
        <button type="button" className="btn ana small cal-nav" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="cal-grid" role="grid">
        {DOW.map((d, i) => <span key={i} className="label cal-dow">{d}</span>)}
        {monthGrid(year, month).flat().map((k) => {
          const inMonth = Number(k.slice(5, 7)) === month + 1;
          const n = days[k]?.length || 0;
          return (
            <button key={k} type="button" className={`cal-day ${inMonth ? "" : "dim"} ${k === today ? "today" : ""} ${k === shown ? "picked" : ""}`} onClick={() => setPicked(k)} aria-label={`${k}${n ? `, ${n} due` : ""}`}>
              <span>{Number(k.slice(8, 10))}</span>
              {n > 0 && <span className="cal-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="stack tight">
        <span className="label">{shown === today ? "Today" : new Date(shown + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
        {due.length ? due.map((a) => <p key={a.id} className="lead small">Due: {a.sender}{money(a.amountCents) ? `, ${money(a.amountCents)}` : ""}</p>) : <p className="lead small muted">Nothing due.</p>}
      </div>
    </section>
  );
}
