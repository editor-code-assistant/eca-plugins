# context-mode — routing rules

context-mode MCP tools are available as `context-mode__ctx_*`. Use them to
protect ECA's context window from raw large outputs. One unrouted shell command
or file read can dump tens of KB into context.

ECA hooks block dangerous direct fetches through this plugin's local adapter
bridge. Soft routing remains a standing rule: prefer sandbox/search tools
whenever output may be large.

## Think in Code

Analyze/count/filter/compare/search/parse/transform data: **write code** via
`context-mode__ctx_execute(language, code)`, `console.log()` only the answer.
Do NOT read raw data into context. PROGRAM the analysis, not COMPUTE it.
Pure JavaScript — Node.js built-ins only (`fs`, `path`, `child_process`).
Use `try/catch`, handle `null`/`undefined`. One script replaces ten tool calls.

## BLOCKED — do NOT use

### curl / wget — forbidden
Do NOT use `curl`/`wget` in `eca__shell_command`. The ECA hook denies these
through the plugin-local adapter.
Use: `context-mode__ctx_fetch_and_index(url, source)` or
     `context-mode__ctx_execute(language: "javascript", code: "const r = await fetch(...)")`

### Inline HTTP — forbidden
No `node -e "fetch(..."`, `python -c "requests.get(..."`. Bypasses sandbox.
Use: `context-mode__ctx_execute(language, code)` — only stdout enters context.

### Direct web fetching — forbidden
Use: `context-mode__ctx_fetch_and_index(url, source)` then `context-mode__ctx_search(queries)`.

## REDIRECTED — use sandbox/search

### `eca__shell_command` (>20 lines output)
Use directly only for bounded operations: `git add/commit/push/checkout`,
`mkdir`, `rm`, `mv`, `cd`, `echo`, small status/version checks.
Otherwise use `context-mode__ctx_batch_execute(commands, queries)` or
`context-mode__ctx_execute(language: "shell", code: "...")`.

### `eca__read_file` (for analysis)
Reading to **edit** → `eca__read_file` is correct.
Reading to **analyze/explore/summarize** → `context-mode__ctx_execute_file(path, language, code)`.

### `eca__grep` (large results)
Use `context-mode__ctx_execute(language: "shell", code: "grep ...")` in the sandbox.

## Tool selection

0. **MEMORY**: `context-mode__ctx_search(sort: "timeline")` — after resume, check prior context before asking user.
1. **GATHER**: `context-mode__ctx_batch_execute(commands, queries)` — one call replaces 30+.
2. **FOLLOW-UP**: `context-mode__ctx_search(queries: ["q1", "q2", ...])` — one call.
3. **PROCESSING**: `context-mode__ctx_execute(language, code)` | `context-mode__ctx_execute_file(path, language, code)`.
4. **WEB**: `context-mode__ctx_fetch_and_index(url, source)` then `context-mode__ctx_search(queries)`.
5. **INDEX**: `context-mode__ctx_index(path, source)` — use `path` instead of `content` for large data.

## Session continuity

Session history is searchable. On resume, search BEFORE asking the user. Do not
ask "what were we working on?" until `ctx_search` has failed to recover it.

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_search(queries: ["summary"], sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode__ctx_search(queries: ["constraint"], source: "constraint")` |
