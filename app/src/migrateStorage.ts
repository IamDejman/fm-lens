// Before 0.5.3 FM Lens kept its settings under keys that started with another name. They move once to the keys used
// now, before anything reads them: main.tsx imports this module first.

const EARLIER_PREFIX = "fmlibre.";
const PREFIX = "fmlens.";

function migrate(storage: Storage): void {
  const earlier: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(EARLIER_PREFIX)) {
      earlier.push(key);
    }
  }
  for (const key of earlier) {
    const value = storage.getItem(key);
    const now = PREFIX + key.slice(EARLIER_PREFIX.length);
    if (value !== null && storage.getItem(now) === null) {
      storage.setItem(now, value);
    }
    storage.removeItem(key);
  }
}

for (const storage of ["localStorage", "sessionStorage"] as const) {
  try {
    migrate(window[storage]);
  } catch {
    // Without storage there is nothing to move.
  }
}

export {};
