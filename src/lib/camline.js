/** The words for who set the watched box, on Ana's page: SAM 3.1's find, or the person's own drawing. A box set before this was recorded has neither. */
export const BOX_SOURCE_WORDS = { hand: "box set by hand", sam: "box found by SAM" };

/** The line beside the Mailbox phone pill on Ana's page: power, the last movement, today's movements, and who set the box. `clock` turns a time into the hour to show. */
export function cameraLine(camera, clock) {
  if (camera.status === "not_set") return "No spare phone yet.";
  return [
    camera.battery != null ? `${camera.charging ? "plugged in" : "on battery"}, ${camera.battery}%` : null,
    camera.lastMotionAt ? `last movement ${clock(camera.lastMotionAt)}` : "no movement seen yet",
    camera.movementsToday ? `${camera.movementsToday} ${camera.movementsToday === 1 ? "movement" : "movements"} today` : null,
    BOX_SOURCE_WORDS[camera.regionSource] || null,
  ].filter(Boolean).join(" · ");
}

/** The one line a daughter reads beside the pill: what the phone is doing now, in her words; the numbers stay in cameraLine, under Details. */
export function cameraSummary(camera, household, clock) {
  if (camera.status === "not_set") return "No spare phone yet.";
  if (camera.status === "paused") return "Paused. Nothing leaves the phone until you resume.";
  if (camera.status === "offline") return "Offline. Check that the phone is open on its page and plugged in.";
  return [`Watching the box.`, camera.lastMotionAt ? `Last movement ${clock(camera.lastMotionAt)}.` : "Nothing has moved yet.", household?.keepClips ? "Keeping short clips for you." : null].filter(Boolean).join(" ");
}
