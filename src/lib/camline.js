/** The words for who set the watched box, on Ana's page: SAM 3.1's find, or the person's own drawing. A box set before this was recorded has neither. */
export const BOX_SOURCE_WORDS = { hand: "box set by hand", sam: "box found by SAM" };

/** The line beside the Mailbox phone pill on Ana's page: power, the last movement, the test, and who set the box. `clock` turns a time into the hour to show. */
export function cameraLine(camera, clock) {
  if (camera.status === "not_set") return "No spare phone yet.";
  return [
    camera.battery != null ? `${camera.charging ? "plugged in" : "on battery"}, ${camera.battery}%` : null,
    camera.lastMotionAt ? `last movement ${clock(camera.lastMotionAt)}` : "no movement seen yet",
    camera.testStatus === "pending" ? "test pending" : null,
    BOX_SOURCE_WORDS[camera.regionSource] || null,
  ].filter(Boolean).join(" · ");
}
