# context-mode

> ECA plugin for [context-mode](https://github.com/mksglu/context-mode) — saves context by routing large output through sandboxed execution, BM25-indexed search, and session continuity hooks.

## What it does

- **Sandboxed execution** — `ctx_execute` and `ctx_execute_file` run code in an isolated subprocess; only intentional stdout enters context
- **FTS5 knowledge base** — `ctx_batch_execute` auto-indexes command output; `ctx_search` retrieves only relevant chunks
- **Session continuity** — ECA hooks capture prompts/tool calls and preserve resume snapshots across compaction through this plugin's local adapter bridge
- **Routing policy** — rules and skills steer large shell/read/grep work toward sandbox tools; the `preToolCall` hook denies direct `curl`/`wget`-style fetches through `hooks/ctx-eca-adapter.mjs`

## Prerequisites

Install the `context-mode` npm package globally. The plugin supplies its own ECA hook adapter bridge, so it does not require an upstream ECA hook dispatcher.

With [mise](https://mise.jdx.dev/):

```toml
# ~/.config/mise/config.toml
[tools]
"npm:context-mode" = "latest"
```

Or globally:

```bash
npm install -g context-mode
```

The MCP server is started through `hooks/ctx-server.sh` so the package can keep its sandbox runtime setup intact.

## Commands

| Command | Description |
|---------|-------------|
| `/context-mode:ctx-stats` | Context savings — per-tool breakdown, token usage, savings ratio |
| `/context-mode:ctx-doctor` | Diagnose runtimes, hooks, FTS5, version |
| `/context-mode:ctx-upgrade` | Upgrade context-mode in place |
| `/context-mode:ctx-purge` | Permanently delete all indexed content from the knowledge base |

## Tools

| Tool | Description |
|------|-------------|
| `context-mode__ctx_execute` | Run code in a sandbox (JS, TS, Python, Shell, Ruby, Go, Rust, Perl) |
| `context-mode__ctx_execute_file` | Load a file into `FILE_CONTENT` and analyze it in a sandbox |
| `context-mode__ctx_batch_execute` | Run multiple commands, auto-index output, search results — one call |
| `context-mode__ctx_index` | Store file/directory content in the FTS5 knowledge base |
| `context-mode__ctx_search` | BM25 search across indexed content |
| `context-mode__ctx_fetch_and_index` | Fetch a URL, convert HTML to markdown, index for search |
| `context-mode__ctx_stats` | Context savings breakdown |
| `context-mode__ctx_doctor` | Diagnose runtimes, hooks, FTS5, version |
| `context-mode__ctx_upgrade` | Upgrade context-mode in place |
| `context-mode__ctx_purge` | Wipe the indexed knowledge base |

## ECA hooks

This plugin registers ECA-native hooks:

- `chatStart` — inject routing guidance and resume context
- `preRequest` — capture prompts and add lightweight guidance
- `preToolCall` — deny direct context-flooding fetches and route large work
- `postToolCall` — capture successful and failed tool results for continuity
- `preCompact` — persist a resume snapshot before compaction
- `postCompact` — inject the saved snapshot after compaction

ECA `sessionStart` output is not used for model context; startup context belongs in `chatStart`.

## Usage

Once installed, the MCP server works through `.mcp.json` and hook continuity works through `hooks/ctx-eca-adapter.mjs`. The rules guide the agent toward sandbox tools for operations that may produce large output.

**Check everything is working:**

```text
ctx doctor
```

**See context savings:**

```text
ctx stats
```

**After compaction:** `preCompact` saves a snapshot and `postCompact` injects it into ECA's compact summary, so the agent can continue with restored session context.

## Session continuity

Session history is searchable:

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_search(queries: ["summary"], sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode__ctx_search(queries: ["constraint"], source: "constraint")` |

## Think in Code

The core paradigm: write code that processes data and `console.log()` only the answer. Never read raw data into context.

```javascript
// Instead of eca__shell_command("gh pr list") → raw JSON floods context
context-mode__ctx_execute("javascript", `
  const { execSync } = await import('node:child_process');
  const prs = JSON.parse(execSync('gh pr list --json number,title,state --limit 20').toString());
  prs.forEach(p => console.log('#' + p.number + ' [' + p.state + '] ' + p.title));
`)
```
