#!/usr/bin/env bash
# secret-guard preToolCall hook: scans the content of eca__write_file and
# eca__edit_file calls for hardcoded secrets. On a match it makes ECA ask
# before the call runs (even in trust mode) and tells the user what it found
# and where, without repeating the secret itself.
#
# On ECA >= 0.172.0 the secret-guard module (modules/secret_guard.clj) does
# this instead, and drops this hook from the config while it's active.
set -euo pipefail

input=$(cat)

if ! command -v jq &>/dev/null; then
  echo '{"systemMessage": "secret-guard needs jq to scan file content, and jq is not installed, so this change was not checked for secrets. Install jq: https://jqlang.github.io/jq/"}'
  exit 0
fi

# write_file sends the file in .content, edit_file the replacement in .new_content.
content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_content // empty')
if [ -z "$content" ]; then
  exit 0
fi

path=$(printf '%s' "$input" | jq -r '.tool_input.path // "the file"')
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

line_label="line"
target="$path"
if [[ "$tool" == *edit_file ]]; then
  line_label="new-text line"
  target="the edit to $path"
fi

findings=()

# check NAME REGEX: records NAME with the first line matching REGEX
# (extended regex, case-insensitive). Keep in sync with the module's patterns.
check() {
  local line
  line=$(printf '%s\n' "$content" | grep -n -E -i -m 1 -- "$2" | cut -d: -f1 || true)
  if [ -n "$line" ]; then
    findings+=("$1 ($line_label $line)")
  fi
}

check "AWS access key ID" "AKIA[0-9A-Z]{16}"
check "AWS secret access key" "aws_secret_access_key[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9/+]{40}"
check "API key assignment" "api[_-]?key[[:space:]]*[:=][[:space:]]*['\"][a-zA-Z0-9]"
check "Bearer token" "bearer[[:space:]]+[a-zA-Z0-9_.=-]{20,}"
check "Private key" "BEGIN[[:space:]]+(RSA[[:space:]]+|EC[[:space:]]+|DSA[[:space:]]+|OPENSSH[[:space:]]+)?PRIVATE[[:space:]]+KEY"
check "Secret API key (sk-...)" "(^|[^a-zA-Z0-9])sk-[a-zA-Z0-9_-]{20,}"
check "GitHub token" "gh[pousr]_[a-zA-Z0-9]{36,}"
check "Secret key assignment" "secret[_-]?key[[:space:]]*[:=][[:space:]]*['\"][a-zA-Z0-9]"
check "Password assignment" "password[[:space:]]*[:=][[:space:]]*['\"][^'\"]{8,}"
check "Credentials in a URL" "://[^:/@[:space:]]+:[^@/[:space:]]+@"

if [ ${#findings[@]} -eq 0 ]; then
  exit 0
fi

printf -v found '%s, ' "${findings[@]}"
found=${found%, }

jq -n --arg target "$target" --arg found "$found" '{
  approval: "ask",
  systemMessage: "⚠️ Possible secret in \($target): \($found). Review the change before approving it."
}'
