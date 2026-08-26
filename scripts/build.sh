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
  404.html
  style.css
  i18n.js
  js
  vendor
  learnora.jpg
  study-planner-imageandlogo.jpg
  public.css
  about.html
  contact.html
  privacy.html
  developers.html
  llms.txt
  openapi.json
  sitemap.xml
  robots.txt
  .well-known
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

echo "==> Optimizing CSS assets"
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif command -v npx >/dev/null 2>&1; then
  NODE_BIN="npx node"
fi

if [[ -n "$NODE_BIN" ]] && [[ -f "$OUT/style.css" ]]; then
  $NODE_BIN -e '
    const fs = require("fs");
    const file = process.argv[1];
    try {
      const src = fs.readFileSync(file, "utf8");
      const min = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .replace(/\s*([{};:,>])\s*/g, "$1")
        .replace(/;}/g, "}")
        .trim();
      fs.writeFileSync(file, min, "utf8");
      const saved = ((1 - min.length / src.length) * 100).toFixed(1);
      console.log(`    Optimized style.css: ${src.length} -> ${min.length} bytes (${saved}% reduction)`);
    } catch (err) {
      console.warn("    Warning: CSS minification skipped:", err.message);
    }
  ' "$OUT/style.css" || echo "    Notice: CSS optimization step bypassed."
else
  echo "    Notice: Node/npx not available or style.css missing; skipping CSS minification."
fi

echo "==> Building the React app"
npm --prefix "$ROOT/webapp" ci
npm --prefix "$ROOT/webapp" run build

if [[ ! -f "$ROOT/webapp/dist/index.html" ]]; then
  echo "ERROR: React build completed without webapp/dist/index.html." >&2
  exit 1
fi

echo "==> Placing the React app at /app"
mv "$ROOT/webapp/dist" "$OUT/app"

echo "==> Done. dist/ contains:"
ls -1 "$OUT"
