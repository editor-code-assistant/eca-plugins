# Updating Modern Web Guidance

Use a published tag from [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance/releases), the distribution repository. Do not copy from the `modern-web-guidance-src` branch: the release ships the rendered skills and the npm tarball ships the CLI and its guide catalog.

## Sync a release

1. Choose the new GitHub release tag. Confirm that its `package.json` version matches an exact version published to npm. Review the release notes, changes to both skills, and any changes to upstream licensing or CLI privacy, commands, and Node.js requirements.

   ```bash
   tag=$(gh release view --repo GoogleChrome/modern-web-guidance --json tagName --jq .tagName)
   version=${tag#v}
   work=$(mktemp -d)
   gh repo clone GoogleChrome/modern-web-guidance "$work/upstream" -- --depth 1 --branch "$tag"
   jq -er --arg version "$version" '.version | select(. == $version)' "$work/upstream/package.json"
   npm view "modern-web-guidance@$version" version engines.node dist.integrity
   ```

   Stop if the versions do not match or the package is not yet published. To use a specific release, set `tag` to that tag before calculating `version`.

2. Under `plugins/modern-web-guidance/`, replace `skills/chrome-extensions/` with the entire directory from the release. Remove any references that upstream removed. Replace `skills/modern-web-guidance/SKILL.md` with the released file and refresh `LICENSE` and any applicable notices. Do not copy `skills/modern-web-guidance/guides/`, the npm bundle, the upstream installer, or manifests and policies for other clients. If the new skill starts referencing local files directly, check which ones it needs before omitting them.
3. Reapply the ECA changes to `skills/modern-web-guidance/SKILL.md`. Pin **every** CLI invocation to `modern-web-guidance@<version>` and keep `DISABLE_TELEMETRY=1`, the PowerShell note, and ECA's normal shell approvals. Keep the new release's `--skill-version` value verbatim. This is a generated skill revision, not the npm package version. Keep the modification notice in the skill. Update the release link, npm version, and any changed requirements in `README.md`. The marketplace entry does not need a version-only edit: it maps the plugin name to the same local directory.

## Verify before publishing

With Node.js and `npx` available, check that a search for `light dismiss dialog` returns IDs, retrieve one of those IDs, and run the scanner against a small local CSS fixture. Set `skill_version` to the value in the new skill and `guide_id` to a result from the search:

```bash
DISABLE_TELEMETRY=1 npx -y "modern-web-guidance@$version" search "light dismiss dialog" --skill-version "$skill_version"
DISABLE_TELEMETRY=1 npx -y "modern-web-guidance@$version" retrieve "$guide_id"
mkdir "$work/fixture"
printf '%s\n' \
  '.custom-checkbox { appearance: none; opacity: 0; }' \
  '.custom-checkbox + label::before { content: ""; border: 2px solid #333; }' \
  > "$work/fixture/form.css"
DISABLE_TELEMETRY=1 npx -y "modern-web-guidance@$version" legacy-scan "$work/fixture" --json
```

Check that retrieval returns guide text (or a readable temporary file) and that the scanner reports a `checkbox` finding in `form.css`. If upstream changes the rule, adjust the fixture to exercise a supported pattern. Compare the vendored `chrome-extensions` directory to the upstream release and confirm its relative reference paths still resolve. Remove the temporary checkout and fixture when finished.

Test ECA against a local clone by merging this into the project's ECA config, using the absolute path to the root of the `eca-plugins` checkout:

```json
{
  "plugins": {
    "local": { "source": "/path/to/eca-plugins" },
    "install": ["modern-web-guidance@local"]
  }
}
```

Restart ECA. Check that `/modern-web-guidance` and `/modern-web-guidance:chrome-extensions` are available. Try loading web guidance for a dialog and a Chrome Extensions reference for a side panel. Remove the local test entry when done.

Once the update is in the official marketplace, existing installations can run `/plugin-update eca` and restart ECA. This advances the pin for the whole official marketplace, not just Modern Web Guidance.
