#!/usr/bin/env bash
set -euo pipefail

if ! command -v context-mode &>/dev/null; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/ctx-eca-adapter.mjs" posttooluse
