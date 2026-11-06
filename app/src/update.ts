// Keeping FM Lens up to date. When the window opens, the app reads `latest.json` from the latest release in the public
// releases repository (the updater's endpoint in tauri.conf.json). When that names a newer version, the macOS app installs
// it at once, without asking: it downloads it, checks its signature against the key the app was built with, puts it in
// place of this one and starts again. A copy that cannot replace itself (one macOS runs from where it was downloaded, or
// a development build) names the new version and opens its release page instead. Offline, or when the check fails,
// nothing happens and the app works as before.

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

/** How far installing an update has got. */
export type InstallProgress =
  | { phase: "preparing" }
  /** `percent` is null while the size of the download is not known. */
  | { phase: "downloading"; percent: number | null }
  | { phase: "installing" };

/** A newer version, and what the app is doing about it. */
export type UpdateState =
  | { phase: "installing"; version: string; progress: InstallProgress }
  /** This copy cannot replace itself: the user downloads the new version. */
  | { phase: "available"; version: string }
  | { phase: "failed"; version: string; reason: string };

/** Opens the latest release's page in the browser. */
/** Opens the release notes of `version`, on its release's page. */
export function openRelease(version: string): void {
  openUrl(`${RELEASES_PAGE}/tag/v${version}`).catch(() => {
    // Nothing to fall back on: the notice stays, and its text says what the version brought.
  });
}

export function openLatestRelease(): void {
  void openUrl(LATEST_RELEASE_PAGE);
}

/** Whether this copy can replace itself (see `can_self_update`): the macOS app, unless macOS runs it from a download. */
const canSelfUpdate = (): Promise<boolean> => call<boolean>("can_self_update");

/** Whether the check has run in this window: once, however often the hook mounts. */
let checked = false;

/**
 * Looks for a newer version once when the window opens and installs it at once where this copy can. `update` is what
 * to tell the user, null while there is nothing to tell; `dismiss` hides a notice the user cannot act on now.
 */
export function useUpdate() {
  const [update, setUpdate] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!inTauri || checked) {
      return;
    }
    checked = true;
    void (async () => {
      let found;
      try {
        found = await check({ timeout: CHECK_TIMEOUT_MS });
      } catch {
        // Offline, or no release yet: the app carries on as it is.
        return;
      }
      if (found === null) {
        return;
      }
      const { version } = found;
      if (!(await canSelfUpdate().catch(() => false))) {
        setUpdate({ phase: "available", version });
        return;
      }
      const progress = (next: InstallProgress) => setUpdate({ phase: "installing", version, progress: next });
      progress({ phase: "preparing" });
      let total: number | null = null;
      let done = 0;
      try {
        await found.downloadAndInstall(
          (event) => {
            switch (event.event) {
              case "Started":
                total = event.data.contentLength ?? null;
                progress({ phase: "downloading", percent: total ? 0 : null });
                break;
              case "Progress":
                done += event.data.chunkLength;
                progress({ phase: "downloading", percent: total ? Math.min(100, Math.floor((done * 100) / total)) : null });
                break;
              case "Finished":
                progress({ phase: "installing" });
                break;
            }
          },
          { timeout: DOWNLOAD_TIMEOUT_MS },
        );
        await call("restart_app");
      } catch (e) {
        setUpdate({ phase: "failed", version, reason: describeError(e) });
      }
    })();
  }, []);

  return { update, dismiss: () => setUpdate(null) };
}
