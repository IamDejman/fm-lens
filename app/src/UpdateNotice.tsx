import { updateText } from "./labels";
import { openRelease, type Release, type UpdateState } from "./update";

const text = updateText;

/** The notice under the masthead that a newer version is out: its page opens in the browser, or it waits for Later. */
export function UpdateNotice(props: { release: Release; current: string | null; onLater: (release: Release) => void }) {
  const { release, current, onLater } = props;
  return (
    <div className="update-notice" role="status">
      <span>
        <strong>{text.available(release.version)}</strong>
        {current && <span className="update-current">{text.youHave(current)}</span>}
      </span>
      <span className="update-actions">
        <button type="button" className="primary" onClick={() => openRelease(release)}>
          {text.download}
        </button>
        <button type="button" onClick={() => onLater(release)}>
          {text.later}
        </button>
      </span>
    </div>
  );
}

/** What a check by hand found, in the words of the foot of the window. */
function answer(state: UpdateState): string {
  switch (state.phase) {
    case "checking":
      return text.checking;
    case "current":
      return text.upToDate;
    case "failed":
      return text.failed;
    case "newer":
      return text.available(state.release.version);
  }
}

/**
 * Check for updates, at the foot of the window beside the app's version; once pressed, what it found takes its place
 * until the answer comes. Only the answer to a press is shown there: the check at startup speaks through the notice.
 */
export function UpdateCheck(props: { state: UpdateState; asked: boolean; onCheck: () => void }) {
  const { state, asked, onCheck } = props;
  return (
    <span className="update-check">
      {asked && <span className="update-answer">{answer(state)}</span>}
      {!(asked && state.phase === "checking") && (
        <button type="button" className="update-link" onClick={onCheck}>
          {text.check}
        </button>
      )}
    </span>
  );
}
