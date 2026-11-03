#!/usr/bin/env bash
# The page's own tests. src/ imports have no file extensions, so they are bundled
# before node runs them, into a folder that goes away afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

npx -y esbuild@0.25.12 site/tests/*.test.ts --bundle --platform=node --format=esm --target=node22 \
  --jsx=transform --jsx-factory=h --jsx-fragment=Fragment --out-extension:.js=.mjs --outdir="$out" --log-level=warning
node --test "$out"/*.mjs
