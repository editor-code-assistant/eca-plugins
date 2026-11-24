#!/usr/bin/env bash
# sessionEnd hook: ECA is shutting down, e.g. when you close the editor.
set -euo pipefail

JOURNAL_DIR="${ECA_JOURNAL_DIR:-$HOME/.eca/journal}"
mkdir -p "$JOURNAL_DIR"

INPUT=$(cat)

if command -v jq &>/dev/null; then
  WORKSPACES=$(echo "$INPUT" | jq -r '(.workspaces // []) | join(", ")')
else
  WORKSPACES="unknown"
fi

TODAY=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)

cat >> "$JOURNAL_DIR/$TODAY.md" <<EOF
### ECA session ended at $TIME
- **Workspaces:** $WORKSPACES
---

EOF

exit 0
