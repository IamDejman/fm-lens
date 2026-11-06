// Keeping FM Lens up to date. When the window opens, and every four hours while it stays open until a newer version
// turns up, the app reads `latest.json` from the latest release in the public releases repository (the updater's
// endpoint in tauri.conf.json). When that names a newer version, the macOS app installs
// it in the background, without asking: it downloads it, checks its signature against the key the app was built with and
// puts it in place of this one, which keeps running. The colophon then offers Relaunch to update; otherwise the new
// version runs the next time FM Lens opens. A copy that cannot replace itself (one macOS runs from where it was
// downloaded, or a development build) names the new version and opens its release page instead. Offline, or when the
// check fails, nothing happens and the app works as before.

import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";
import { call, inTauri } from "./api";
import { describeError } from "./format";

/** Where the releases are; the only pages the app opens (see capabilities/default.json). */
const RELEASES_PAGE = "https://github.com/IamDejman/fm-lens-releases/releases";
const LATEST_RELEASE_PAGE = `${RELEASES_PAGE}/latest`;

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
  | { phase: "failed"; version: string; reason: string };

/** Opens the release notes of `version`, on its release's page. */
export function openRelease(version: string): void {
  openUrl(`${RELEASES_PAGE}/tag/v${version}`).catch(() => {
    // Nothing to fall back on: the notice stays, and its text says what the version brought.
  });
}

/** Opens the latest release's page in the browser. */
export function openLatestRelease(): void {
  void openUrl(LATEST_RELEASE_PAGE);
}

/** Whether this copy can replace itself (see `can_self_update`): the macOS app, unless macOS runs it from a download. */
const canSelfUpdate = (): Promise<boolean> => call<boolean>("can_self_update");

/** Whether the checks have started in this window: once, however often the hook mounts. */
let checking = false;

/**
 * Looks for a newer version when the window opens, and again every four hours until one turns up, and installs it in
 * the background where this copy can.
 * `update` is what to tell the user, null while there is nothing to tell; `relaunch` starts the installed version;
 * `dismiss` hides a notice the user cannot act on now.
 */
export function useUpdate() {
  const [update, setUpdate] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!inTauri || checking) {
      return;
    }
    checking = true;
    const look = async () => {
      // Offline, or no release yet: the app carries on as it is, and looks again later.
      const found = await check({ timeout: CHECK_TIMEOUT_MS }).catch(() => null);
      if (found === null) {
        setTimeout(() => void look(), RECHECK_MS);
        return;
      }
      const { version } = found;
      if (!(await canSelfUpdate().catch(() => false))) {
        setUpdate({ phase: "available", version });
        return;
      }
      try {
        await found.downloadAndInstall(undefined, { timeout: DOWNLOAD_TIMEOUT_MS });
        setUpdate({ phase: "ready", version });
      } catch (e) {
        setUpdate({ phase: "failed", version, reason: describeError(e) });
      }
    };
    void look();
  }, []);

  const relaunch = (version: string) => {
    call("restart_app").catch((e: unknown) => setUpdate({ phase: "failed", version, reason: describeError(e) }));
  };

  return { update, relaunch, dismiss: () => setUpdate(null) };
}
