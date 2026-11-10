// The latest FM Lens release. The files stay on GitHub Releases in IamDejman/fm-lens-releases, the same place installed
// copies update from; this site only points at them, so a new release needs no change here. It asks GitHub which
// release is the latest, to name its version. GitHub answers one address only 60 times an hour, so when it does not
// answer, the site offers the latest downloads at the addresses that always lead to them, without a version.

const REPO = "https://github.com/IamDejman/fm-lens-releases/releases";
export const RELEASES_PAGE = `${REPO}/latest`;
const API = "https://api.github.com/repos/IamDejman/fm-lens-releases/releases";
const LATEST = `${API}/latest`;

/** The latest release's downloads, by the names every release also carries them under (scripts/release.sh). */
const LATEST_DOWNLOADS = {
  mac: `${RELEASES_PAGE}/download/FM-Lens-macos-universal.dmg`,
  windows: `${RELEASES_PAGE}/download/FM-Lens-windows-x64-setup.exe`,
};

/** The computer this page runs on: "windows", or "mac" for anything else, which gets the Mac download as before. */
export function thisComputer() {
  return /Windows/i.test(navigator.userAgentData?.platform ?? navigator.userAgent) ? "windows" : "mac";
}

/** A release's downloads: the Mac disk image and the Windows installer, each null when the release has none. */
function downloadsOf(release) {
  const url = (ending) => release.assets.find((asset) => asset.name.endsWith(ending))?.browser_download_url ?? null;
  return { mac: url(".dmg"), windows: url("-setup.exe") };
}

/** The latest release's version and its downloads. The version is null when GitHub does not answer. */
export async function latestRelease() {
  try {
    const response = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      return { version: null, downloads: LATEST_DOWNLOADS };
    }
    const release = await response.json();
    return { version: release.tag_name.replace(/^v/, ""), downloads: downloadsOf(release) };
  } catch {
    return { version: null, downloads: LATEST_DOWNLOADS };
  }
}

/**
 * The ten latest releases, newest first, with their notes as GitHub renders them and their downloads, or null when
 * GitHub cannot be reached.
 */
export async function releaseNotes() {
  try {
    const response = await fetch(`${API}?per_page=10`, { headers: { Accept: "application/vnd.github.html+json" } });
    if (!response.ok) {
      return null;
    }
    const releases = await response.json();
    return releases
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => ({
        version: release.tag_name.replace(/^v/, ""),
        published: release.published_at,
        html: release.body_html ?? "",
        downloads: downloadsOf(release),
      }));
  } catch {
    return null;
  }
}
