import React from "react";

/** The technical or explanatory side of a card: a plain disclosure, closed for a daughter, open where `open` says so. Nothing behind a route. */
export default function Details({ open = false, night = false, children }) {
  return (
    <details className={`details${night ? " night" : ""}`} open={open}>
      <summary className={night ? "label night" : "label plain"}>Details</summary>
      <div className="stack tight">{children}</div>
    </details>
  );
}
