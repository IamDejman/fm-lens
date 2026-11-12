#!/usr/bin/env bash
# Makes the release of FM Lens for the version in app/src-tauri/tauri.conf.json, from a Mac, and writes its files to
# target/release-files/<version>/:
# - macOS: builds the universal app here, with the disk image and zip people download and the .app.tar.gz installed
#   copies update from.
# - Windows: takes the installer the Windows job of .github/workflows/validate.yml built from this same commit, which
#   people download and installed copies update from.
# It signs both updates with the updater key and writes latest.json, which tells installed copies they are there. The
# two downloads are there twice: with the version in their names, and without it for the site's links to the latest.
#
# Usage: scripts/release.sh [--publish]
# --publish needs a clean checkout of origin/main. It tags the commit v<version> in IamDejman/fm-lens and uploads those
# files as the latest release of the public repository IamDejman/fm-lens-releases, with docs/release-notes.md as its
# text. Copies of FM Lens then install it when they next open. GitHub shows every line break in release text, so each
# paragraph and list item of that file is one line.
#
# The updater key is ~/.tauri/fm-lens-updater.key, or the file FM_LENS_UPDATER_KEY names; its public half is in
# tauri.conf.json. Without it no installed copy accepts the update: keep a backup of it. Needs gh, signed in, and pipx for
# the disk image.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SOURCE=IamDejman/fm-lens
REPO=IamDejman/fm-lens-releases
KEY=${FM_LENS_UPDATER_KEY:-$HOME/.tauri/fm-lens-updater.key}
PUBLISH=false
while [ $# -gt 0 ]; do
  case "$1" in
    --publish) PUBLISH=true; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f "$KEY" ] || { echo "No updater key at $KEY" >&2; exit 2; }
if $PUBLISH && perl -0ne 'exit !/\S\n(?:[ \t]+\S|(?![-*+] |\d+\. |#|>|\|)\S)/' "$ROOT/docs/release-notes.md"; then
  echo "docs/release-notes.md splits a paragraph or list item over lines, which GitHub would show as breaks." >&2
  echo "Put each paragraph and list item on one line." >&2
  exit 2
fi
SHA=$(git -C "$ROOT" rev-parse HEAD)
if $PUBLISH; then
  git -C "$ROOT" fetch --quiet origin main
  [ "$SHA" = "$(git -C "$ROOT" rev-parse origin/main)" ] || { echo "Publish from origin/main: HEAD is not it." >&2; exit 2; }
  git -C "$ROOT" diff --quiet HEAD || { echo "Publish from a clean checkout: there are changes to tracked files." >&2; exit 2; }
fi
VERSION=$(node -p "require('$ROOT/app/src-tauri/tauri.conf.json').version")
MAC="FM-Lens-$VERSION-macos-universal"
WINDOWS="FM-Lens-$VERSION-windows-x64-setup.exe"
BUNDLE="$ROOT/target/universal-apple-darwin/release/bundle/macos"
OUT="$ROOT/target/release-files/$VERSION"
SIGN_ENV=(TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}")

rm -rf "$OUT"
mkdir -p "$OUT"

# Windows first, as it only waits on GitHub: the installer CI built from this commit. The key never goes to GitHub, so
# the update is signed here.
RUN=$(gh run list --repo "$SOURCE" --workflow validate.yml --commit "$SHA" --status success --limit 1 \
  --json databaseId --jq '.[0].databaseId // empty')
[ -n "$RUN" ] || { echo "No passing Validate run for $SHA yet: push it, let the run finish, then try again." >&2; exit 2; }
DOWNLOAD=$(mktemp -d)
gh run download "$RUN" --repo "$SOURCE" --name fm-lens-windows-installer --dir "$DOWNLOAD"
SETUP="$DOWNLOAD/FM Lens_${VERSION}_x64-setup.exe"
[ -f "$SETUP" ] || { echo "Run $RUN has no Windows installer of FM Lens $VERSION:" >&2; ls "$DOWNLOAD" >&2; exit 2; }
cp "$SETUP" "$OUT/$WINDOWS"
rm -r "$DOWNLOAD"
env "${SIGN_ENV[@]}" "$ROOT/app/node_modules/.bin/tauri" signer sign --app-version "$VERSION" "$OUT/$WINDOWS" >/dev/null

