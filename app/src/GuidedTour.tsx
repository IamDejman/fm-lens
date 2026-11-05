import { useEffect, useRef, useState, type ReactNode } from "react";
import { appText } from "./labels";

const STORAGE_KEY = "fmlibre.tour";
const EXERCISE_KEY = "fmlibre.tour.exercise";

const STEP_IDS = ["brand", "tabs", "search", "settings", "status"] as const;

/**
 * The editing exercise, in order. Each step is where the user is in an edit, read from the page (see
 * `exerciseStep`), so it moves on as they act and goes back if they back out.
 */
const EXERCISE_IDS = ["list", "edit", "profile", "apply", "changes"] as const;

type StepId = (typeof STEP_IDS)[number];
type ExerciseId = (typeof EXERCISE_IDS)[number];

function stored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "done";
  } catch {
    return true;
  }
}

function store(key: string): void {
  try {
    window.localStorage.setItem(key, "done");
  } catch {
    // Without storage the introduction shows again next time. It can still be skipped.
  }
}

/**
 * How far the user is in an edit, from what the page shows: a profile open (its Edit button), editing (the footer),
 * a change Apply can write (Apply enabled), and the report Apply leaves. `reached` is the furthest step so far: once
 * Apply has reported, the last step stays.
 */
function exerciseStep(reached: number): number {
  const last = EXERCISE_IDS.length - 1;
  if (reached >= last || document.querySelector(".profile .edit-report > *") !== null) {
    return last;
  }
  if (document.querySelector('[data-tour="apply"]:not(:disabled)') !== null) {
    return 3;
  }
  if (document.querySelector(".profile .edit-footer") !== null) {
    return 2;
  }
  return document.querySelector('[data-tour="edit"]') !== null ? 1 : 0;
}

/**
 * A short introduction to the companion, shown once on this computer, then a guided first edit, shown once the game
 * can be edited. `connected` is part of the dependency list so a list's search box is picked up when it appears.
 */
export function GuidedTour({ ready, connected, editable }: { ready: boolean; connected: boolean; editable: boolean }) {
  const [at, setAt] = useState<number | null>(() => (stored(STORAGE_KEY) ? null : 0));
  const [ids, setIds] = useState<StepId[]>([]);
  const [exerciseDone, setExerciseDone] = useState(() => stored(EXERCISE_KEY));
  const [reached, setReached] = useState(0);

  useEffect(() => {
    if (!ready || at === null) {
      return;
    }
    setIds(STEP_IDS.filter((id) => document.querySelector(`[data-tour="${id}"]`) !== null));
  }, [ready, connected, at]);

  // The exercise runs by itself once the introduction is over and the game can be edited, until it is done once.
  const running = ready && at === null && editable && !exerciseDone;
  const exercise = running ? reached : null;

  // While the exercise runs, its step follows the page.
  useEffect(() => {
    if (!running) {
      return;
    }
    // A burst of changes to the page is read once, after it settles.
    let timer = 0;
    const follow = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setReached(exerciseStep), 50);
    };
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [running]);

  const index = at === null ? 0 : Math.min(at, Math.max(ids.length - 1, 0));
  const introId = at === null ? undefined : ids[index];
  const exerciseId = exercise === null ? undefined : EXERCISE_IDS[exercise];
  const id: StepId | ExerciseId | undefined = introId ?? exerciseId;

  useEffect(() => {
    if (!id) {
      return;
    }
    const target = document.querySelector(`[data-tour="${id}"]`);
    target?.classList.add("tour-ring");
    return () => target?.classList.remove("tour-ring");
    // The exercise's targets come and go with the profile, so the ring is placed again whenever the step changes.
  }, [id, exercise]);

  // Each step of the introduction takes keyboard focus, on its main button, so that Enter goes on and Escape ends the
  // tour. The exercise leaves focus where the user is working.
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (introId) {
      primary.current?.focus({ preventScroll: true });
    }
  }, [introId]);

  if (!ready) {
    return null;
  }

  const text = appText.tour;

  if (introId) {
    const step = text.steps[introId];
    const last = index >= ids.length - 1;
    const close = (skipped: boolean) => {
      store(STORAGE_KEY);
      if (skipped) {
        // Skipping the introduction skips the exercise too.
        store(EXERCISE_KEY);
        setExerciseDone(true);
      }
      setAt(null);
      // Focus goes where the tour began: the search box of the list, when there is one.
      document.querySelector<HTMLInputElement>('[data-tour="search"] input')?.focus();
    };
    return (
      <TourCard
        className={introId === "status" ? "tour top" : "tour"}
        title={step.title}
        body={step.body}
        progress={text.progress(index + 1, ids.length)}
        onEscape={() => close(true)}
      >
        <button type="button" onClick={() => close(true)}>
          {text.skip}
        </button>
        {index > 0 && (
          <button type="button" onClick={() => setAt(index - 1)}>
            {text.back}
          </button>
        )}
        <button ref={primary} type="button" className="primary" onClick={() => (last ? close(false) : setAt(index + 1))}>
          {last ? text.done : text.next}
        </button>
      </TourCard>
    );
  }

  if (exerciseId && exercise !== null) {
    const step = text.exercise[exerciseId];
    const last = exercise >= EXERCISE_IDS.length - 1;
    const end = () => {
      store(EXERCISE_KEY);
      setExerciseDone(true);
    };
    return (
      <TourCard
        className="tour side"
        title={step.title}
        body={step.body}
        progress={text.progress(exercise + 1, EXERCISE_IDS.length)}
        live
        onEscape={end}
      >
        {last ? (
          <button type="button" className="primary" onClick={end}>
            {text.done}
          </button>
        ) : (
          <button type="button" onClick={end}>
            {text.skip}
          </button>
        )}
      </TourCard>
    );
  }

  return null;
}

interface TourCardProps {
  className: string;
  title: string;
  body: string;
  progress: string;
  /** Read each step out as it comes: the exercise moves on without the user pressing anything in the card. */
  live?: boolean;
  onEscape: () => void;
  children: ReactNode;
}

function TourCard({ className, title, body, progress, live, onEscape, children }: TourCardProps) {
  return (
    <div
      className={className}
      role="dialog"
      aria-labelledby="tour-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onEscape();
        }
      }}
    >
      <div aria-live={live ? "polite" : undefined}>
        <h2 id="tour-title">{title}</h2>
        <p>{body}</p>
      </div>
      <div className="tour-actions">
        <span className="tour-progress">{progress}</span>
        {children}
      </div>
    </div>
  );
}
