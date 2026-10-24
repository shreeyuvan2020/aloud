"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  parseSavedResults,
  rememberResults,
  savedResultsSnapshot,
  subscribeSavedResults,
} from "@/lib/savedResults";

/** Mounted on the results dashboard: opening the link saves it to this browser. */
export function RememberResults({ token, titles }: { token: string; titles: string[] }) {
  const title = titles.length === 1 ? titles[0] : `${titles[0]} + ${titles.length - 1} more`;
  useEffect(() => {
    rememberResults([{ token, title }]);
  }, [token, title]);
  return null;
}

/** Home-page list of results links created or opened in this browser. */
export function SavedResultsList() {
  // null on the server and during hydration: localStorage only exists in the browser.
  const raw = useSyncExternalStore(subscribeSavedResults, savedResultsSnapshot, () => null);
  const items = useMemo(() => (raw === null ? null : parseSavedResults(raw)), [raw]);

  return (
    <section id="your-results" style={{ marginTop: 44 }}>
      <h2>Your results</h2>
      <div className="card">
        {items === null ? (
          <p className="muted" style={{ margin: 0 }}>
            &nbsp;
          </p>
        ) : items.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Checks you set up in this browser will be listed here, so you can get back to scores
            without hunting for a link. Using a different computer? Open your saved results link
            from there instead.
          </p>
        ) : (
          items.map((r, i) => (
            <div
              key={r.token}
              className="row spread"
              style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
            >
              <strong style={{ fontWeight: 600 }}>{r.title}</strong>
              <Link href={`/t/${r.token}`}>
                <button className="ghost sm">See scores</button>
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
