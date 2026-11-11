// What a version brought, said once after FM Lens has updated itself to it: the update installs without asking, so this
// notice under the masthead is where the user learns what changed.

import { useEffect, useState } from "react";
import { updateText } from "./labels";
import { openRelease } from "./update";

const text = updateText;

/** The version this computer last ran. */
const VERSION_KEY = "fm-lens.version";
/** Set once the introduction is over (see GuidedTour.tsx): versions up to 0.5.1 kept no version, so it tells an
 * update from a first start. */
const TOUR_KEY = "fmlens.tour";

/** Whether an earlier version ran on this computer. Only true before `useWhatsNew` records this one, in an effect. */
export function ranBefore(): boolean {
  try {
    return window.localStorage.getItem(VERSION_KEY) !== null || window.localStorage.getItem(TOUR_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * The version whose changes to show, once: the one running, when another version ran on this computer before and this
 * one lists what it brought. A first start shows nothing, and neither does a window without storage, where the notice
 * would come back at every start.
 */
export function useWhatsNew(version: string | null): { whatsNew: string | null; dismiss: () => void } {
  const [whatsNew, setWhatsNew] = useState<string | null>(null);
  useEffect(() => {
    if (!version) {
      return;
    }
    try {
      const before = window.localStorage.getItem(VERSION_KEY);
      if (before === version) {
        return;
      }
      window.localStorage.setItem(VERSION_KEY, version);
      const updated = before !== null || window.localStorage.getItem(TOUR_KEY) !== null;
      if (updated && (text.changes[version]?.length ?? 0) > 0) {
        setWhatsNew(version);
      }
    } catch {
      // Without storage nothing is shown.
    }
  }, [version]);
  return { whatsNew, dismiss: () => setWhatsNew(null) };
}

/** The notice: what `version` brought, its release notes, and the button that dismisses it. */
export function WhatsNewNotice({ version, onDismiss }: { version: string; onDismiss: () => void }) {
  return (
    <div className="frozen-notice">
      <div className="compatibility-text">
        <strong>{text.whatsNew(version)}</strong>
        <ul className="whats-new">
          {(text.changes[version] ?? []).map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>
      <span className="update-actions">
        <button type="button" onClick={() => openRelease(version)}>
          {text.releaseNotes}
        </button>
        <button type="button" className="icon-button" aria-label={text.dismiss} title={text.dismiss} onClick={onDismiss}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </span>
    </div>
  );
}
