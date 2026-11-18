# Modern Web Guidance

Use modern browser APIs with guidance on compatibility, accessibility, performance, and fallbacks. The plugin packages two skills from [GoogleChrome/modern-web-guidance v1.0.1](https://github.com/GoogleChrome/modern-web-guidance/releases/tag/v1.0.1).

## Install

Run `/plugin-install modern-web-guidance@eca` in ECA and restart ECA. If the plugin is missing from your pinned marketplace, run `/plugin-update eca` first.

## Use the skills

- **`/modern-web-guidance`**: Search and retrieve web platform guidance before implementing or updating HTML, CSS, or browser JavaScript. Try asking ECA to build a responsive dialog and explain its browser fallbacks. Ask for a broad modernization audit to run `legacy-scan`, which covers only patterns with scanner rules.
- **`/modern-web-guidance:chrome-extensions`**: Build or publish a Manifest V3 extension. Try asking ECA to add a side panel. The Chrome Extensions and Chrome Web Store references are included locally.

ECA can also select either skill automatically when a task matches. No commands, hooks, or permissions are added to ECA's configuration.

The `modern-web-guidance` skill needs Node.js 22+ and `npx`. It runs the pinned `modern-web-guidance@1.0.1` npm CLI, which includes the guide catalog, and sets `DISABLE_TELEMETRY=1`. The first run needs access to npm and follows ECA's normal shell approvals. The `chrome-extensions` skill does not need npm to read its references.

## Maintenance

See [UPDATING.md](https://github.com/editor-code-assistant/eca-plugins/blob/master/plugins/modern-web-guidance/UPDATING.md) for the upstream sync procedure. The imported files retain the upstream [license](https://github.com/GoogleChrome/modern-web-guidance/blob/v1.0.1/LICENSE) and attribution. The main skill is adapted for ECA's shell approvals, version pinning, and telemetry opt-out; the `chrome-extensions` skill and its references are unchanged.
