import { updateText } from "./labels";
import { openLatestRelease, type UpdateState } from "./update";

const text = updateText;

/** What Check for Updates says while it looks, and when it finds nothing to install. */
const CHECK_RESULT = {
  checking: text.checking,
  current: text.upToDate,
  unreachable: text.checkFailed,
} as const;

/**
 * The notice under the masthead about a newer version this copy cannot install itself, or failed to: Download opens
 * its release page and Later hides the notice. An installed one shows as Relaunch to update in the colophon instead.
 * After Check for Updates it says it is looking, then that the app is up to date or could not check.
 */
export function UpdateNotice({
  update,
  onDismiss,
}: {
  update: Exclude<UpdateState, { phase: "ready" }>;
  onDismiss: () => void;
}) {
  if (update.phase === "checking" || update.phase === "current" || update.phase === "unreachable") {
    return (
      <div className="update-notice" role="status">
        <strong>{CHECK_RESULT[update.phase]}</strong>
        {update.phase !== "checking" && (
          <span className="update-actions">
            <button type="button" onClick={onDismiss}>
              {text.dismiss}
            </button>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="update-notice" role="status">
      <span>
        <strong>{text.available(update.version)}</strong>
        {update.phase === "failed" && <span className="update-error">{text.installFailed(update.reason)}</span>}
      </span>
      <span className="update-actions">
        <button type="button" className="primary" onClick={openLatestRelease}>
          {text.download}
        </button>
        <button type="button" onClick={onDismiss}>
          {text.later}
        </button>
      </span>
    </div>
  );
}
