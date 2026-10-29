import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { MAIL_TIMES, browserTz, mailTimeLabel } from "../lib/mailtime.js";

/** "The mail usually comes about": Ana's pick, saved as she changes it. On days the box is not seen, Rosa's own phone chimes then. */
export default function MailTime({ initial, onSaved }) {
  const [value, setValue] = useState(initial ?? null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (initial === undefined) api("/family").then((f) => setValue(f.household?.mailMinutes ?? null)).catch(() => {});
    else setValue(initial ?? null);
  }, [initial]);
  async function change(e) {
    const minutes = e.target.value === "" ? null : Number(e.target.value);
    setValue(minutes);
    try {
      await api("/family/mail-time", { method: "PATCH", json: { minutes, tz: browserTz() } });
      setNote(minutes == null ? "No chime." : `Rosa's phone chimes about ${mailTimeLabel(minutes)} on days the box isn't seen.`);
      if (onSaved) onSaved(minutes);
    } catch { setNote("Couldn't save that. Try again."); }
  }
  return (
    <label className="field">
      <span>The mail usually comes about</span>
      <select value={value ?? ""} onChange={change} aria-label="When the mail usually comes">
        <option value="">Not set · no chime</option>
        {MAIL_TIMES.map((m) => <option key={m} value={m}>{mailTimeLabel(m)}</option>)}
      </select>
      {note && <span className="label plain">{note}</span>}
    </label>
  );
}
