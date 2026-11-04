import { useEffect, useState } from "react";
import { appText } from "./labels";

const STORAGE_KEY = "fmlibre.tour";

const STEP_IDS = ["brand", "tabs", "search", "settings", "status"] as const;

type StepId = (typeof STEP_IDS)[number];

function finished(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return true;
  }
}

function finish(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    // Without storage the introduction shows again next time. It can still be skipped.
  }
}

/**
 * A short introduction to the companion, shown once on this computer.
 * `connected` is part of the dependency list so a list's search box is picked up when it appears.
 */
export function GuidedTour({ ready, connected }: { ready: boolean; connected: boolean }) {
  const [at, setAt] = useState<number | null>(() => (finished() ? null : 0));
  const [ids, setIds] = useState<StepId[]>([]);

  useEffect(() => {
    if (!ready || at === null) {
      return;
    }
    setIds(STEP_IDS.filter((id) => document.querySelector(`[data-tour="${id}"]`) !== null));
  }, [ready, connected, at]);

  const index = at === null ? 0 : Math.min(at, Math.max(ids.length - 1, 0));
  const id = ids[index];
  const step = id ? { id, ...appText.tour.steps[id] } : null;

  useEffect(() => {
    if (!id) {
      return;
    }
    const target = document.querySelector(`[data-tour="${id}"]`);
    target?.classList.add("tour-ring");
    return () => target?.classList.remove("tour-ring");
  }, [id]);

  if (!ready || at === null || !step) {
    return null;
  }

  const text = appText.tour;
  const close = () => {
    finish();
    setAt(null);
  };
  const last = index >= ids.length - 1;

  return (
    <div className={step.id === "status" ? "tour top" : "tour"} role="dialog" aria-labelledby="tour-title">
      <h2 id="tour-title">{step.title}</h2>
      <p>{step.body}</p>
      <div className="tour-actions">
        <span className="tour-progress">{text.progress(index + 1, ids.length)}</span>
        <button type="button" onClick={close}>
          {text.skip}
        </button>
        {index > 0 && (
          <button type="button" onClick={() => setAt(index - 1)}>
            {text.back}
          </button>
        )}
        <button type="button" className="primary" onClick={() => (last ? close() : setAt(index + 1))}>
          {last ? text.done : text.next}
        </button>
      </div>
    </div>
  );
}
