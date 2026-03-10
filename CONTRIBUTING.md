# Contributing to ECA Plugins

Thank you for your interest in contributing to the ECA plugin marketplace! This guide walks you through the process of submitting a new plugin.

## Plugin structure

Each plugin lives under `plugins/<plugin-name>/` and can provide any combination of:

```
plugins/my-plugin/
├── skills/              # Skill directories (each subfolder is a skill)
│   └── my-skill/
│       └── my-skill.md
├── agents/              # Agent definitions (Markdown files)
│   └── my-agent.md
├── commands/            # Custom commands (Markdown files)
│   └── my-command.md
├── rules/               # Rule files applied to conversations
│   └── my-rule.md
├── hooks/               # Hook definitions
│   └── hooks.json
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
- Hook scripts that need to parse JSON should use [`jq`](https://jqlang.github.io/jq/), which is expected as a runtime dependency. If your hook relies on `jq`, check for its availability at the start and degrade gracefully with a clear error message if it's missing.

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

## Questions?

Open an issue or reach out on [Slack](https://join.slack.com/t/eca-dev/shared_invite/zt-34p6n16s1-_MwEJMr2F~gD2ol4gzntqw).
