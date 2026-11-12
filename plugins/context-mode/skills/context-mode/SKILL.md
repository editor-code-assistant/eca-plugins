---
name: context-mode
description: |
  Use context-mode tools instead of eca__shell_command / eca__read_file /
  eca__grep when the output may be large. Triggers: "analyze logs",
  "summarize output", "process data", "parse JSON", "filter results",
  "extract errors", "check build output", "analyze dependencies",
  "process API response", "large file analysis", "run tests",
  "test output", "coverage report", "git log", "recent commits",
  "diff between branches", "list containers", "pod status", "disk usage",
  "fetch docs", "API reference", "index documentation", "call API",
  "check response", "query results", "find TODOs", "count lines",
  "codebase statistics", "security audit", "outdated packages",
  "dependency tree", "cloud resources", "CI/CD output".
  Also triggers on ANY tool output that may exceed 20 lines.
---

# Context Mode: Default for All Large Output

## MANDATORY RULE

Default to context-mode for anything that may produce large output. Keep
`eca__shell_command` for guaranteed-small operations:

- **File mutations**: `mkdir`, `mv`, `cp`, `rm`, `touch`, `chmod`
- **Git writes**: `git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`
- **Navigation**: `cd`, `pwd`, `which`
- **Process control**: `kill`, `pkill`
- **Package management**: `npm install`, `pip install`
- **Simple output**: `echo`, `printf`

**Everything else → a `context-mode__ctx_*` tool.** Any command that
reads, queries, fetches, lists, logs, tests, builds, diffs or inspects,
and every CLI (`gh`, `aws`, `kubectl`, `docker`, `terraform`, ...).
When uncertain, use context-mode: every needless KB costs the whole
session.

## Decision table

Read top to bottom; the first row that matches wins.

| When | Do this |
|------|---------|
| The command only mutates state, navigates, or echoes | `eca__shell_command` |
| You need to change a file | `eca__read_file` then `eca__edit_file` |
| You need to understand a file, not edit it | `context-mode__ctx_execute(file: path, language, code)` |
| You need a web page or docs | `context-mode__ctx_index(url, source)`, then `context-mode__ctx_search` |
| You have several commands and questions about them | `context-mode__ctx_batch(commands, queries)` |
| Anything else that may produce large output | `context-mode__ctx_execute(language, code)` |

## Think in Code — MANDATORY

Write code that derives the answer and print only that. Never read raw
data into context.

```javascript
// Instead of eca__shell_command("gh pr list") -> raw JSON in context
const { execSync } = await import('node:child_process');
const prs = JSON.parse(execSync(
  'gh pr list --json number,title,state --limit 20').toString());
prs.forEach((p) => console.log(`#${p.number} [${p.state}] ${p.title}`));
```

```python
# `file: "data.json"` puts the absolute path in CTX_FILE
import json
import os
rows = json.load(open(os.environ["CTX_FILE"]))
print(f"records: {len(rows)}")
```

## BLOCKED — do NOT use

### curl / wget — FORBIDDEN (hook-enforced)

`curl`/`wget` in `eca__shell_command` is denied by the plugin's hook. Use
`context-mode__ctx_index(url, source)` + `context-mode__ctx_search`, or
fetch inside `context-mode__ctx_execute(language: "javascript")`.

### Inline HTTP — FORBIDDEN

No `node -e "fetch(..."`, no `python -c "requests.get(..."`. They bypass
the sandbox. Use `context-mode__ctx_execute(language, code)`.

### Large unbounded reads — DENIED

An unbounded `eca__read_file` of a file over 16 KB is denied. Read with
`line_offset`/`limit`, or use `context-mode__ctx_execute(file: ...)`.

A large shell, git, grep or directory result is trimmed automatically to
a short selection plus a `context-mode__ctx_search` handle; the full
text stays in the index.

## Tool Selection

| Tool | Use it for |
|------|------------|
| `context-mode__ctx_execute(language, code, file?)` | Run code; only printed output returns |
| `context-mode__ctx_batch(commands, queries)` | Many commands + their questions, one call |
| `context-mode__ctx_index(path?, url?, source?)` | Index a file, folder or URL |
| `context-mode__ctx_search(queries, source?, scope?, sort?)` | BM25 over everything indexed |
| `context-mode__ctx_resume(session?, seq?)` | Session state after resume/compaction |
| `context-mode__ctx_stats()` | Context savings so far |
| `context-mode__ctx_doctor()` | Diagnose the install |
| `context-mode__ctx_upgrade(mode?)` | Upgrade or uninstall |
| `context-mode__ctx_purge(session?, source?, project?)` | Delete indexed data |

`ctx_resume` and `ctx_search(scope: "session")` need the host to forward
the chat id as `_meta.sessionId` (ECA 0.171.1 and later do). If
`ctx_resume` reports no journal rows for this session, fall back to
`ctx_search(sort: "timeline")`, which works either way.
`ctx_doctor` and `ctx_upgrade` describe the Claude Code host, not ECA.

### Language

| Situation | Language |
|-----------|----------|
| HTTP/API calls, JSON | `javascript` |
| Data analysis, CSV, stats | `python` |
| Shell commands with pipes | `shell` |
| File pattern matching | `shell` |

## Search strategy

- BM25 uses OR semantics; more matching terms rank higher.
- Use 2–4 specific technical terms per query.
- Pass `source` when several documents are indexed, to avoid
  cross-source contamination (partial match works).
- Batch every question into one `queries` array — never one call per
  question.

## Critical rules

1. **Always print your findings.** stdout is all that enters context.
2. **Write analysis code, not data dumps.** Print findings, not raw JSON.
3. **Be specific in output**: ids, line numbers, exact values.
4. **To edit a file, use the ECA tools** — context-mode is for analysis.
5. **Never pass large data as `context-mode__ctx_index(content: ...)`.**
   Use `path` or `url` so the read happens server-side.
6. **Do not re-index data already in context.** Use it, or save it to a
   file first.

## Anti-patterns

- `curl http://api/endpoint` via `eca__shell_command` → denied, and a
  flood otherwise. Use `context-mode__ctx_execute` with `fetch`.
