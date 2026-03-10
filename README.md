# ECA Plugins

The official plugin marketplace for [ECA](https://eca.dev) — browse, discover, and install community plugins.

**🌐 [plugins.eca.dev](https://plugins.eca.dev)**

## What is this?

This repository serves two purposes:

1. **Plugin source** — A git repository that ECA clones to resolve plugins. It contains the plugin registry (`.eca-plugin/marketplace.json`) and the plugin directories under `plugins/`.
2. **Marketplace website** — A static webapp hosted at [plugins.eca.dev](https://plugins.eca.dev) via GitHub Pages, built with [Astro](https://astro.build).

## Using plugins

ECA includes this marketplace as a built-in plugin source. To install a plugin, add its name to your `config.json`:

```json
{
  "plugins": {
    "install": ["code-review", "conventional-commits"]
  }
}
```

Or use the `/plugin-install` command inside ECA to browse and install interactively.

## Contributing a plugin

We welcome community contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

In short:

1. Create a directory under `plugins/your-plugin-name/`
2. Add your plugin components (skills, agents, rules, commands, hooks, MCP servers, config)
3. Add an entry to `.eca-plugin/marketplace.json`
4. Open a pull request

## Development

To run the marketplace website locally:

```bash
cd website
npm install
npm run dev
```

The site will be available at `http://localhost:4321`.

To build for production:

```bash
cd website
npm run build
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
