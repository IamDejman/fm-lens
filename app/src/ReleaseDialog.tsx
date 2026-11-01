// Releasing a player from his club, which leaves him a free agent: the button beside Transfer in the header of his
// profile, and the dialog it opens. The dialog asks the game whether he can be released before it offers to, and
// releases him: he leaves the club's teams and his contract, and a captaincy he held there is left empty. The release
// is logged like any change, and one undo from the Changes view brings him back on his contract.

import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { planRelease, releasePlayer } from "./editing";
import { describeError } from "./format";
import { releaseText as text } from "./labels";
import { ClubLine } from "./MoveDialog";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** The player the dialog releases, and the club he is at. */
interface ReleasingPlayer {
  uid: number;
  name: string;
  club: string;
  /** The club's UID, for its logo. */
  clubUid: number | null;
}

/** The Release button of a player's profile, and the dialog it opens. The profile decides when the button is there. */
export function ReleaseButton({ player }: { player: ReleasingPlayer }) {
  const { onEdited } = useContext(EditorContext);
  // The player the dialog was opened for: the profile behind it cannot change while it is up.
  const [opened, setOpened] = useState<ReleasingPlayer | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Once the dialog is gone, focus goes back to the button that opened it. Doing it earlier, with the dialog still
  // up, would only make the dialog take focus back.
  useEffect(() => {
    if (wasOpen.current && opened === null) {
      button.current?.focus();
    }
    wasOpen.current = opened !== null;
  }, [opened]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="release-toggle"
        aria-haspopup="dialog"
        title={text.buttonTitle}
        onClick={() => setOpened(player)}
      >
        {text.button}
      </button>
      {opened && <ReleaseDialog player={opened} onReleased={onEdited} onClose={() => setOpened(null)} />}
    </>
  );
}

/** What the game said to the plan: the club he would leave, or why he cannot be released. */
type Planned = { club: string } | { error: string };

interface ReleaseDialogProps {
  player: ReleasingPlayer;
  /** Called once the player is released: the game has changed, so the lists and the profile read it again. */
  onReleased: () => void;
  onClose: () => void;
}

function ReleaseDialog({ player, onReleased, onClose }: ReleaseDialogProps) {
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const running = useRef(false);
  // Set when a release failed: once the buttons are enabled again, Cancel takes focus (Release waits for a new plan).
  const pendingFocus = useRef(false);

  const [planned, setPlanned] = useState<Planned | null>(null);
  // How often the plan was asked again: after a release the game refused.
  const [replans, setReplans] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useModal(dialog, !releasing, onClose);

  // Release is not offered until the game has said yes, so focus starts on Cancel.
  useEffect(() => {
    alive.current = true;
    cancelButton.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (pendingFocus.current && !releasing) {
      pendingFocus.current = false;
      cancelButton.current?.focus();
    }
  });

  // The plan, asked when the dialog opens and again after a failed release. An answer for an older ask is dropped.
  useEffect(() => {
    let cancelled = false;
    setPlanned(null);
    planRelease(player.uid).then(
      (club) => !cancelled && setPlanned({ club: club.name }),
      (e) => !cancelled && setPlanned({ error: describeError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [player.uid, replans]);

  const canRelease = planned !== null && "club" in planned && !releasing;

  const release = async () => {
    if (!canRelease || running.current) {
      return;
    }
    running.current = true;
    setReleasing(true);
    setFailure(null);
    try {
      await releasePlayer(player.uid);
      // The game has changed: the lists, the profile and the change log read it again.
      onReleased();
      onClose();
    } catch (e) {
      if (alive.current) {
        setFailure(describeError(e));
        // The game may not be as the plan found it: the plan is worked out again before Release is offered again.
        setReplans((count) => count + 1);
        pendingFocus.current = true;
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setReleasing(false);
      }
    }
  };

  // What the release comes to, or why it cannot be made. The plan line is a live region that is always there.
  const plan: { tone: "pending" | "ok" | "refused"; message: string } =
    planned === null
      ? { tone: "pending", message: text.checking }
      : "error" in planned
        ? { tone: "refused", message: planned.error }
        : { tone: "ok", message: text.ready(planned.club) };

  return createPortal(
    // A click beside the dialog does nothing, and keeps focus where it is.
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal move-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("title")}
        aria-describedby={id("player")}
        aria-busy={releasing || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id("title")}>{text.title}</h2>
          <p id={id("player")} className="move-player">
            {player.name}
          </p>
        </header>

        <div className="modal-body">
          <section className="move-section" aria-labelledby={id("from")}>
            <h3 id={id("from")}>{text.from}</h3>
            <div className="move-club">
              <ClubLine uid={player.clubUid} name={player.club} />
            </div>
          </section>

          <p className={`move-plan ${plan.tone}`} role="status">
            {plan.message}
          </p>

          <section className="move-section" aria-labelledby={id("does")}>
            <h3 id={id("does")}>{text.doesHeading}</h3>
            <ul className="move-facts">
              {text.does.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>

        {failure !== null && (
          <div className="banner move-error" role="alert">
            {failure}
          </div>
        )}

        <footer className="modal-foot">
          <span className="move-foot-note">{text.hint}</span>
          <button type="button" className="primary" disabled={!canRelease} onClick={() => void release()}>
            {releasing ? text.releasing : text.release}
          </button>
          <button ref={cancelButton} type="button" disabled={releasing} onClick={onClose}>
            {text.cancel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