- `cat large-file.json` via `eca__shell_command` → the whole file in
  context. Use `context-mode__ctx_execute(file: ...)`.
- `gh pr list` via `eca__shell_command` → raw JSON. Use
  `context-mode__ctx_execute` with a `--jq` filter.
- Piping through `| head -20` → you lose the rest. Capture it all with
  `context-mode__ctx_execute` and print a summary.
- One `context-mode__ctx_search` call per question → batch them in one
  `queries` array.
- Expecting `context-mode__ctx_stats` to reset anything → it is read-only; use
  `context-mode__ctx_purge` to delete.

## Output

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler, pleasantries, hedging. Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
Write artifacts to FILES — never inline. Return: file path + 1-line description.

## Session Continuity

The plugin's hooks journal prompts, decisions, file edits, commands and
errors per session. After a resume or a compaction, prefer `ctx_resume`
before asking; if it reports no rows for this session, use
`ctx_search(sort: "timeline")`.

| Need | Call |
|------|------|
| What were we working on? | `context-mode__ctx_resume` |
| … if `ctx_resume` reports no rows | `context-mode__ctx_search(sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision")` |
| What went wrong? | `context-mode__ctx_search(queries: ["error"], sort: "timeline")` |

## Subagents

Subagents can use the same `context-mode__ctx_*` tools. Mention
context-mode explicitly when a subagent task is likely to produce large
output.

## Reference files

Read these when you need a worked pattern:

- `references/patterns-javascript.md` — API, JSON, lockfile, test output
- `references/patterns-python.md` — datasets, CSV, logs, text
- `references/patterns-shell.md` — build, test, log, disk, git output
- `references/anti-patterns.md` — the mistakes to avoid

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call `context-mode__ctx_stats`, show the output verbatim |
| `ctx doctor` | Call `context-mode__ctx_doctor`; its host rows are Claude Code |
| `ctx upgrade` | Do NOT call `ctx_upgrade`; run `npm i -g context-mode` |
| `ctx purge` | Call `context-mode__ctx_purge` with `project: true` |

## context-mode v1 note

This plugin drives whichever context-mode is installed. On v1 (1.0.x):
`ctx_batch_execute` (not `context-mode__ctx_batch`),
`ctx_execute_file(path, ...)` (not `context-mode__ctx_execute(file: ...)`),
`ctx_fetch_and_index(url, source)` (not `context-mode__ctx_index(url,
...)`), and no `context-mode__ctx_resume`. v1 also pre-loads a `file`
into the `FILE_CONTENT` variable, where v2 puts the path in `CTX_FILE`
instead. The MCP tool list your session exposes is authoritative.
