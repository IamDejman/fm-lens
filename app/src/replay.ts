import type { PostHog } from "posthog-js/dist/module.no-external";

/**
 * Recordings of FM Lens's own window, sent to PostHog: what it shows and where it is clicked, to see where it is hard
 * to use. What is typed is masked, and so are the manager's name, email addresses and the user's folder in a file path.
 * `usage.ts` starts it, so the same rules and the same switch decide whether anything is sent.
 */

const API_HOST = "https://us.i.posthog.com";
const MASK = "***";
/** The user's own folder in a path, on macOS, Windows and Linux. */
const HOME = /([/\\](?:Users|home)[/\\])[^/\\\s]+/gi;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** The attributes that hold text a person reads. The others draw the page, and a name is not looked for in them. */
const READ = new Set(["title", "aria-label", "alt", "placeholder"]);

let manager: RegExp | null = null;
let recorder: PostHog | null = null;
let loading: Promise<void> | null = null;
/** Whether a recording is wanted now: the switch can be turned while the recorder is still loading. */
let wanted = false;

/** Masks the manager's name in the recording from here on: most managers are named after the person playing. */
export function hideManager(name: string | null): void {
  const full = name?.trim() ?? "";
  // The name in full and each word of it, since a list may show the surname alone.
  const parts = [full, ...full.split(/\s+/).filter((part) => part.length > 2)]
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // As whole words: a manager named Tom does not mask Tomiyasu.
  manager =
    parts.length > 0 ? new RegExp(`(^|[^\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
}

function maskPaths(text: string): string {
  return text.replace(HOME, `$1${MASK}`);
}

/** `text` as a recording holds it. */
export function maskText(text: string): string {
  const masked = maskPaths(text).replace(EMAIL, MASK);
  return manager ? masked.replace(manager, `$1${MASK}`) : masked;
}

async function load(key: string, distinctId: string): Promise<PostHog> {
  const [{ PostHog }] = await Promise.all([
    import("posthog-js/dist/module.no-external"),
    // The recorder is built into the app: its content security policy lets no script in from outside.
    import("posthog-js/dist/posthog-recorder"),
  ]);
  const posthog = new PostHog();
  posthog.init(key, {
    api_host: API_HOST,
    // The install id the events carry, so a recording and its events are one install's.
    bootstrap: { distinctID: distinctId },
    // For the life of the window, as a launch is counted: a reload carries on the same recording.
    persistence: "sessionStorage",
    disable_external_dependency_loading: true,
    disable_session_recording: !wanted,
    // Only the recording. `usage.ts` sends the events, and nothing else is collected, whatever the project turns on.
    autocapture: false,
    rageclick: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    enable_recording_console_log: false,
    advanced_disable_feature_flags: true,
    disable_surveys: true,
    disable_conversations: true,
    disable_product_tours: true,
    save_referrer: false,
    save_campaign_params: false,
    session_recording: {
      // Every text goes through `maskText`, which hides only what says who the user is.
      maskTextSelector: "*",
      maskTextFn: maskText,
      maskAttributeFn: (name, value) => (READ.has(name) ? maskText(value) : maskPaths(value)),
    },
  });
  return posthog;
}

/** Starts recording the window, or carries on after `stopReplay`. A recorder that fails to load records nothing. */
export function startReplay(key: string, distinctId: string): void {
  wanted = true;
  if (recorder) {
    recorder.startSessionRecording();
    return;
  }
  loading ??= load(key, distinctId).then(
    (posthog) => {
      recorder = posthog;
    },
    () => {
      loading = null;
    },
  );
}

export function stopReplay(): void {
  wanted = false;
  recorder?.stopSessionRecording();
}

/** What ties an event to the recording it happened in, while one is running. */
export function replaySession(): Record<string, string> {
  return recorder?.sessionRecordingStarted() ? { $session_id: recorder.get_session_id() } : {};
}
