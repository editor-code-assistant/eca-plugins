---
description: Permanently delete all indexed content from the context-mode knowledge base
---

Warn the user that this permanently deletes indexed content from the FTS5
knowledge base, and that it cannot be undone. Ask for confirmation first.

If confirmed, call `context-mode__ctx_purge`. Pass `project: true` to
wipe everything stored for this project, or narrow it with `session` or
`source` when the user asks for that. Display the result.
