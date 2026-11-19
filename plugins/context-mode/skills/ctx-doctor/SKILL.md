---
name: ctx-doctor
description: |
  Run context-mode diagnostics. Checks runtimes, hooks, FTS5,
  plugin registration, npm and marketplace versions.
  Trigger: /context-mode:ctx-doctor
---

# Context Mode Doctor

Run diagnostics and display results directly in the conversation.

## Instructions

1. Call the `context-mode__ctx_doctor` MCP tool directly. It runs all checks server-side and returns a plain-text status report.
2. Display the results verbatim — they are already formatted with plain-text status prefixes: `[OK]` PASS, `[FAIL]` FAIL, `[WARN]` WARN. Renderer-safe (no markdown task-list syntax) for cross-client compatibility (e.g., Z.ai GLM).
3. **Fallback** (only if MCP tool call fails): run the installed CLI with `eca__shell_command`:
   ```bash
   context-mode doctor
   ```
   Re-display results verbatim with the same `[OK]`/`[FAIL]`/`[WARN]` prefixes.
