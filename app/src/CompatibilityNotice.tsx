// The notice under the masthead when the game is a version FM Lens has no profile for, or some of the checks it
// makes before writing did not pass: what that leaves out, and the way to a newer version that may support the game.

import { describeGame } from "./format";
import { CHECK_NAMES, compatibilityText, updateText } from "./labels";
import type { ConnectionInfo } from "./types";
import type { UpdateState } from "./update";

const text = compatibilityText;

/**
 * Nothing while the game is a version the editor knows and every check passed. Otherwise the version and the checks
 * that did not pass: the in-game date apart, as it only takes the ages away; the others leave what they cover
 * read-only. While a version without a profile is read-only, Relaunch to update once a newer FM Lens is installed,
 * and Check for updates until then, as a game update is usually followed by an FM Lens one. A newer version this copy
 * cannot install itself has its own notice, with Download.
 */
export function CompatibilityNotice(props: {
  connection: ConnectionInfo;
  update: UpdateState | null;
  onRelaunch: (version: string) => void;
  onCheck: () => void;
}) {
  const { connection, update } = props;
  const failed = connection.health.results.filter((result) => !result.passed).map((result) => result.check);
  const unknown = !connection.knownBuild;
  if (!unknown && failed.length === 0) {
    return null;
  }
  const noDate = failed.includes("gameDate");
  const locked = failed.filter((check) => check !== "gameDate").map((check) => CHECK_NAMES[check]);
  const blocked = unknown && !connection.editable;
  return (
    <div className="compatibility-notice">
      <div className="compatibility-text">
        <strong>{unknown ? text.unknownBuild(describeGame(connection.game)) : text.failedTitle}</strong>
        {unknown && <p>{connection.editable ? text.allowedText : text.unknownBuildText}</p>}
        {noDate && <p>{text.noDate}</p>}
        {locked.length > 0 && <p>{text.failed(text.join(locked))}</p>}
        {!unknown && <p>{text.reloadHint}</p>}
      </div>
      {blocked && update?.phase === "ready" ? (
        <span className="update-actions">
          <button type="button" className="primary" onClick={() => props.onRelaunch(update.version)}>
            {updateText.relaunch}
          </button>
        </span>
      ) : blocked && update?.phase !== "available" && update?.phase !== "failed" ? (
        <span className="update-actions">
          <button type="button" disabled={update?.phase === "checking"} onClick={props.onCheck}>
            {updateText.check}
          </button>
        </span>
      ) : null}
    </div>
  );
}
