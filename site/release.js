// The latest FM Lens release. The files stay on GitHub Releases in IamDejman/fm-lens-releases, the same place installed
// copies update from; this site only points at them, so a new release needs no change here.

export const RELEASES_PAGE = "https://github.com/IamDejman/fm-lens-releases/releases/latest";
const API = "https://api.github.com/repos/IamDejman/fm-lens-releases/releases";
const LATEST = `${API}/latest`;

/** The latest release's version and its disk image, or null when GitHub cannot be reached. */
export async function latestRelease() {
  try {
    const response = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      return null;
    }
    const release = await response.json();
    const dmg = release.assets.find((asset) => asset.name.endsWith(".dmg"));
    if (!dmg) {
      return null;
    }
    return { version: release.tag_name.replace(/^v/, ""), url: dmg.browser_download_url };
  } catch {
    return null;
  }
}

/**
 * The ten latest releases, newest first, with their notes as GitHub renders them and their disk image (null when it has
 * none), or null when GitHub cannot be reached.
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
        download: release.assets.find((asset) => asset.name.endsWith(".dmg"))?.browser_download_url ?? null,
      }));
  } catch {
    return null;
  }
}
