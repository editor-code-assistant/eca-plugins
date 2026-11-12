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
  See also [Limitation #1](#1-_metasessionid-is-version-gated)

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

(1) See [Limitation #2](#2-session-statistics-are-split-on-older-eca)

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

(1) See [Limitation #1](#1-_metasessionid-is-version-gated)

(2) See [Limitation #2](#2-session-statistics-are-split-on-older-eca)

(3) See [Limitation #3](#3-ctx_purgesession--needs-eca-01711)

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
| What were we working on? | `context-mode__ctx_resume` |
| … if `ctx_resume` reports no rows | `context-mode__ctx_search(sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision")` |
| What went wrong? | `context-mode__ctx_search(queries: ["error"], sort: "timeline")` |

After compaction the plugin injects the resume snapshot through ECA's
`postCompact` `additionalContext`, so the model does not have to ask for
it. `ctx_resume` and `ctx_search(scope: "session")` need ECA to forward
the chat id as `_meta.sessionId`, which it does from 0.171.1 — see
[ECA version and `_meta.sessionId`](#eca-version-and-_metasessionid).

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

### 1. `_meta.sessionId` is version-gated
   ECA sends the chat id as `_meta.sessionId` on MCP `tools/call` from
   0.171.0, and reports `eca_version` in the hook payload from 0.171.1.
   The adapter keys on that version (`ecaSessionIdSince` in
   `hooks/validated-versions.json`, default `0.171.1`):

   - On 0.171.1 and later the server journals its own calls under the
     chat id, so `ctx_resume`, `ctx_search(scope: "session")` and
     `ctx_purge(session: …)` work, and v2's `ctx_resume` hint is left as
     written.
   - On older ECA the server falls back to a process-local `mcp:<uuid>`,
     so the hint is rewritten to `ctx_search(sort: "timeline")` and the
     session-scoped tools find only the hook-journaled rows.

   `CONTEXT_MODE_ECA_SESSION_ID=on|off` overrides the decision, which is
   what the self-check uses to exercise both branches.
### 2. Session statistics are split on older ECA
   On ECA before 0.171.1 the server's own tool calls are journaled under
   `mcp:<uuid>` — a new id per server process — while the hook rows sit
   under chat ids, so `ctx_stats`'s per-session view is fragmented. On
   0.171.1 and later both use the chat id and the view is whole. Per-tool
   and per-project totals are correct either way.
### 3. `ctx_purge(session: …)` needs ECA 0.171.1+
   It targets the chat id, which only reaches the server from 0.171.1.
   On older ECA use `project: true` or `source:`.
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
- Set `CONTEXT_MODE_ECA_SESSION_ID=on|off` to force whether the adapter
  treats ECA as forwarding `_meta.sessionId` (testing, see
  [limitation #1](#1-_metasessionid-is-version-gated)).
- If hooks do nothing, check that `context-mode` is on `PATH` — the
  plugin no-ops silently when it is not installed.

## ECA version and `_meta.sessionId`

ECA 0.171.0 started sending the chat id as `_meta.sessionId` on MCP
`tools/call` (#696); 0.171.1 also reports `eca_version` in every hook
payload (#697), so it is the first release this plugin can recognise.
The adapter uses that version to decide whether context-mode's
`ctx_resume` hint is accurate:

- `eca_version` ≥ `ecaSessionIdSince` (`hooks/validated-versions.json`,
  `0.171.1`) → the server journals under the chat id, so the hint is left
  as context-mode wrote it and `ctx_resume` works.
- older ECA, or no `eca_version` at all → the hint is rewritten to
  `context-mode__ctx_search(sort: "timeline")`, which works either way.

`CONTEXT_MODE_ECA_SESSION_ID=on|off` overrides the decision, which is
what the self-check uses to exercise both branches.

The value ECA sends is the **chat id** — the same id the hooks journal
under (`sessionId()` in the adapter is
`chat_id ?? session_id ?? eca-pid-<ppid>`), so the two line up.
