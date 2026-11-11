// A star on GitHub, asked for once: after this computer's 20th edit, a notice under the masthead says FM Lens is free
// and open source and asks for a star. Starring or Not now ends the ask for good. Settings, About keeps the link.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { watchCommands } from "./api";
import { starText } from "./labels";
import { EDITS, track } from "./usage";

const text = starText;

/** FM Lens's repository, where it is starred (allowed in capabilities/default.json). */
const REPOSITORY = "https://github.com/IamDejman/fm-lens";

/** How many edits this computer has made, counted up to the ask. */
const EDITS_KEY = "fmlens.edits";
/** Set once the ask is answered, starred or not: it never comes back. */
const ANSWERED_KEY = "fmlens.star";
/** By then FM Lens has done something for the user. */
const ASK_AFTER = 20;

/** Opens the repository on GitHub. `from` says which button did. */
export function openRepository(from: "notice" | "settings"): void {
  track("star_clicked", { from });
  openUrl(REPOSITORY).catch(() => {
    // Nothing to fall back on: the button stays where it is.
  });
}

/** Whether the ask was answered. Without storage it counts as answered, as the ask would come back at every start. */
function answered(): boolean {
  try {
    return localStorage.getItem(ANSWERED_KEY) !== null;
  } catch {
    return true;
  }
}

function editCount(): number {
  try {
    return Number(localStorage.getItem(EDITS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Whether to ask now, and what answers it: `starred` opens GitHub, and either way the ask is over. */
export function useStarAsk(): { asking: boolean; answer: (starred: boolean) => void } {
  const [asking, setAsking] = useState(() => !answered() && editCount() >= ASK_AFTER);

  useEffect(
    () =>
      watchCommands((command) => {
        if (!EDITS.has(command) || answered()) {
          return;
        }
        const count = editCount() + 1;
        try {
          localStorage.setItem(EDITS_KEY, String(count));
        } catch {
          return;
        }
        if (count >= ASK_AFTER) {
          setAsking(true);
        }
      }),
    [],
  );

  useEffect(() => {
    if (asking) {
      track("star_asked");
    }
  }, [asking]);

  const answer = (starred: boolean) => {
    try {
      localStorage.setItem(ANSWERED_KEY, starred ? "starred" : "notNow");
    } catch {
      // The ask still goes away for this window.
    }
    setAsking(false);
    if (starred) {
      openRepository("notice");
    } else {
      track("star_declined");
    }
  };

  return { asking, answer };
}

/** The ask, under the masthead: Star on GitHub opens the repository, and Not now hides it for good. */
export function StarNotice({ onAnswer }: { onAnswer: (starred: boolean) => void }) {
  return (
    <div className="update-notice">
      <strong>{text.ask}</strong>
      <span className="update-actions">
        <button type="button" className="primary" onClick={() => onAnswer(true)}>
          {text.button}
        </button>
        <button type="button" onClick={() => onAnswer(false)}>
          {text.notNow}
        </button>
      </span>
    </div>
  );
}
