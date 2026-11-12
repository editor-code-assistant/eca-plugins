# context-mode — MANDATORY routing rules

context-mode MCP tools are available as `context-mode__ctx_*`. They keep
large tool output out of ECA's context window: the work happens in a
sandbox or an FTS5 index, and only the derived answer comes back.

Hooks enforce the hard cases (see below); these rules cover the rest.

## Think in Code — MANDATORY

Analyze/count/filter/compare/search/parse/transform data: **write code**
via `context-mode__ctx_execute(language, code)` and `console.log()` only
the answer. Do NOT read raw data into context. Program the analysis, do
not compute it.

- Pure JavaScript, Node.js built-ins only (`fs`, `path`, `child_process`).
- Use `try/catch`; handle `null`/`undefined`.
- One script replaces ten tool calls.

## BLOCKED — do NOT use

### curl / wget — FORBIDDEN (hook-enforced)

`curl`/`wget` in `eca__shell_command` is denied by the plugin's hook.
Use `context-mode__ctx_index(url, source)` and then
`context-mode__ctx_search(queries)`, or fetch inside
`context-mode__ctx_execute(language: "javascript", code: ...)`.
Both run in the sandbox and have full network access.

### Inline HTTP — FORBIDDEN

No `node -e "fetch(..."`, no `python -c "requests.get(..."`. They bypass
the sandbox. Use `context-mode__ctx_execute(language, code)` — only what
you print enters context.

### Large unbounded reads — DENIED

An unbounded `eca__read_file` (no `line_offset`/`limit`) of a file over
16 KB is denied. Read in ranges, or process the file with
`context-mode__ctx_execute(file: path, language, code)`.

## REDIRECTED — use sandbox

### `eca__shell_command`

Use it directly only for bounded work: `git add/commit/push/checkout`,
`mkdir`, `rm`, `mv`, `cd`, `echo`, short status/version checks.
Everything else: `context-mode__ctx_batch(commands, queries)` or
`context-mode__ctx_execute(language: "shell", code: "...")`.
A large shell result is trimmed to a search handle automatically.

### `eca__read_file`

Reading to **edit** → `eca__read_file` (or a ranged read) is correct.
Reading to **analyze** → `context-mode__ctx_execute(file: path, ...)`.

### `eca__grep`

Large searches →
`context-mode__ctx_execute(language: "shell", code: "grep ...")`.

## Tool selection

0. **MEMORY** — after a resume or a compaction, call
   `context-mode__ctx_resume` for this session's state block before
   asking the user what you were doing. If it reports no journal rows for
   this session, the host does not forward the chat id; fall back to
   `context-mode__ctx_search(sort: "timeline")`, which always works.
   (The plugin injects the state block at `postCompact`.)
1. **GATHER** — `context-mode__ctx_batch(commands, queries)`: run many
   commands, index the output, and get the matching sections in one call.
2. **FOLLOW-UP** — `context-mode__ctx_search(queries: [...])`: batch every
   question in one `queries` array.
3. **PROCESSING** — `context-mode__ctx_execute(language, code, file?)`.
4. **WEB** — `context-mode__ctx_index(url, source)`, then
   `context-mode__ctx_search`.
5. **INDEX** — `context-mode__ctx_index(path, source)` for local files.
   Never pass large data as `content:`; it would enter context as an
   argument.

## Session Continuity

The plugin's hooks journal prompts, decisions, edits, commands and errors
per session. On resume or after compaction, prefer `ctx_resume` before
asking; if it reports no rows for this session, use
`ctx_search(sort: "timeline")`.

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_resume` |
| … if `ctx_resume` reports no rows | `context-mode__ctx_search(sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision")` |
| What went wrong? | `context-mode__ctx_search(queries: ["error"], sort: "timeline")` |

## context-mode v1 note

This plugin drives whichever context-mode is installed. On v1 (1.0.x) the
tool names differ:

| v2 | v1 |
|----|----|
| `context-mode__ctx_batch(commands, queries)` | `ctx_batch_execute(commands, queries)` |
| `context-mode__ctx_execute(file: path, ...)` | `ctx_execute_file(path, ...)` |
| `context-mode__ctx_index(url, source)` | `ctx_fetch_and_index(url, source)` |
| `context-mode__ctx_resume` | — use `context-mode__ctx_search(sort: "timeline")` |

The MCP tool list is authoritative: call the names your session exposes.
