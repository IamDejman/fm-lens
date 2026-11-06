// Keeping FM Lens up to date. When the window opens, and every four hours while it stays open until a newer version
// turns up, the app reads `latest.json` from the latest release in the public releases repository (the updater's
// endpoint in tauri.conf.json). When that names a newer version, the macOS app installs
// it in the background, without asking: it downloads it, checks its signature against the key the app was built with and
// puts it in place of this one, which keeps running. The colophon then offers Relaunch to update; otherwise the new
// version runs the next time FM Lens opens. A copy that cannot replace itself (one macOS runs from where it was
// downloaded, or a development build) names the new version and opens the website's download page instead. Offline, or when the
// check fails, nothing happens and the app works as before. Check for Updates, in the app menu on macOS, looks at once
// and says what it found.

import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";
import { call, inTauri } from "./api";
import { describeError } from "./format";

/** The website's release notes and download pages: the only pages the app opens (see capabilities/default.json). */
const RELEASES_PAGE = "https://getfmlens.com/releases/";
const DOWNLOAD_PAGE = "https://getfmlens.com/download/";

/** How long reading `latest.json` and downloading the new version may take, in milliseconds. */
const CHECK_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/** How long the app waits before looking again while there is no newer version, in milliseconds. */
const RECHECK_MS = 4 * 60 * 60_000;

/** A newer version, and what the app has done about it. */
export type UpdateState =
  /** Installed: it runs once the app starts again. */
  | { phase: "ready"; version: string }
  /** This copy cannot replace itself: the user downloads the new version. */
  | { phase: "available"; version: string }
  | { phase: "failed"; version: string; reason: string }
  /** Check for Updates is looking, or installing what it found. */
  | { phase: "checking" }
  /** Check for Updates found no newer version. */
  | { phase: "current" }
  /** Check for Updates could not reach the releases. */
  | { phase: "unreachable" };

/** What one look found: a newer version and what was done about it, no newer version, or no answer. */
type Found = Extract<UpdateState, { version: string }> | "current" | "unreachable";

/** Opens the release notes of `version`, on the website. */
export function openRelease(version: string): void {
  openUrl(`${RELEASES_PAGE}#v${version}`).catch(() => {
    // Nothing to fall back on: the notice stays, and its text says what the version brought.
  });
}

/** Opens the website's download page, which starts the latest version's disk image. */
export function openLatestRelease(): void {
  void openUrl(DOWNLOAD_PAGE);
}

/** Whether this copy can replace itself (see `can_self_update`): the macOS app, unless macOS runs it from a download. */
const canSelfUpdate = (): Promise<boolean> => call<boolean>("can_self_update");

/** Whether the checks have started in this window: once, however often the hook mounts. */
let checking = false;

/** The version installed in this run: looking again would only fetch it again. */
let installed: Found | null = null;

/** Looks for a newer version, and installs it where this copy can. */
async function lookOnce(): Promise<Found> {
  if (installed) {
    return installed;
  }
  let found: Awaited<ReturnType<typeof check>>;
  try {
    found = await check({ timeout: CHECK_TIMEOUT_MS });
  } catch {
    return "unreachable";
  }
  if (found === null) {
    return "current";
  }
  const { version } = found;
  if (!(await canSelfUpdate().catch(() => false))) {
    return { phase: "available", version };
  }
  try {
    await found.downloadAndInstall(undefined, { timeout: DOWNLOAD_TIMEOUT_MS });
    installed = { phase: "ready", version };
    return installed;
  } catch (e) {
    return { phase: "failed", version, reason: describeError(e) };
  }
}

/** The look under way: a check asked for while one runs gets its answer instead of starting another. */
let looking: Promise<Found> | null = null;

const look = (): Promise<Found> =>
  (looking ??= lookOnce().finally(() => {
    looking = null;
  }));

/**
 * Looks for a newer version when the window opens, and again every four hours until one turns up, and installs it in
 * the background where this copy can.
 * `update` is what to tell the user, null while there is nothing to tell; `checkNow` looks at once and says what it
 * found; `relaunch` starts the installed version; `dismiss` hides a notice the user cannot act on now.
 */
export function useUpdate() {
  const [update, setUpdate] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!inTauri || checking) {
      return;
    }
    checking = true;
    const lookLater = async () => {
      // Offline, no release yet, or nothing newer: the app carries on as it is, and looks again later.
      const found = await look();
      if (typeof found === "string") {
        setTimeout(() => void lookLater(), RECHECK_MS);
        return;
      }
      setUpdate(found);
    };
    void lookLater();
  }, []);

  const checkNow = useCallback(async () => {
    setUpdate({ phase: "checking" });
    const found = await look();
    setUpdate(typeof found === "string" ? { phase: found } : found);
  }, []);

  const relaunch = (version: string) => {
    call("restart_app").catch((e: unknown) => setUpdate({ phase: "failed", version, reason: describeError(e) }));
  };

  return { update, checkNow, relaunch, dismiss: () => setUpdate(null) };
}
