---
name: ctx-upgrade
description: |
  Update context-mode from GitHub and fix hooks/settings.
  Pulls latest, builds, installs, updates npm global, configures hooks.
  Trigger: /context-mode:ctx-upgrade
---

# Context Mode Upgrade

Pull latest from GitHub and reinstall the plugin.

## Instructions

1. Call the `context-mode__ctx_upgrade` MCP tool directly. It returns a shell command to execute.
2. Run the returned command using `eca__shell_command`.
3. Display results as a markdown checklist:
   ```
   ## context-mode upgrade
   - [x] Pulled latest from GitHub
   - [x] Built and installed v1.0.39
   - [x] Hooks configured
   - [x] Doctor: all checks PASS
   ```
   Use `[x]` for success, `[ ]` for failure. Show actual version numbers.
4. Tell the user to **restart their session** to pick up the new version.
5. **Fallback** (only if MCP tool call fails): run the installed CLI with `eca__shell_command`:
   ```bash
   context-mode upgrade
   ```
