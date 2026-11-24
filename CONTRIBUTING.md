# Contributing to ECA Plugins

Thank you for your interest in contributing to the ECA plugin marketplace! This guide walks you through the process of submitting a new plugin.

## Plugin structure

Each plugin lives under `plugins/<plugin-name>/` and can provide any combination of:

```
plugins/my-plugin/
├── skills/              # Skill directories (each subfolder is a skill)
│   └── my-skill/
│       └── SKILL.md
├── agents/              # Agent definitions (Markdown files)
│   └── my-agent.md
├── commands/            # Custom commands (Markdown files)
│   └── my-command.md
├── rules/               # Rule files applied to conversations
│   └── my-rule.md
├── hooks/               # Hook definitions
│   └── hooks.json
├── modules/             # ECA modules, in Clojure (ECA 0.172.0+)
│   └── my_plugin.clj
├── .mcp.json            # MCP server definitions
├── eca.json             # Arbitrary config overrides
└── README.md            # Documentation (displayed on the marketplace website)
```

You don't need all of these — include only the components your plugin provides.

## Adding a plugin

### 1. Create the plugin directory

```bash
mkdir -p plugins/my-plugin
```

### 2. Add your plugin components

Add the files for your plugin (skills, agents, rules, etc.) following the structure above.

### 3. Add a README

Create `plugins/my-plugin/README.md` describing what your plugin does, how to use it, and any configuration options.

### 4. Register in the marketplace

Add an entry to `.eca-plugin/marketplace.json`:

```json
{
  "name": "my-plugin",
  "description": "A short description of what your plugin does",
  "source": "plugins/my-plugin",
  "category": "Development",
  "tags": ["relevant", "tags"],
  "author": "Your Name",
  "icon": "🔧"
}
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique plugin identifier (kebab-case) |
| `description` | Yes | Short description (one sentence) |
| `source` | Yes | Path to the plugin directory (relative to repo root) |
| `category` | Yes | One of: `Development`, `Productivity`, `Workflow`, `Security`, `Documentation`, `DevOps` |
| `tags` | Yes | Array of relevant tags for search/filtering |
| `author` | Yes | Author name or organization |
| `icon` | No | Emoji icon for the plugin card |
| `featured` | No | Set to `true` for featured plugins (maintainers only) |

### 5. Open a pull request

Submit a PR with your plugin. We'll review it for:

- **Usefulness** — Does it provide value to ECA users?
- **Quality** — Are the skills/agents/rules well-written?
- **Safety** — Does it follow responsible AI practices?
- **Documentation** — Is the README clear and helpful?

## Guidelines

### Hook scripts

- **Namespace hook keys** with `<plugin-name>.<hook-name>` (e.g., `secret-guard.scan`, `pomodoro.check`). This avoids collisions when multiple plugins are installed.
- **Reference plugin files with `${plugin:root}`**, e.g. `"file": "${plugin:root}/hooks/check.sh"`. ECA resolves a relative `file` against the user's first workspace root, not the plugin directory, so `"file": "check.sh"` fails with "Hook file not found".
- **Read stdin** even when you don't need the input (`cat > /dev/null`), so ECA can finish writing it.
- **Speak through JSON output.** Plain text on stdout only shows in the hook's block in the chat and never reaches the model, and a visible hook shows a block on every run. Prefer `"visible": false`, and print `{"systemMessage": "..."}` only when there's something to tell the user. To act on the call, use the output fields in [ECA's hooks docs](https://eca.dev/config/hooks/), like `approval` or `additionalContext`.
- Hook scripts that need to parse JSON should use [`jq`](https://jqlang.github.io/jq/), which is expected as a runtime dependency. If your hook relies on `jq`, check for its availability at the start and degrade gracefully with a clear error message if it's missing.

### Modules

A [module](https://eca.dev/config/modules/) is Clojure code that ECA runs itself, with [SCI](https://github.com/babashka/sci). Reach for one when skills, rules and hooks aren't enough: state kept between events, decisions made without shelling out to `bash` and `jq` (so they work on Windows too), settings users configure, or tools and commands with logic. `secret-guard` is the reference plugin: its module replaces its hook.

- **Layout**: `modules/<name>.clj` is a file module. `modules/<name>/module.clj` is a folder module, whose other namespaces load from the folder, like `acme.jira.client` from `modules/<name>/acme/jira/client.clj`.
- **Names**: give the module the id `:eca-plugins/<plugin-name>`, whose name part prefixes the module's tools and commands, and the namespace `eca-plugins.<plugin-name>`. All modules share one SCI context, so namespaces must be unique. `:eca/*` ids are reserved for ECA's own modules.
- **Config**: declare your keys in `:config-spec`, under one camelCase key named after the plugin (e.g. `secretGuard`), since module keys live at the root of the user's config. Document them in the README.
- **Older ECA versions**: modules need ECA 0.172.0 or later, and older versions ignore `modules/` without a warning. When a module replaces a hook, keep the hook for them, and drop it from the config in the module's `:config/resolve` handler, so exactly one of them runs. If the user disables the module, the hook comes back. Plugin hooks are named `<plugin-name>::<hook-key>` in the config.
- **Sandbox**: modules get `eca.api`, `babashka.fs`, `cheshire.core`, `clojure.string`, `clojure.set`, `clojure.walk`, `clojure.edn`, `slurp` and `spit`, and Java interop on basic classes only, like `String`, `Integer`, `Double` and `Exception`. There's no `System`, `Math`, `Thread`, `java.io.File`, `java.util.Date` or `java.time`: no clock, and no environment variables. For the latter, give a config key a default like `"${env:MY_VAR}"`. Run commands with `eca/shell!` and HTTP requests with `eca/http`.
- **Testing**: install the plugin from a local source (see [Testing locally](#testing-locally)). ECA reloads a module a few seconds after you save it, and `/modules` shows whether it's active, or why it failed to load. To test a module's handlers outside an ECA session, use `eca.api.test` (`mock-ctx`, `run-event`, `run-tool`, `run-command`, `recorded`).

### General

- Keep plugin names short and descriptive (kebab-case)
- Write clear, concise skill/agent prompts
- Include examples in your README
- Test your plugin locally before submitting (add it as a local source in your ECA config)
- One plugin per PR unless they're closely related

## Testing locally

You can test your plugin by pointing ECA to your local clone:

```json
{
  "plugins": {
    "local": { "source": "/path/to/eca-plugins" },
    "install": ["my-plugin"]
  }
}
```

To test changes to an existing plugin, install it as `name@local` (e.g. `secret-guard@local`): the official marketplace has a plugin with the same name, and ECA rejects ambiguous names. After a restart, `/hooks` and `/modules` show what ECA loaded from your plugin.

## Questions?

Open an issue or reach out on [Slack](https://join.slack.com/t/eca-dev/shared_invite/zt-34p6n16s1-_MwEJMr2F~gD2ol4gzntqw).
