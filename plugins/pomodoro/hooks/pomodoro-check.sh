#!/usr/bin/env bash
# pomodoro postRequest hook: after each answer, checks how long you've been
# working and, past WORK_MINUTES, reminds you to take a break.
#
# A gap of IDLE_MINUTES or more between answers counts as a break, so the work
# timer starts again. The state is per user, shared by all your ECA sessions.
set -euo pipefail

WORK_MINUTES=25
IDLE_MINUTES=15

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/eca"
STATE_FILE="$STATE_DIR/pomodoro"

# ECA writes the hook's input to stdin: read it all so ECA can finish writing.
cat > /dev/null

is_number() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
}

now=$(date +%s)
start=""
last=""
if [ -f "$STATE_FILE" ]; then
  read -r start last < "$STATE_FILE" || true
fi

# No state yet, or unreadable state: start a new work period now.
if ! is_number "$start" || ! is_number "$last"; then
  start=$now
  last=$now
fi

# You were away long enough: that was a break.
if [ $((now - last)) -ge $((IDLE_MINUTES * 60)) ]; then
  start=$now
fi

elapsed=$(((now - start) / 60))
if [ "$elapsed" -ge "$WORK_MINUTES" ]; then
  printf "{\"systemMessage\": \"🍅 You've been coding for %d minutes! Consider a 5-minute break to recharge.\"}\n" "$elapsed"
  start=$now
fi

mkdir -p "$STATE_DIR"
echo "$start $now" > "$STATE_FILE"
