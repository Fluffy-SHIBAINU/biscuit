import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { MAIL_TIMES, browserTz, mailTimeLabel } from "../lib/mailtime.js";

/** The usual mail hour: Ana's pick, saved as she changes it. On days the box is not seen, Rosa's own phone chimes then; the card's Details say so. */
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
      setNote("Saved.");
      if (onSaved) onSaved(minutes);
    } catch { setNote("Couldn't save that. Try again."); }
  }
  return (
    <label className="field">
      <span>Usual Time</span>
      <select value={value ?? ""} onChange={change} aria-label="When the mail usually comes">
        <option value="">Not Set · No Chime</option>
        {MAIL_TIMES.map((m) => <option key={m} value={m}>{mailTimeLabel(m)}</option>)}
      </select>
      {note && <span className="label plain">{note}</span>}
    </label>
  );
}
