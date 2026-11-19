---
description: Upgrade context-mode to the latest version in place
---

Tell the user to upgrade from a shell:

```bash
npm i -g context-mode
```

Run it with `eca__shell_command` only if the user asks you to, and display
the result.

Do **not** call `context-mode__ctx_upgrade`. That tool updates the host it
was installed for, and this plugin runs the MCP server as
`--agent claude-code` because context-mode has no ECA agent. It would
rewrite the Claude Code installation's config and report a
`claude plugin ...` command that ECA cannot use.

Tell the user to restart their ECA session to pick up the new version.
