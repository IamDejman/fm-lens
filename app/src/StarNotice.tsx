// A star on GitHub, asked for once: after this computer's 20th edit, a notice under the masthead says FM Lens is free
// and open source and asks for a star. Someone who used an earlier version has likely made those edits already, so
// their first edit in this one brings it. Starring or Not now ends the ask for good. Settings, About keeps the link.
// The wishlist, at the foot of the window, is on GitHub too.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { watchCommands } from "./api";
import { starText } from "./labels";
import { EDITS, track } from "./usage";
import { ranBefore } from "./WhatsNew";

const text = starText;

/** FM Lens's repository, where it is starred (allowed in capabilities/default.json). */
const REPOSITORY = "https://github.com/IamDejman/fm-lens";

/** The repository's Ideas: anyone asks for what FM Lens should do next there, and votes for what others asked for. */
const WISHLIST = `${REPOSITORY}/discussions/categories/ideas`;

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

/** Opens the wishlist on GitHub. */
export function openWishlist(): void {
  track("wishlist_opened");
  openUrl(WISHLIST).catch(() => {
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

/**
 * Starts the count the first time this version runs: at 0 on a new install, and one edit short of the ask where an
 * earlier version ran, whose edits were never counted. It runs while the app first renders, before `useWhatsNew`
 * records this version.
 */
function startCount(): void {
  try {
    if (localStorage.getItem(EDITS_KEY) === null) {
      localStorage.setItem(EDITS_KEY, String(ranBefore() ? ASK_AFTER - 1 : 0));
    }
  } catch {
    // Without storage there is no ask.
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
  const [asking, setAsking] = useState(() => {
    startCount();
    return !answered() && editCount() >= ASK_AFTER;
  });

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
