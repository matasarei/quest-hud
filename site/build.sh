#!/usr/bin/env bash
# Builds the live preview into _site/: the mod's own src/ and layouts, bundled
# for a browser. The mod itself has no build; this is the page's alone.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf _site
mkdir -p _site
npx -y esbuild@0.25.12 site/src/main.ts --bundle --platform=browser --format=iife --target=es2022 --minify \
  --jsx=transform --jsx-factory=h --jsx-fragment=Fragment --outfile=_site/preview.js --log-level=warning
cp site/index.html site/style.css _site/
