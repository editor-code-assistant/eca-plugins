# AGENTS.md

## Build & Dev
- Website only: `cd website && npm run dev` / `npm run build` / `npm run preview`
- No test framework or linter is configured in this repo.

## Project Layout
- `plugins/` — Plugin definitions (Markdown, JSON, shell scripts, Clojure modules). No JS/TS here, except allium's upstream-synced hooks.
- `website/` — Astro 5 static site (marketplace UI). All code lives in `website/src/`.
- `.eca-plugin/marketplace.json` — Plugin registry read at build time.

## Code Style (website)
- **Formatting**: 2-space indent, semicolons, single quotes in JS/TS, double quotes in HTML attributes.
- **Imports**: Named imports for libraries, default for local `.astro` components. Use `node:` prefix for Node built-ins. Order: third-party → local components → styles → data.
- **Naming**: camelCase variables/functions, PascalCase interfaces, BEM-style CSS classes (`filter-pill--active`).
- **Types**: `interface` for props/data shapes. Type inference preferred over explicit return types.
- **Error handling**: Guard clauses, try/catch with silent fallback, graceful degradation.
- **No JS frameworks** — vanilla JS in `<script>` tags, scoped `<style>` per component.

## Shell Scripts (plugins)
- Always start with `set -euo pipefail`. Use `|| true` for optional commands.
- In `hooks.json`, reference plugin files as `${plugin:root}/hooks/...`: ECA resolves relative hook paths against the user's workspace.
- Read stdin even if unused, and talk to the user with JSON `systemMessage` from an invisible hook, not plain stdout (see CONTRIBUTING.md).

## Modules (plugins)
- Clojure run by ECA (SCI, ECA 0.172.0+), in `plugins/<name>/modules/`. Id `:eca-plugins/<plugin-name>`, ns `eca-plugins.<plugin-name>`, config under one camelCase key named after the plugin.
- No `System`, `java.time`, `Math` or `java.io.File` in the sandbox: no clock, no env vars. Use `eca.api` (`eca/shell!`, `eca/http`, `eca/notify!`), `babashka.fs`, `cheshire.core`.
- `plugins/secret-guard/modules/secret_guard.clj` is the reference, including how a module replaces its plugin's hook (`:config/resolve`).
