// The latest FM Lens release. The files stay on GitHub Releases in IamDejman/fm-lens-releases, the same place installed
// copies update from; this site only points at them, so a new release needs no change here. It asks GitHub which
// release is the latest, to name its version. GitHub answers one address only 60 times an hour, so when it does not
// answer, the site offers the latest downloads at the addresses that always lead to them, without a version.

const REPO = "https://github.com/IamDejman/fm-lens-releases/releases";
const RELEASES_PAGE = `${REPO}/latest`;
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

/**
 * A release's version and its downloads: the one with that version, or the latest without one. The version is null
 * and the downloads are the latest when GitHub does not answer.
 */
export async function release(version) {
  const asked = /^\d+\.\d+\.\d+$/.test(version ?? "") ? `${API}/tags/v${version}` : LATEST;
  try {
    const response = await fetch(asked, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      return { version: null, downloads: LATEST_DOWNLOADS };
    }
    const found = await response.json();
    return { version: found.tag_name.replace(/^v/, ""), downloads: downloadsOf(found) };
  } catch {
    return { version: null, downloads: LATEST_DOWNLOADS };
  }
}

/**
 * The ten latest releases, newest first, with their notes as GitHub renders them and their downloads, or null when
 * GitHub cannot be reached. The token is for scripts/build-site.mjs, which GitHub then answers more often; a browser
 * has none.
 */
export async function releaseNotes(token) {
  try {
    const headers = { Accept: "application/vnd.github.html+json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${API}?per_page=10`, { headers });
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

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 17h12"/></svg>';

/** Text, safe to put into HTML. */
function escaped(text) {
  return text.replace(/[&<>"]/g, (mark) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[mark]);
}

/**
 * The release notes page's list: each release's version, date, downloads and notes. scripts/build-site.mjs writes it
 * into the published page, so the notes are there without a script, and the page draws it again when GitHub has a
 * newer release than the page was published with. The date is the day in UTC, so both write the same.
 */
export function releaseNotesHtml(releases) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return releases
    .map((release) => {
      const version = escaped(release.version);
      // The download page starts this version's download.
      const files = [["mac", "Mac"], ["windows", "Windows"]]
        .filter(([computer]) => release.downloads[computer])
        .map(
          ([computer, name]) =>
            `<a class="button release-download" href="/download/?for=${computer}&amp;version=${version}" aria-label="Download FM Lens ${version} for ${name}">${DOWNLOAD_ICON}${name}</a>`,
        )
        .join("");
      return [
        "<article>",
        `<h2 id="v${version}">FM Lens ${version}</h2>`,
        `<p class="release-date">${date.format(new Date(release.published))}</p>`,
        files && `<div class="release-files">${files}</div>`,
        // GitHub renders and sanitizes the release text it sends as HTML.
        `<div class="release-body">${release.html}</div>`,
        "</article>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}
