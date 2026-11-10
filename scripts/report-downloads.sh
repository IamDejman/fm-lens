#!/usr/bin/env bash
# Sends PostHog the download counts of FM Lens, as one `release_downloads` event, so the "FM Lens growth" dashboard
# shows downloads next to installs. GitHub keeps a running count for each file of each release in
# IamDejman/fm-lens-releases; the event carries the totals over all releases:
# - mac_downloads: the disk images and zips people download;
# - windows_downloads: the Windows installers, which installed copies on Windows also download to update;
# - mac_updates: the .app.tar.gz files installed copies on macOS update from;
# - update_checks: latest.json, which every copy reads when it opens, to look for an update.
# .github/workflows/downloads.yml runs it every hour.
#
# Usage: scripts/report-downloads.sh [--dry-run]
# --dry-run prints the event instead of sending it.
set -euo pipefail

# The project's public key, the one the app and the site send with: it can only add events.
POSTHOG_KEY="phc_xoND6FWuBkhD46EWt7tr89NnoUQ5yQoHm2QDMrVCjU2q"
CAPTURE_URL="https://us.i.posthog.com/i/v0/e/"

# Releases come newest first.
event=$(gh api --paginate repos/IamDejman/fm-lens-releases/releases --jq '.[]' | jq -s --arg key "$POSTHOG_KEY" '
  def total(pattern): [.[].assets[] | select(.name | test(pattern)) | .download_count] | add // 0;
  {
    api_key: $key,
    event: "release_downloads",
    distinct_id: "github-releases",
    timestamp: (now | todate),
    properties: {
      mac_downloads: total("\\.(dmg|zip)$"),
      windows_downloads: total("-setup\\.exe$"),
      mac_updates: total("\\.app\\.tar\\.gz$"),
      update_checks: total("^latest\\.json$"),
      latest_version: (first(.[] | .tag_name) // null),
      "$process_person_profile": false,
      "$geoip_disable": true
    }
  }')

if [[ "${1:-}" == "--dry-run" ]]; then
  jq 'del(.api_key)' <<<"$event"
  exit 0
fi
curl --fail --silent --show-error --max-time 30 -X POST -H "Content-Type: application/json" --data "$event" \
  "$CAPTURE_URL" >/dev/null
jq -c '.properties | {mac_downloads, windows_downloads, mac_updates, update_checks, latest_version}' <<<"$event"
