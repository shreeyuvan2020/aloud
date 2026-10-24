// Teacher results links are the only way back to scores, and they live in no
// account. Remembering them in this browser means a teacher who closes the tab
// can still find their results from the home page.

export type SavedResult = { token: string; title: string; savedAt: number };

const KEY = "aloud:results";
const MAX = 30;

/** Raw stored string, for useSyncExternalStore (a stable primitive snapshot). */
export function savedResultsSnapshot(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function subscribeSavedResults(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function parseSavedResults(raw: string): SavedResult[] {
  try {
    const list = JSON.parse(raw) as SavedResult[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function readSavedResults(): SavedResult[] {
  return parseSavedResults(savedResultsSnapshot());
}

export function rememberResults(entries: { token: string; title: string }[]) {
  try {
    const now = Date.now();
    const incoming = entries.map((e) => ({ ...e, savedAt: now }));
    const tokens = new Set(incoming.map((e) => e.token));
    const rest = readSavedResults().filter((e) => !tokens.has(e.token));
    window.localStorage.setItem(KEY, JSON.stringify([...incoming, ...rest].slice(0, MAX)));
  } catch {
    // Storage can be blocked (private windows); the results link still works.
  }
}
