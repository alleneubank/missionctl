#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(node -e 'process.stdout.write(require("./package.json").version)')"
asset="missionctl-${version}.tar.gz"

node scripts/build.mjs
mkdir -p dist/release
tar -C dist -czf "dist/release/$asset" missionctl

if command -v sha256sum >/dev/null 2>&1; then
    (cd dist/release && sha256sum "$asset" >"$asset.sha256")
else
    (cd dist/release && shasum -a 256 "$asset" >"$asset.sha256")
fi
