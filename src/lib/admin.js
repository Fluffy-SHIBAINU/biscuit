// The admin view on Ana's page: the numbers, floors, prompt names and full words that a daughter never sees. Rendered
// only for the founder's household (household.admin, from CAM_COLLECT_OWNER) and only when the page is opened as
// /ana?admin=1; for everyone else, and for the founder without the flag, nothing is rendered at all.
export function isAdminView(search, admin) {
  if (admin !== true) return false;
  try { return new URLSearchParams(search || "").get("admin") === "1"; } catch { return false; }
}
