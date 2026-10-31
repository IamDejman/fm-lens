// Moving a player to another club: the button in the header of his profile, and the dialog it opens. The dialog picks
// the club (and, if wanted, a new wage and contract end), asks the game whether the move can be made before it offers
// it, and makes it. The move is logged like any change, and can be undone from the Changes view.

import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { call } from "./api";
import { isoFromNumber, movePlayer, numberFromDate, numberFromIso, planClubMove } from "./editing";
import { describeError, formatDate, formatPounds } from "./format";
import { clubListText, editText, fieldLabel, moveText as text, profileText } from "./labels";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { ReputationMeter } from "./ProfileParts";
import type { ClubPage, ClubSummary, Contract, MovePreview, MoveTerms } from "./types";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** The player the dialog moves, and the club he is at. */
interface MovingPlayer {
  uid: number;
  name: string;
  club: string;
  /** The club's UID, for its logo. */
  clubUid: number | null;
}

interface MoveButtonProps {
  player: MovingPlayer;
  /** His contract as the profile has read it: the inputs of the dialog start from it. Null when he has none. */
  contract: Contract | null;
  /** Whether the profile has been read: until then there is no contract for the dialog to start from. */
  ready: boolean;
}

/** The player and the contract the dialog was opened for: the profile behind it cannot change while it is up. */
interface Opened {
  player: MovingPlayer;
  contract: Contract | null;
}

/**
 * The Move to another club button of a player's profile, and the dialog it opens. The profile decides when the button
 * is there (see `PlayerProfile`).
 */
