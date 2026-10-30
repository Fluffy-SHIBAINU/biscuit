/** The words for who set the watched box, on Ana's page: SAM 3.1's find, or the person's own drawing. A box set before this was recorded has neither. */
export const BOX_SOURCE_WORDS = { hand: "box set by hand", sam: "box found by SAM" };

/** The line beside the Mailbox phone pill on Ana's page: power, the last movement, today's movements, and who set the box. `clock` turns a time into the hour to show. */
export function cameraLine(camera, clock) {
  if (camera.status === "not_set") return "No spare phone yet.";
  return [
    camera.battery != null ? `${camera.charging ? "plugged in" : "on battery"}, ${camera.battery}%` : null,
    camera.lastMotionAt ? `last movement ${clock(camera.lastMotionAt)}` : "no movement seen yet",
    camera.movementsToday ? `${camera.movementsToday} ${camera.movementsToday === 1 ? "movement" : "movements"} today` : null,
    camera.frozenAt ? `camera asleep since ${clock(camera.frozenAt)}` : null,
    BOX_SOURCE_WORDS[camera.regionSource] || null,
  ].filter(Boolean).join(" · ");
}

/** The one Title Case line a daughter reads beside the pill: what the phone is doing now; the numbers stay in cameraLine, under Details. */
export function cameraSummary(camera, household, clock) {
  if (camera.status === "not_set") return "No Spare Phone Yet";
  if (camera.status === "paused") return "Paused";
  if (camera.status === "offline") return "Offline";
  if (camera.status === "asleep") return "Camera Asleep · Tap the Mailbox Phone";
  return ["Watching the Box", camera.lastMotionAt ? `Last Movement ${clock(camera.lastMotionAt)}` : "Nothing Has Moved Yet", household?.keepClips ? "Keeping Short Clips" : null].filter(Boolean).join(" · ");
}
