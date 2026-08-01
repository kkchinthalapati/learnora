#!/usr/bin/env bash
#
# Deploy build: assembles ./dist as the single directory Vercel serves.
#
# The two apps run side by side during the migration, so the output is the
# vanilla app at the root plus the React app under /app:
#
#   dist/            index.html, style.css, js/, vendor/, …   (vanilla)
#   dist/app/        index.html, assets/…                     (React)
#
# Why an explicit copy list rather than serving the repo root directly:
# `outputDirectory: "."` would publish whatever is in the working tree after
# the build, which by then includes webapp/node_modules and webapp/src. That is
# tens of thousands of files Vercel does not need and source that has no reason
# to be public. Listing what ships keeps both out.
#
# Adding a file to the vanilla app means adding it here. That is the cost of
# the explicit list, and it is the reason this script fails loudly on a missing
# path instead of silently shipping an incomplete site.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"

echo "==> Cleaning $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# Everything the vanilla app serves. Checked against index.html's asset
# references plus the standalone pages.
VANILLA_PATHS=(
  index.html
  style.css
  i18n.js
  js
  vendor
  learnora.jpg
  study-planner-imageandlogo.jpg
  terms.html
  verify.html
  verify.js
  reset-password.html
  reset-password.js
)

echo "==> Copying the vanilla app"
for path in "${VANILLA_PATHS[@]}"; do
  if [[ ! -e "$ROOT/$path" ]]; then
    echo "ERROR: $path is listed in scripts/build.sh but does not exist." >&2
    echo "       Remove it from VANILLA_PATHS, or restore the file." >&2
    exit 1
  fi
  cp -R "$ROOT/$path" "$OUT/"
done

echo "==> Building the React app"
npm --prefix "$ROOT/webapp" ci
npm --prefix "$ROOT/webapp" run build

echo "==> Placing the React app at /app"
mv "$ROOT/webapp/dist" "$OUT/app"

echo "==> Done. dist/ contains:"
ls -1 "$OUT"