export function MoveButton({ player, contract, ready }: MoveButtonProps) {
  const { onEdited } = useContext(EditorContext);
  const [opened, setOpened] = useState<Opened | null>(null);
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
        className="move-toggle"
        aria-haspopup="dialog"
        disabled={!ready}
        title={text.buttonTitle}
        onClick={() => setOpened({ player, contract })}
      >
        {text.button}
      </button>
      {opened && (
        <MoveDialog
          player={opened.player}
          contract={opened.contract}
          onMoved={onEdited}
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
}

/** How many clubs the search lists: the best by reputation, or the best matches of what was typed. */
const RESULT_LIMIT = 8;

/** How long the search waits after the last key, so that a burst of keys asks the game once. */
const SEARCH_DELAY = 150;

/** The same for the plan, after the last change of the club or the terms. */
const PLAN_DELAY = 200;

/** What the search answered for the text it was asked with: a page of clubs, or why it failed. */
type Found = { query: string; page: ClubPage } | { query: string; error: string };

/** What the game said to the plan of a move, for the club and terms it was asked about (see `planKey`). */
interface Planned {
  key: string;
  outcome: { preview: MovePreview } | { error: string };
}

/** How the text of an input stands against the value the contract had when the dialog opened. */
type Verdict = { status: "same" } | { status: "changed"; value: number } | { status: "invalid" };

const SAME: Verdict = { status: "same" };
const INVALID: Verdict = { status: "invalid" };

/** The whole number `text` holds; null when it is empty or anything else (a fraction, words, too big to send). */
function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  // Adding zero turns a typed "-0" into 0.
  return trimmed !== "" && Number.isSafeInteger(value) ? value + 0 : null;
}

/**
 * The wage input: a change to send, no change (also when the text is another way of writing what the contract had,
 * or the contract has none and nothing was typed), or unusable. Whether the game takes the number is for the plan
 * to say.
 */
function judgeWage(text: string, was: number | null): Verdict {
  if (text === (was === null ? "" : String(was))) {
    return SAME;
  }
  const value = wholeNumber(text);
  if (value === null || value < 0) {
    return INVALID;
  }
  return value === was ? SAME : { status: "changed", value };
}

/** The same for the contract end, which a date input holds as `YYYY-MM-DD`: unusable until it is a whole, real date. */
function judgeExpires(text: string, was: number | null): Verdict {
  if (text === (was === null ? "" : isoFromNumber(was))) {
    return SAME;
  }
  const value = numberFromIso(text);
  return value === null ? INVALID : value === was ? SAME : { status: "changed", value };
}

/** The terms to send: only what was changed, so that everything else stays as the contract has it. */
function termsOf(wage: number | undefined, expires: number | undefined): MoveTerms {
  return { ...(wage !== undefined && { wage }), ...(expires !== undefined && { expires }) };
}

/** What a plan is for. A plan is the dialog's only while the club and the terms are the ones it was asked about. */
const planKey = (club: number, terms: MoveTerms) => `${club}:${terms.wage ?? ""}:${terms.expires ?? ""}`;

/** An input's class: outlined in the accent colour once it holds a change, and as an error while it cannot be sent. */
const inputClass = (verdict: Verdict) => (verdict.status === "same" ? "move-input" : `move-input ${verdict.status}`);

/** What goes under an input: why it cannot be sent, or the value it started from once it holds another. */
function termNote(verdict: Verdict, invalid: string, was: string | null): { message: string; invalid: boolean } | null {
  if (verdict.status === "invalid") {
    return { message: invalid, invalid: true };
  }
  return verdict.status === "changed" && was !== null ? { message: editText.was(was), invalid: false } : null;
}

/** A club as one line: its logo, its name (cut short where it does not fit), and a tag if it is a women's club. */
function ClubLine({ uid, name, women = false }: { uid: number | null; name: string; women?: boolean }) {
  return (
    <WithPicture picture={<ClubLogo uid={uid} name={name} size={PICTURE_SIZE.clubRowLogo} />}>
      <span className="move-club-text">
        <span className="move-club-name" title={name}>
          {name}
        </span>
        {women && <span className="tag women">{clubListText.women}</span>}
      </span>
    </WithPicture>
  );
}

interface MoveDialogProps {
  player: MovingPlayer;
  /** His contract as it was when the dialog opened: the inputs start from it. Null when he has none. */
  contract: Contract | null;
  /** Called once the player has moved: the game has changed, so the lists and the profile read it again. */
  onMoved: () => void;
  onClose: () => void;
}

function MoveDialog({ player, contract, onMoved, onClose }: MoveDialogProps) {
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const moveButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const running = useRef(false);
  // The control that takes focus once the next render is on screen: one that is not there yet, or was disabled.
  const pendingFocus = useRef<"search" | "change" | "move" | null>(null);
  // Set when a key moved the highlight, so that the row it reached scrolls into view; the mouse is not followed.
  const keyboardMoved = useRef(false);

  const wasWage = contract?.wage ?? null;
  const wasExpires = contract?.expires ? numberFromDate(contract.expires) : null;

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  // The row Enter picks.
  const [active, setActive] = useState(0);
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [wageText, setWageText] = useState(wasWage === null ? "" : String(wasWage));
  const [expiresText, setExpiresText] = useState(wasExpires === null ? "" : isoFromNumber(wasExpires));
  const [planned, setPlanned] = useState<Planned | null>(null);
  // How often the plan was asked again with nothing changed: after a move the game refused.
  const [replans, setReplans] = useState(0);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<{ key: string; message: string } | null>(null);

  useModal(dialog, !moving, onClose);

  // The inputs, and the terms they stand for.
  const wageVerdict = judgeWage(wageText, wasWage);
  const expiresVerdict = judgeExpires(expiresText, wasExpires);
  const valid = wageVerdict.status !== "invalid" && expiresVerdict.status !== "invalid";
  const wage = wageVerdict.status === "changed" ? wageVerdict.value : undefined;
  const expires = expiresVerdict.status === "changed" ? expiresVerdict.value : undefined;
  const terms = termsOf(wage, expires);

  // What the plan is for: null while there is no club, or an input cannot be sent. Move is offered only for a plan the
  // game made for the club and terms as they are now, so a change takes it back at once, before the new plan is asked.
  const key = club !== null && valid ? planKey(club.uid, terms) : null;
  const outcome = key !== null && planned?.key === key ? planned.outcome : null;
  const preview = outcome !== null && "preview" in outcome ? outcome.preview : null;
  const canMove = preview !== null && !moving;

  // The clubs on show. Until the search has answered for what is typed they are the last ones: Enter leaves them alone.
  const rows = found !== null && "page" in found ? found.page.rows : [];
  const settled = found !== null && found.query === query;

  useEffect(() => {
    alive.current = true;
    searchInput.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  // The search asks for the clubs a moment after the last key, while no club is picked. An answer that comes after
  // the text changed, or after a club was picked, is dropped: the cleanup says so.
  const choosing = club === null;
  useEffect(() => {
    if (!choosing) {
      return;
    }
    let cancelled = false;
    const answer = (next: Found) => {
      if (!cancelled) {
        setFound(next);
        setActive(0);
      }
    };
    const timer = setTimeout(
      () => {
        call<ClubPage>("search_clubs", { query, limit: RESULT_LIMIT, filter: {} }).then(
          (page) => answer({ query, page }),
          (e) => answer({ query, error: describeError(e) }),
        );
      },
      // The first look, at the best clubs, needs no wait.
      query === "" ? 0 : SEARCH_DELAY,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [choosing, query]);

  // The game works out the move a moment after the club and the terms stop changing. An answer that comes after they
  // changed again is dropped: the cleanup says so.
  useEffect(() => {
    if (club === null || !valid) {
      return;
    }
    let cancelled = false;
    const asked = termsOf(wage, expires);
    const answer = (result: Planned["outcome"]) => {
      if (!cancelled) {
        setPlanned({ key: planKey(club.uid, asked), outcome: result });
      }
    };
    const timer = setTimeout(() => {
      planClubMove(player.uid, club.uid, asked).then(
        (made) => answer({ preview: made }),
        (e) => answer({ error: describeError(e) }),
      );
    }, PLAN_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [player.uid, club, valid, wage, expires, replans]);

  // Focus that was asked for while the controls changed: the button that takes the place of the search, the search
  // that takes the place of the button, or Move once a failed move is over (the buttons were disabled while it ran).
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) {
      return;
    }
    pendingFocus.current = null;
    if (target === "search") {
      searchInput.current?.focus();
      searchInput.current?.select();
    } else if (target === "change") {
      changeButton.current?.focus();
    } else {
      (moveButton.current && !moveButton.current.disabled ? moveButton : cancelButton).current?.focus();
    }
  });

  useEffect(() => {
    if (keyboardMoved.current) {
      keyboardMoved.current = false;
      results.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
    }
  }, [active]);

  const pick = (chosen: ClubSummary) => {
    setClub(chosen);
    pendingFocus.current = "change";
  };

  const searchAgain = () => {
    setClub(null);
    pendingFocus.current = "search";
  };

  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // The arrows move through the clubs, not the caret.
      event.preventDefault();
      if (rows.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        keyboardMoved.current = true;
        setActive((index) => (index + step + rows.length) % rows.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (settled && row) {
        pick(row);
      }
    }
  };

  const move = async () => {
    if (!canMove || key === null || club === null || running.current) {
      return;
    }
    running.current = true;
    setMoving(true);
    setMoveError(null);
    try {
      await movePlayer(player.uid, club.uid, terms);
      // The game has changed: the lists, the profile and the change log read it again.
      onMoved();
      onClose();
    } catch (e) {
      if (alive.current) {
        setMoveError({ key, message: describeError(e) });
        // The game may not be as the plan found it: the plan is worked out again, and Move waits for it if it must.
        setReplans((count) => count + 1);
        pendingFocus.current = "move";
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setMoving(false);
      }
    }
  };

  // What the search says under its list: a live region that is always there, so that it is read out when it fills.
  const note =
    found === null
      ? text.searching
      : !settled
        ? ""
        : "error" in found
          ? text.searchFailed(found.error)
          : found.page.rows.length === 0
            ? clubListText.empty(query, false)
            : found.page.total > found.page.rows.length
              ? text.more(found.page.total - found.page.rows.length)
              : "";
  const noteIsError = found !== null && settled && "error" in found;

  const wageNote = termNote(wageVerdict, text.wageInvalid, wasWage === null ? null : formatPounds(wasWage));
  const expiresNote = termNote(
    expiresVerdict,
    text.expiresInvalid,
    contract?.expires ? formatDate(contract.expires) : null,
  );

  // What the move comes to, or why it cannot be made. The plan line is a live region that is always there.
  const plan: { tone: "pending" | "ok" | "refused"; message: string } =
    club === null
      ? { tone: "pending", message: text.chooseClub }
      : !valid
        ? { tone: "pending", message: text.fixTerms }
        : outcome === null
          ? { tone: "pending", message: text.checking }
          : "error" in outcome
            ? { tone: "refused", message: outcome.error }
            : { tone: "ok", message: text.route(outcome.preview.from.name, outcome.preview.to.name) };
  // A failed move is told for the club and terms it was tried with only.
  const failure = moveError !== null && moveError.key === key ? moveError.message : null;

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
        aria-busy={moving || undefined}
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

          <section className="move-section" aria-labelledby={id("to")}>
            <h3 id={id("to")}>{text.to}</h3>
            {club === null ? (
              <>
                <label className="search move-search">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.5" />
                    <path d="m13 13 4.5 4.5" />
                  </svg>
                  <input
                    ref={searchInput}
                    role="combobox"
                    aria-label={text.searchLabel}
                    aria-autocomplete="list"
                    aria-expanded={rows.length > 0}
                    aria-controls={id("clubs")}
                    aria-activedescendant={rows.length > 0 ? id(`club-${active}`) : undefined}
                    value={query}
                    placeholder={clubListText.search}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    onKeyDown={searchKeyDown}
                  />
                </label>
                {/* The box keeps the room of a full list, so that the dialog does not jump as results come and go. */}
                <div className="move-results-box" aria-busy={!settled || undefined}>
                  <ul
                    ref={results}
                    id={id("clubs")}
                    className="move-results"
                    role="listbox"
                    aria-label={text.resultsLabel}
                  >
                    {rows.map((row, index) => (
                      <li
                        key={row.uid}
                        id={id(`club-${index}`)}
                        className={index === active ? "move-option active" : "move-option"}
                        role="option"
                        aria-selected={index === active}
                        // Focus stays in the search box: a click only picks.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pick(row)}
                      >
                        <ClubLine uid={row.uid} name={row.name} women={row.women} />
                        <ReputationMeter value={row.reputation} />
                      </li>
                    ))}
                  </ul>
                  <p className={noteIsError ? "move-results-note error" : "move-results-note"} role="status">
                    {note}
                  </p>
                </div>
              </>
            ) : (
              <div className="move-club">
                <ClubLine uid={club.uid} name={club.name} women={club.women} />
                <ReputationMeter value={club.reputation} />
                <button
                  ref={changeButton}
                  type="button"
                  className="move-change"
                  disabled={moving}
                  onClick={searchAgain}
                >
                  {text.change}
                </button>
              </div>
            )}
          </section>

          <section className="move-section" aria-labelledby={id("contract")}>
            <h3 id={id("contract")}>{profileText.contract}</h3>
            <div className="move-terms">
              <div className="move-term">
                <label htmlFor={id("wage")}>{fieldLabel("player", "contract.wage")}</label>
                <span className="move-money">
                  <span className="move-unit" aria-hidden="true">
                    {editText.pounds}
                  </span>
                  <input
                    id={id("wage")}
                    className={inputClass(wageVerdict)}
                    type="number"
                    min={0}
                    step={1}
                    value={wageText}
                    readOnly={moving}
                    aria-invalid={wageVerdict.status === "invalid" || undefined}
                    aria-describedby={wageNote ? id("wage-note") : undefined}
                    onChange={(e) => setWageText(e.currentTarget.value)}
                    // A wheel turned over the focused input would change it: let go of it, so the dialog scrolls.
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </span>
                {wageNote && (
                  <p id={id("wage-note")} className={wageNote.invalid ? "move-note invalid" : "move-note"}>
                    {wageNote.message}
                  </p>
                )}
              </div>

              <div className="move-term">
                <label htmlFor={id("expires")}>{fieldLabel("player", "contract.expires")}</label>
                <input
                  id={id("expires")}
                  className={inputClass(expiresVerdict)}
                  type="date"
                  value={expiresText}
                  readOnly={moving}
                  aria-invalid={expiresVerdict.status === "invalid" || undefined}
                  aria-describedby={expiresNote ? id("expires-note") : undefined}
                  onChange={(e) => setExpiresText(e.currentTarget.value)}
                />
                {expiresNote && (
                  <p id={id("expires-note")} className={expiresNote.invalid ? "move-note invalid" : "move-note"}>
                    {expiresNote.message}
                  </p>
                )}
              </div>
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
          <button ref={moveButton} type="button" className="primary" disabled={!canMove} onClick={() => void move()}>
            {moving ? text.moving : text.move}
          </button>
          <button ref={cancelButton} type="button" disabled={moving} onClick={onClose}>
            {text.cancel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
