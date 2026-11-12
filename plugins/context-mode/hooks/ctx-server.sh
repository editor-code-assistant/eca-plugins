#!/usr/bin/env bash
# Starts the context-mode MCP server for ECA.
#
# v2 ships server.mjs (which needs --agent); v1 ships start.mjs. This
# wrapper picks the entry that matches the installed package, so the
# plugin works before and after the context-mode v2 upgrade.
#
# ECA spawns the server with the first workspace root as the working
# directory, which is what the server resolves the project from.
#
# CONTEXT_MODE_ROOT overrides the package root, so a development build
# can be tested without installing it globally.
set -Eeuo pipefail
shopt -s inherit_errexit

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

# ── 1. Candidate package roots ──────────────────────────────────────
CANDIDATES=()
if [[ -n "${CONTEXT_MODE_ROOT:-}" ]]; then
  CANDIDATES+=("$CONTEXT_MODE_ROOT")
fi

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
if [[ -n "$CM_BIN" ]]; then
  BIN_DIR="$(dirname "$CM_BIN")"
  CANDIDATES+=(
    "$BIN_DIR/../lib/node_modules/context-mode"
    "$BIN_DIR/../share/node_modules/context-mode"
  )
fi

if [[ ${#CANDIDATES[@]} -eq 0 ]]; then
  die "context-mode not found. Install with: npm install -g context-mode"
fi

# ── 2. Resolve the package root ─────────────────────────────────────
CM_ROOT=""
for candidate in "${CANDIDATES[@]}"; do
  v2_hook="$candidate/hook.mjs"
  v2_server="$candidate/server.mjs"
  v1_start="$candidate/start.mjs"
  v1_hook="$candidate/hooks/pretooluse.mjs"
  if [[ -f "$v2_server" && -f "$v2_hook" ]]; then
    CM_ROOT="$candidate"
    break
  fi
  if [[ -f "$v1_start" && -f "$v1_hook" ]]; then
    CM_ROOT="$candidate"
    break
  fi
done

if [[ -z "$CM_ROOT" ]]; then
  die "context-mode package root not found (looked in: ${CANDIDATES[*]})"
fi

# ── 3. Start the matching server entry ──────────────────────────────
if [[ -f "$CM_ROOT/server.mjs" ]]; then
  exec node "$CM_ROOT/server.mjs" --agent claude-code
fi
exec node "$CM_ROOT/start.mjs"