# Tauri signs the macOS update with the key while it bundles the app.
env "${SIGN_ENV[@]}" npm --prefix "$ROOT/app" run release:mac
cp "$BUNDLE/FM Lens.app.tar.gz" "$OUT/$MAC.app.tar.gz"
ditto -c -k --keepParent "$BUNDLE/FM Lens.app" "$OUT/$MAC.zip"
# The disk image window: the app, an arrow and Applications on the background in scripts/dmg/. dmgbuild writes its
# layout without opening Finder; pipx fetches it the first time.
pipx run --spec dmgbuild==1.6.7 dmgbuild -s "$ROOT/scripts/dmg/settings.py" -D app="$BUNDLE/FM Lens.app" \
  -D background="$ROOT/scripts/dmg/background.png" "FM Lens" "$OUT/$MAC.dmg"
# The built app is in the disk image now: remove it, or this Mac offers a second FM Lens beside the installed one.
rm -r "$BUNDLE/FM Lens.app"

# One universal app serves both kinds of Mac.
DOWNLOADS="https://github.com/$REPO/releases/download/v$VERSION"
VERSION="$VERSION" \
  MAC_URL="$DOWNLOADS/$MAC.app.tar.gz" MAC_SIGNATURE="$(cat "$BUNDLE/FM Lens.app.tar.gz.sig")" \
  WINDOWS_URL="$DOWNLOADS/$WINDOWS" WINDOWS_SIGNATURE="$(cat "$OUT/$WINDOWS.sig")" node -e '
  const { VERSION, MAC_URL, MAC_SIGNATURE, WINDOWS_URL, WINDOWS_SIGNATURE } = process.env;
  const mac = { signature: MAC_SIGNATURE, url: MAC_URL };
  const latest = {
    version: VERSION,
    notes: `FM Lens ${VERSION}`,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: {
      "darwin-aarch64": mac,
      "darwin-x86_64": mac,
      "windows-x86_64": { signature: WINDOWS_SIGNATURE, url: WINDOWS_URL },
    },
  };
  process.stdout.write(JSON.stringify(latest, null, 2) + "\n");
' > "$OUT/latest.json"
rm "$OUT/$WINDOWS.sig"

# The downloads again under names without the version, which releases/latest/download/<name> always leads to, so the
# site can offer the latest release without asking GitHub which one it is.
MAC_LATEST="FM-Lens-macos-universal.dmg"
WINDOWS_LATEST="FM-Lens-windows-x64-setup.exe"
cp "$OUT/$MAC.dmg" "$OUT/$MAC_LATEST"
cp "$OUT/$WINDOWS" "$OUT/$WINDOWS_LATEST"

echo "Release files in $OUT:"
ls -1 "$OUT"

if $PUBLISH; then
  if ! git -C "$ROOT" rev-parse --quiet --verify "refs/tags/v$VERSION" >/dev/null; then
    git -C "$ROOT" tag -a "v$VERSION" -m "FM Lens $VERSION" "$SHA"
  fi
  git -C "$ROOT" push --quiet origin "refs/tags/v$VERSION"
  gh repo view "$REPO" >/dev/null 2>&1 ||
    gh repo create "$REPO" --public --add-readme \
      --description "Releases of FM Lens, the Football Manager 27 companion for macOS and Windows"
  gh release create "v$VERSION" --repo "$REPO" --latest --title "FM Lens $VERSION" \
    --notes-file "$ROOT/docs/release-notes.md" \
    "$OUT/$MAC.dmg" "$OUT/$MAC.zip" "$OUT/$MAC.app.tar.gz" "$OUT/$WINDOWS" "$OUT/latest.json" \
    "$OUT/$MAC_LATEST" "$OUT/$WINDOWS_LATEST"
  # The site's release notes are written in when it is published (scripts/build-site.mjs), so publish it again with
  # this release. Until it is, the release notes page fetches this release's notes in the browser.
  gh workflow run site.yml --repo IamDejman/fm-lens --ref main ||
    echo "The site was not published again. Run: gh workflow run site.yml --repo IamDejman/fm-lens --ref main" >&2
fi
