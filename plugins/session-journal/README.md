# Session Journal

Automatically logs your ECA activity to a daily Markdown journal file: when chats start or are resumed, when they're deleted, and when ECA shuts down. A lightweight dev activity log.

## What it provides

- **session-journal.start** (`chatStart` hook) — Logs a chat's first prompt in this ECA run, as *started* for a new chat or *resumed* for an existing one, with the chat ID and workspaces. Subagent chats aren't logged.
- **session-journal.end** (`chatEnd` hook) — Logs when a chat is deleted. ECA fires `chatEnd` only on deletion, not when you stop using a chat.
- **session-journal.session-end** (`sessionEnd` hook) — Logs when ECA shuts down, e.g. when you close the editor, with the workspaces.

## Journal format

Each day produces a `YYYY-MM-DD.md` file:

```markdown
## Chat started at 09:15:32
- **Chat:** abc-123
- **Workspaces:** /home/user/project-a, /home/user/project-b

## Chat resumed at 14:02:10
- **Chat:** abc-123
- **Workspaces:** /home/user/project-a, /home/user/project-b

### Chat deleted at 16:42:07
- **Chat:** abc-123

### ECA session ended at 18:00:12
- **Workspaces:** /home/user/project-a, /home/user/project-b
---
```

## Journal location

By default journals are written to `~/.eca/journal/`.

Override by setting the `ECA_JOURNAL_DIR` environment variable:

```bash
export ECA_JOURNAL_DIR="$HOME/my-journals"
```

## Requirements

- `jq` is recommended for extracting session metadata from stdin. Without it, fields fall back to `"unknown"` and resumed chats are logged as started.

---

By the ECA team.
