// The one Title Case line under each card title on Ana's page: what is true now, nothing more. Null where the card's
// own content is the line (letters, said lines, events).

export const readersLine = (readers) => (!readers ? "No Letter Read Yet" : `Last Letter Read ${readers.readBy === "twice" ? "Twice" : readers.readBy === "once" ? "Once" : "by One Reader"}`);
export const saidLine = (n) => (n ? null : "Nothing Today");
export const lettersLine = (n) => (n ? null : "None Yet");
export const recentLine = (n) => (n ? null : "Nothing Yet");
export const helpLine = (help) => (help?.acked ? "Tested" : "Untested");
