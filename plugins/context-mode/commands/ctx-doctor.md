---
description: Diagnose the context-mode installation — runtimes, hooks, FTS5, version
---

Call the `context-mode__ctx_doctor` tool and display the full output.

It is read-only. If it returns a shell command to run (older versions do),
run that command with `eca__shell_command` and display the result as a
checklist:

- `[x]` for each passing check
- `[ ]` for each failing check, with its fix

The "host config" rows describe the Claude Code installation, not ECA —
the plugin runs the MCP server as `--agent claude-code` because
context-mode has no ECA agent. Treat those rows as not applicable; the
version, Node, database and index rows are the ones that matter here.
