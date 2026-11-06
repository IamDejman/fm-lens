import { updateText } from "./labels";
import { openLatestRelease, type InstallProgress, type UpdateState } from "./update";

const text = updateText;

/** How far installing has got, in the notice's words. */
function progressText(progress: InstallProgress): string {
  switch (progress.phase) {
    case "preparing":
      return text.preparing;
    case "downloading":
      return text.downloading(progress.percent);
    case "installing":
      return text.installing;
  }
}

/**
 * The notice under the masthead about a newer version: how far installing it has got, after which the app starts again
 * as the new version. Where this copy cannot install it, or installing failed, Download opens its release page and
 * Later hides the notice.
 */
export function UpdateNotice({ update, onDismiss }: { update: UpdateState; onDismiss: () => void }) {
  return (
    <div className="update-notice" role="status">
      <span>
        <strong>{update.phase === "installing" ? text.updating(update.version) : text.available(update.version)}</strong>
        {update.phase === "installing" && <span className="update-progress">{progressText(update.progress)}</span>}
        {update.phase === "failed" && <span className="update-error">{text.installFailed(update.reason)}</span>}
      </span>
      {update.phase !== "installing" && (
        <span className="update-actions">
          <button type="button" className="primary" onClick={openLatestRelease}>
            {text.download}
          </button>
          <button type="button" onClick={onDismiss}>
            {text.later}
          </button>
        </span>
      )}
    </div>
  );
}
