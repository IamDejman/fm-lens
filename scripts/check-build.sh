#!/usr/bin/env bash
# Checks a Football Manager build after an update, without writing to the game: which build is running, whether FM
# Lens has a profile for it, what the pre-write checks find, whether scanning finds the arrays where the profile says,
# and whether each reader still decodes a known player, member of staff, club, nation, official and team.
#
# Usage: scripts/check-build.sh [--probe PATH] [--pid PID] [--out DIR]
# Needs a career loaded in FM. Writes the probe's output under reports/build-check/ (ignored by git) and a summary.md.
# Exit status: 0 when every step passes, 1 when one fails, 2 when the probe or the game cannot be found.
#
# The known entities are in the FM27 database of every save; change them with PLAYER, STAFF, CLUB, NATION, OFFICIAL.
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PROBE=""
PID_ARGS=()
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --probe) PROBE=$2; shift 2 ;;
    --pid) PID_ARGS=(--pid "$2"); shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$PROBE" ]; then
  for candidate in "$ROOT/target/release/fmlens-probe" "$ROOT/target/debug/fmlens-probe"; do
    if [ -x "$candidate" ]; then PROBE=$candidate; break; fi
  done
fi
if [ -z "$PROBE" ] || [ ! -x "$PROBE" ]; then
  echo "No probe found. Build it: cargo build -p fmlens-probe" >&2
  exit 2
fi

PLAYER=${PLAYER:-28122642}   # Bukayo Saka
STAFF=${STAFF:-48030808}     # Nicolas Jover
CLUB=${CLUB:-602}            # Arsenal
NATION=${NATION:-765}        # England
OFFICIAL=${OFFICIAL:-Oliver} # Michael Oliver

if ! "$PROBE" info ${PID_ARGS[@]+"${PID_ARGS[@]}"} >/dev/null 2>&1; then
  echo "The probe cannot read the game. Start FM, load a career, and try again." >&2
  exit 2
fi

UUID=$("$PROBE" info ${PID_ARGS[@]+"${PID_ARGS[@]}"} 2>/dev/null | awk '/^  UUID/ {print $2; exit}')
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=${OUT:-"$ROOT/reports/build-check/${UUID:-unknown}-$STAMP"}
mkdir -p "$OUT"
SUMMARY="$OUT/summary.md"
FAILED=0

{
  echo "# Build check $STAMP"
  echo
  echo "- Probe: $("$PROBE" --version 2>/dev/null)"
  echo "- game_plugin UUID: ${UUID:-unknown}"
  echo
  echo "| Step | Result | Time | Output |"
  echo "| --- | --- | --- | --- |"
} > "$SUMMARY"

# step NAME CHECK ARGS...: runs the probe, keeps its output in NAME.txt, and judges it with CHECK (a function that
# reads the file and returns 0 for a pass).
step() {
  local name=$1 check=$2
  shift 2
  local file="$OUT/$name.txt" started result
  started=$(date +%s)
  "$PROBE" "$@" ${PID_ARGS[@]+"${PID_ARGS[@]}"} > "$file" 2>&1
  local status=$?
  if [ $status -eq 0 ] && $check "$file"; then
    result=pass
  else
    result=FAIL
    FAILED=1
  fi
  printf '| %s | %s | %ss | %s.txt |\n' "$name" "$result" "$(( $(date +%s) - started ))" "$name" >> "$SUMMARY"
  printf '%-12s %s\n' "$name" "$result"
}

ok() { true; }
has_profile() { ! grep -q "^Build profile: none" "$1"; }
checks_pass() { grep -q "^Checks" "$1" && ! grep -q "^  FAIL" "$1"; }
arrays_found() { [ "$(grep -c "elements" "$1")" -ge 3 ]; }

step info ok info
step profile has_profile calibrate
step health checks_pass health
step scan arrays_found calibrate --scan
step player ok player "$PLAYER"
step staff ok staff-member "$STAFF"
step club ok club "$CLUB"
step teams ok teams "$CLUB"
step nation ok nation "$NATION"
step officials ok officials "$OFFICIAL"
step cohesion ok cohesion "$CLUB"
step fields-player ok fields --stats player
step fields-staff ok fields --stats staff
step fields-club ok fields --stats club

# The arrays scanning finds should be the ones the profile names.
profile_arrays=$(grep "game_plugin+" "$OUT/profile.txt" | awk '{print $1, $2, $3}')
scan_arrays=$(grep "game_plugin+" "$OUT/scan.txt" | awk '{print $1, $2, $3}')
if [ -n "$profile_arrays" ] && [ "$profile_arrays" = "$scan_arrays" ]; then
  arrays=pass
else
  arrays=FAIL
  FAILED=1
fi
printf '| arrays match | %s | - | profile.txt, scan.txt |\n' "$arrays" >> "$SUMMARY"
printf '%-12s %s\n' "arrays" "$arrays"

{
  echo
  if [ $FAILED -eq 0 ]; then
    echo "Every step passed. Next: the write checks on a copy of a career (docs/PATCH-VALIDATION.md, step 4)."
  else
    echo "A step failed. Keep FM Lens read-only on this build and follow docs/PATCH-VALIDATION.md, step 3."
  fi
} >> "$SUMMARY"

echo "Summary: $SUMMARY"
exit $FAILED
