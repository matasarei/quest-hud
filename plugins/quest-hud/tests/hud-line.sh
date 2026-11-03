#!/usr/bin/env bash
# Feeds each status-line fixture to scripts/hud-line.sh and compares the line
# it prints with the .expected file beside it, an escape byte reading as @ so the
# files stay plain text; then checks the no-jq path.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../scripts/hud-line.sh"
failed=0

for json in "$here"/statusline/*.json; do
  name="$(basename "$json" .json)"
  got="$(bash "$script" < "$json" | tr '\033' '@')"
  want="$(cat "$here/statusline/$name.expected")"
  if [ "$got" = "$want" ]; then
    echo "ok   $name"
  else
    echo "FAIL $name: got '$got', want '$want'"
    failed=1
  fi
done

# With --all, the 5-hour window and the cost as well.
for json in "$here"/statusline/all/*.json; do
  name="$(basename "$json" .json)"
  got="$(bash "$script" --all < "$json" | tr '\033' '@')"
  want="$(cat "$here/statusline/all/$name.expected")"
  if [ "$got" = "$want" ]; then
    echo "ok   all/$name"
  else
    echo "FAIL all/$name: got '$got', want '$want'"
    failed=1
  fi
done

# No jq on PATH: one line saying so, and a zero exit, so the status line never errors.
got="$(PATH=/nonexistent /bin/bash "$script" < "$here/statusline/subscriber.json")"; code=$?
if [ "$got" = "quest-hud: needs jq" ] && [ "$code" -eq 0 ]; then
  echo "ok   no-jq"
else
  echo "FAIL no-jq: got '$got' (exit $code)"
  failed=1
fi

# Input that is not JSON: nothing printed, and a zero exit.
got="$(echo 'not json' | bash "$script")"; code=$?
if [ -z "$got" ] && [ "$code" -eq 0 ]; then
  echo "ok   not-json"
else
  echo "FAIL not-json: got '$got' (exit $code)"
  failed=1
fi

got="$(echo 'not json' | bash "$script" --all)"; code=$?
if [ -z "$got" ] && [ "$code" -eq 0 ]; then
  echo "ok   not-json --all"
else
  echo "FAIL not-json --all: got '$got' (exit $code)"
  failed=1
fi

exit "$failed"
