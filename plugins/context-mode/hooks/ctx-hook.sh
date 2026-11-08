#!/usr/bin/env bash
# context-mode hook entry for ECA.
#
# ECA runs this for every registered context-mode hook. It resolves the
# context-mode binary (npm global or mise) and hands the ECA event to
# ctx-eca-adapter.mjs, which does the ECA <-> context-mode translation.
# A missing context-mode or node is a no-op, never a hook error.
set -Eeuo pipefail
shopt -s inherit_errexit

# ── 1. Resolve the context-mode binary ──────────────────────────────
CM_BIN=""
if command -v context-mode >/dev/null 2>&1; then
  CM_BIN="$(command -v context-mode)"
fi
if command -v mise >/dev/null 2>&1; then
  MISE_BIN="$(mise which context-mode 2>/dev/null || true)"
  if [[ -n "$MISE_BIN" ]]; then
    CM_BIN="$MISE_BIN"
  fi
fi

# context-mode not installed: nothing to bridge
if [[ -z "$CM_BIN" ]]; then
  exit 0
fi

# node is what actually runs context-mode; without it, stay silent
if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

# ── 2. Hand off to the adapter ──────────────────────────────────────
SCRIPT_PATH="$(realpath "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

export CONTEXT_MODE_BIN="$CM_BIN"
exec node "$SCRIPT_DIR/ctx-eca-adapter.mjs" "$@"
