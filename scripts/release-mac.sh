#!/usr/bin/env bash
# Builds the universal macOS app for the version in app/src-tauri/tauri.conf.json, signs its update with the updater key,
# and writes the release's files to target/release-mac/<version>/: the disk image and zip people download, the
# .app.tar.gz installed copies update from, and latest.json, which tells them it is there.
#
# Usage: scripts/release-mac.sh [--publish]
# --publish uploads those files as the latest release of the public repository IamDejman/fm-lens-releases (made the
# first time), with docs/release-notes.md as its text. Copies of FM Lens then install it when they next open.
#
# The updater key is ~/.tauri/fm-lens-updater.key, or the file FM_LENS_UPDATER_KEY names; its public half is in
# tauri.conf.json. Without it no installed copy accepts the update: keep a backup of it.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO=IamDejman/fm-lens-releases
KEY=${FM_LENS_UPDATER_KEY:-$HOME/.tauri/fm-lens-updater.key}
PUBLISH=false
while [ $# -gt 0 ]; do
  case "$1" in
    --publish) PUBLISH=true; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f "$KEY" ] || { echo "No updater key at $KEY" >&2; exit 2; }
VERSION=$(node -p "require('$ROOT/app/src-tauri/tauri.conf.json').version")
NAME="FM-Lens-$VERSION-macos-universal"
BUNDLE="$ROOT/target/universal-apple-darwin/release/bundle/macos"
OUT="$ROOT/target/release-mac/$VERSION"

# Tauri signs the update with this key while it bundles the app.
TAURI_SIGNING_PRIVATE_KEY=$(cat "$KEY") \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-} \
  npm --prefix "$ROOT/app" run release:mac

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$BUNDLE/FM Lens.app.tar.gz" "$OUT/$NAME.app.tar.gz"
ditto -c -k --keepParent "$BUNDLE/FM Lens.app" "$OUT/$NAME.zip"
STAGE=$(mktemp -d)
ditto "$BUNDLE/FM Lens.app" "$STAGE/FM Lens.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "FM Lens" -srcfolder "$STAGE" -ov -format UDZO "$OUT/$NAME.dmg"
rm -rf "$STAGE"

# One universal app serves both kinds of Mac.
URL="https://github.com/$REPO/releases/download/v$VERSION/$NAME.app.tar.gz"
SIGNATURE=$(cat "$BUNDLE/FM Lens.app.tar.gz.sig")
VERSION="$VERSION" URL="$URL" SIGNATURE="$SIGNATURE" node -e '
  const { VERSION, URL, SIGNATURE } = process.env;
  const platform = { signature: SIGNATURE, url: URL };
  const latest = {
    version: VERSION,
    notes: `FM Lens ${VERSION}`,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform },
  };
  process.stdout.write(JSON.stringify(latest, null, 2) + "\n");
' > "$OUT/latest.json"

echo "Release files in $OUT:"
ls -1 "$OUT"

if $PUBLISH; then
  gh repo view "$REPO" >/dev/null 2>&1 ||
    gh repo create "$REPO" --public --add-readme --description "Releases of FM Lens, the Football Manager 27 companion for macOS"
  gh release create "v$VERSION" --repo "$REPO" --latest --title "FM Lens $VERSION" \
    --notes-file "$ROOT/docs/release-notes.md" \
    "$OUT/$NAME.dmg" "$OUT/$NAME.zip" "$OUT/$NAME.app.tar.gz" "$OUT/latest.json"
fi
