// The latest FM Lens release. The files stay on GitHub Releases in IamDejman/fm-lens-releases, the same place installed
// copies update from; this site only points at them. It asks GitHub which release is the latest, and GitHub answers an
// address only 60 times an hour, so when it does not answer the site offers the release named here.

/** The release offered when GitHub does not answer. Set with the app's version (docs/DEVELOPING.md, Releasing). */
export const VERSION = "0.7.1";

const REPO = "https://github.com/IamDejman/fm-lens-releases/releases";
export const RELEASES_PAGE = `${REPO}/latest`;
const API = "https://api.github.com/repos/IamDejman/fm-lens-releases/releases";
const LATEST = `${API}/latest`;

/** The release named here, with its downloads where every release keeps them. */
function knownRelease() {
  const file = (ending) => `${REPO}/download/v${VERSION}/FM-Lens-${VERSION}-${ending}`;
  return { version: VERSION, downloads: { mac: file("macos-universal.dmg"), windows: file("windows-x64-setup.exe") } };
}

/** The computer this page runs on: "windows", or "mac" for anything else, which gets the Mac download as before. */
export function thisComputer() {
  return /Windows/i.test(navigator.userAgentData?.platform ?? navigator.userAgent) ? "windows" : "mac";
}

/** A release's downloads: the Mac disk image and the Windows installer, each null when the release has none. */
function downloadsOf(release) {
  const url = (ending) => release.assets.find((asset) => asset.name.endsWith(ending))?.browser_download_url ?? null;
  return { mac: url(".dmg"), windows: url("-setup.exe") };
}

/** The latest release's version and its downloads, or the release named here when GitHub does not answer. */
export async function latestRelease() {
  try {
    const response = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      return knownRelease();
    }
    const release = await response.json();
    return { version: release.tag_name.replace(/^v/, ""), downloads: downloadsOf(release) };
  } catch {
    return knownRelease();
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
