import { updateText } from "./labels";
import { openLatestRelease, type UpdateState } from "./update";

const text = updateText;

/**
 * The notice under the masthead about a newer version this copy cannot install itself, or failed to: Download opens
 * its release page and Later hides the notice. An installed one shows as Relaunch to update in the colophon instead.
 */
export function UpdateNotice({
  update,
  onDismiss,
}: {
  update: Exclude<UpdateState, { phase: "ready" }>;
  onDismiss: () => void;
}) {
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
