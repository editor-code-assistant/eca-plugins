# context-mode

> ECA plugin for [context-mode](https://github.com/mksglu/context-mode) —
> keeps large output from tools out of the context window by routing it through
> a sandbox and an FTS5 index, with session continuity across compactions.

## What it does

This plugin directs the model to write code that processes data and print
only the answer.

- **Sandboxed execution** — `ctx_execute` runs code in an isolated
  subprocess; only what the script prints enters context.
- **FTS5 knowledge base** — `ctx_batch` runs commands, indexes the output
  and answers questions about it in one call; `ctx_search` retrieves only
  the relevant parts.
- **Result trimming** — a large shell, git, grep or directory result is
  replaced by a short selection plus a `ctx_search` handle; the full text
  stays in the index.
- **Routing enforcement** — a `preToolCall` hook denies `curl`/`wget`,
  inline HTTP, and unbounded reads of large files.
- **Session continuity** — `chatStart`, `preRequest`, `postToolCall`,
  `preCompact` and `postCompact` hooks journal prompts, decisions, edits,
  commands and errors, and restore a resume snapshot after compaction.
  See also [Limitation #1](#1-no-per-call-id-ecas-mcp-client-sends-no-_metasessionid)

## Prerequisites

Install the `context-mode` npm package. The plugin supports **both v1
(1.0.x) and v2 (2.x)** and picks the right entry points at runtime.

```bash
npm install -g context-mode
```

With [mise](https://mise.jdx.dev/):

```toml
# ~/.config/mise/config.toml
[tools]
"npm:context-mode" = "latest"
```

v2 needs Node 24.15 or later.

## How the integration works

context-mode has no ECA adapter upstream: its hook scripts and its single
`hook.mjs` bundle all speak the Claude Code hook protocol, while ECA uses
its own payload and output fields. `hooks/ctx-eca-adapter.mjs` is the
translation layer:

```
ECA stdin           -> Claude-shaped stdin -> context-mode hook entry
context-mode stdout -> ECA output fields
```

It maps the ECA event (`chatStart`, `preRequest`, `preToolCall`,
`postToolCall`, `preCompact`, `postCompact`) onto the context-mode event,
translates ECA tool names and inputs into their Claude equivalents, and
translates the reply back into `additionalContext`, `approval: "deny"` and
`replacedOutput`.

If anything in it fails — the context-mode package is not found, the hook
entry crashes, the reply is not JSON, the spawn times out — it writes
nothing and exits 0. ECA reads no output as "no decision", so the tool
call proceeds unrouted. A broken adapter costs you routing guidance, never
a blocked or failed tool call.

`hooks/ctx-server.sh` starts the MCP server, choosing `server.mjs
--agent claude-code` on v2 and `start.mjs` on v1.

## Usage

Once installed, context-mode works automatically. The routing rules guide the agent toward sandbox tools for any operation that produces large output.

## Commands

| Command | Description |
|---------|-------------|
| `/context-mode:ctx-stats` (1) | Context savings — per-tool breakdown, token usage, savings ratio |
| `/context-mode:ctx-doctor` (2) | Diagnose runtimes, hooks, FTS5, version |
| `/context-mode:ctx-upgrade` (2) | Upgrade context-mode in place |
| `/context-mode:ctx-purge` | Permanently delete all indexed content from the knowledge base |

(1) See [Limitation #2](#2-session-statistics-are-split)

(2) See [Limitation #4](#4-host-aware-tools-speak-for-claude-code)

## Tools

| Tool (v2) | Description |
|-----------|-------------|
| `context-mode__ctx_execute` | Run code; `file?` sets `CTX_FILE` |
| `context-mode__ctx_batch` | Run commands, index the output, answer queries |
| `context-mode__ctx_index` | Index a file, folder or `url` |
| `context-mode__ctx_search` | BM25 search across indexed content |
| `context-mode__ctx_resume` (1) | Session state block |
| `context-mode__ctx_stats` (2) | Context savings breakdown |
| `context-mode__ctx_doctor` (2) | Diagnose the install (host rows = Claude Code) |
| `context-mode__ctx_purge` (3) | Delete indexed data |
| `context-mode__ctx_upgrade` (4) | Updates the host it was installed for |

On **v1** the names differ: `ctx_batch_execute`, `ctx_execute_file(path,
...)`, `ctx_fetch_and_index(url, source)`, and there is no `ctx_resume`.
The MCP tool list in your session is authoritative.

(1) See [Limitation #1](#1-no-per-call-id-ecas-mcp-client-sends-no-_metasessionid)

(2) See [Limitation #2](#2-session-statistics-are-split)

(3) See [Limitation #3](#3-ctx_purgesession--cannot-target-a-chat)

(4) See [Limitation #4](#4-host-aware-tools-speak-for-claude-code)

## Read policy for `eca__read_file`

An unbounded `eca__read_file` (no `line_offset`/`limit`) of a file over
16 KB is denied, which pushes the agent to read in ranges or to process
the file with `ctx_execute(file: ...)`.

Whether a *result* is also trimmed is configurable:

| Value | Behaviour |
|-------|-----------|
| `noreplace` *(default)* | Deny the unbounded large read; never trim results |
| `trim` | Also trim read results over 4 KB to a `ctx_search` handle |
| `off` | Do not touch `read_file` at all |

Resolution order:

1. `CONTEXT_MODE_ECA_READ_POLICY` environment variable,
2. `<workspace>/.eca/context-mode.json` → `{"readPolicy": "trim"}`,
3. `<XDG_CONFIG_HOME|~/.config>/eca/context-mode.json`,
4. the default, `noreplace`.

## Session continuity

Every significant tool call is tracked:

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_search(sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision")` |
| What went wrong? | `context-mode__ctx_search(queries: ["error"], sort: "timeline")` |

After compaction the plugin injects the resume snapshot through ECA's
`postCompact` `additionalContext`, so the model does not have to ask for
it. `ctx_resume` and `ctx_search(scope: "session")` need the chat id on
the MCP call, which ECA does not send yet — see
[Known limitations](#known-limitations).

## Think in Code

The core paradigm: write code that processes data and print only the
answer. Never read raw data into context.

```javascript
// Instead of eca__shell_command("gh pr list") -> raw JSON floods context
const { execSync } = await import('node:child_process');
const prs = JSON.parse(execSync('gh pr list --json number,title,state --limit 20').toString());
prs.forEach((p) => console.log(`#${p.number} [${p.state}] ${p.title}`));
```

## Keeping up with context-mode

context-mode changes its hook protocol between releases, so the plugin
checks itself against a known list, `hooks/validated-versions.json`.

- **At chat start** the adapter compares the installed version with that
  list. If it is outside the list it adds one line to the chat context
  pointing at the check below; otherwise it stays silent. The warning
  repeats at most once a day.
- **On demand**, `hooks/ctx-compat.mjs` reports the installed version,
  the detected layout, the validated list and the latest release, and can
  validate a release *before* you install it:

```bash
node plugins/context-mode/hooks/ctx-compat.mjs             # report
node plugins/context-mode/hooks/ctx-compat.mjs --validate  # check latest
```

`--validate` fetches the target release into a temp directory (`npm
pack`, falling back to `git clone`) and runs the adapter self-check
against it. Nothing touches the global install. Exit codes: `0` ok,
`10` update available, `20` incompatible, `30` could not check.

If a release fails the check, `ctx-compat.mjs` prints a maintainer report
naming the upstream files that decide the contract, and the adapter needs
a change before you update.

## Known limitations

### 1. No per-call id, ECA's MCP client sends no `_meta.sessionId`
   Without such identifiers the context-mode server falls back to a
   process-local session id (`mcp:<uuid>`). The hooks journal under ECA's
   chat id instead, so `ctx_resume` and `ctx_search(scope: "session")` find
   no rows. The adapter rewrites v2's `ctx_resume` hint to point at
   `ctx_search(sort: "timeline")`; use that, or the default `worktree`
   scope. A one-line ECA-core change (send `_meta.sessionId`) would fix
   this properly.
### 2. Session statistics are split
   The server's own tool calls are journaled under `mcp:<uuid>` — a new id
   per server process — while the hook rows sit under chat ids, so
   `ctx_stats`'s per-session view is fragmented. Per-tool and per-project
   totals are correct.
### 3. `ctx_purge(session: …)` cannot target a chat
   This is because it needs the chat id. `project: true` and `source:` work.
### 4. Host-aware tools speak for Claude Code
   context-mode has no ECA agent, so the plugin runs the server as
   `--agent claude-code`. `ctx_doctor`'s host-config rows and `ctx_upgrade`
   therefore describe and rewrite the Claude Code installation, not ECA.
   Upgrade this plugin with `npm i -g context-mode` instead of `ctx_upgrade`.
### 5. `source: "constraint"` is v1-only
   context-mode v1 extracted constraints from errors and indexed them under
   that source; v2 does not. Search `error` with `sort: "timeline"` instead.

Not affected by (1), for the record: `source: "decision"` works, because
the decision rows carry a session-independent label plus the project
worktree and `ctx_search(source:)` filters on those. `scope: "worktree"`
works for the same reason — ECA's hook data and the MCP server's `:dir`
resolve to the same worktree.

## Troubleshooting

- Set `CONTEXT_MODE_ECA_DEBUG=1` to get adapter diagnostics on stderr.
- Set `CONTEXT_MODE_ROOT` to point the adapter at a specific
  context-mode package (useful for testing an unreleased build).
- If hooks do nothing, check that `context-mode` is on `PATH` — the
  plugin no-ops silently when it is not installed.

## When ECA starts sending an id

[Limitation #1](#1-no-per-call-id-ecas-mcp-client-sends-no-_metasessionid)
is the only item here that needs a change in ECA itself. When `mcp.clj`'s
`request-tool-call` adds `params._meta.sessionId`, most of it starts
working on its own — but several places in this plugin were written around
the gap and should be reverted.

### Starts working with no plugin change

- `ctx_resume` returns this chat's state block, instead of
  `ctx_resume: no journal rows for this session yet.`
- `ctx_search(scope: "session")` finds the hook-journaled rows.
- `ctx_stats`'s per-session view stops being split, because the server's
  own calls and the hook rows then share one session id
  ([limitation #2](#2-session-statistics-are-split)).

### Change in the plugin

1. `hooks/ctx-eca-adapter.mjs` — delete `RESUME_HINT_RE`, `RESUME_HINT_FIX`
   and the `.replace(RESUME_HINT_RE, RESUME_HINT_FIX)` in
   `rewriteToolNames`. v2's own hint ("Call `ctx_resume` for a summary")
   becomes correct again.
2. `hooks/ctx-eca-adapter.test.mjs` — delete the probe
   "the resume hint does not point at ctx_resume".
3. `rules/context-mode.md` — the `0. MEMORY` step and the
   `## Session Continuity` table go back to `ctx_resume`, and can drop the
   parenthetical about `scope: "session"`.
4. `skills/context-mode/SKILL.md` — the same, in its session table.
5. `README.md` — this file: the Tools row and footnote for `ctx_resume`,
   the Session continuity table, and limitation #1 itself.
6. `ECA-CORE-ISSUE-mcp-session-id.md` — close or delete the draft.

### One thing to check first

The value ECA sends must be the **chat id**, because that is what the
hooks journal under — `ecaSessionId()` in the adapter is
`chat_id ?? session_id ?? eca-pid-<ppid>`. If ECA sends its own *session*
id instead, the two still miss each other and the adapter has to change
its first choice, which trades per-chat granularity for per-session.

### What must stay

- `--agent claude-code`, and everything in
  [limitation #4](#4-host-aware-tools-speak-for-claude-code): there is
  still no ECA agent upstream.
- The `tool_use_id` forwarding — that is per-*call* uniqueness, and has
  nothing to do with the session id.
- The read policy, the network guard and the compat check.

### How to tell it landed

Call `ctx_resume` in a chat that has already done work. The line
`ctx_resume: no journal rows for this session yet.` disappearing is the
signal; the returned block's opening tag names the session it found.
