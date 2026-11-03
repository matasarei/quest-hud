#!/usr/bin/env bash
# Loads the built page in headless Chrome and checks that the mod's band drew,
# with no script error, failed promise or CSP violation, which main.ts records
# as data-error. Build first: site/build.sh. CHROME names the browser.
set -euo pipefail
cd "$(dirname "$0")/../.."

chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
  for candidate in google-chrome chromium "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$candidate" >/dev/null 2>&1; then chrome="$candidate"; break; fi
  done
fi
if [ -z "$chrome" ]; then
  echo "smoke: no Chrome found; set CHROME" >&2
  exit 1
fi

port=$((8100 + RANDOM % 800))
profile="$(mktemp -d)"
python3 -m http.server --directory _site --bind 127.0.0.1 "$port" >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; rm -rf "$profile"' EXIT

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:$port/')" 2>/dev/null; then break; fi
  sleep 0.2
done

dom="$("$chrome" --headless=new --no-sandbox --disable-gpu --user-data-dir="$profile" \
  --virtual-time-budget=3000 --dump-dom "http://127.0.0.1:$port/" 2>/dev/null)"

if ! grep -q 'data-ready="yes"' <<<"$dom"; then
  echo "smoke: the page did not finish drawing" >&2
  exit 1
fi
if grep -q 'data-error=' <<<"$dom"; then
  echo "smoke: the page reported an error:" >&2
  grep -o 'data-error="[^"]*"' <<<"$dom" >&2
  exit 1
fi
if ! grep -q '♥ HP' <<<"$dom"; then
  echo "smoke: the band's HP bar is not on the page" >&2
  exit 1
fi
echo "smoke: ok"
