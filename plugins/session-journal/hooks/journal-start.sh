#!/usr/bin/env bash
# chatStart hook: a chat's first prompt in this ECA run, for a new chat or a
# resumed one (subagent chats don't trigger it).
set -euo pipefail

JOURNAL_DIR="${ECA_JOURNAL_DIR:-$HOME/.eca/journal}"
mkdir -p "$JOURNAL_DIR"

INPUT=$(cat)

EVENT="started"
if command -v jq &>/dev/null; then
  CHAT_ID=$(echo "$INPUT" | jq -r '.chat_id // "unknown"')
  WORKSPACES=$(echo "$INPUT" | jq -r '(.workspaces // []) | join(", ")')
  if [ "$(echo "$INPUT" | jq -r '.resumed // false')" = "true" ]; then
    EVENT="resumed"
  fi
else
  CHAT_ID="unknown"
  WORKSPACES="unknown"
fi

TODAY=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)

cat >> "$JOURNAL_DIR/$TODAY.md" <<EOF
## Chat $EVENT at $TIME
- **Chat:** $CHAT_ID
- **Workspaces:** $WORKSPACES

EOF

exit 0
