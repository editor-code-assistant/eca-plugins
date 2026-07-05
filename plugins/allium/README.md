# Allium 🧅

Give ECA durable behavioural intent that does not drift with the conversation and persists across sessions.

## What is Allium?

[Allium](https://juxt.github.io/allium/) is a behavioural specification language for capturing what software is meant to do, not just what the code currently does. It gives system intent a durable, structured form so ECA can preserve constraints across sessions, surface ambiguity, and notice when implementation and intent diverge.

Allium has no compiler or runtime — it is a specification artefact interpreted by LLMs and humans. The optional [Allium CLI](https://github.com/juxt/allium-tools) adds parser-backed validation and analysis.

## Install the CLI (recommended)

The plugin works without the CLI, but automatic validation and analysis require the `allium` command to be available in `PATH`. Installation instructions are at [juxt/allium-tools](https://github.com/juxt/allium-tools).

## First steps

Start with `/allium` if you are not sure which workflow you need. It gives ECA the Allium syntax summary and routes you toward the right skill.

If you are designing a new feature, start with `/allium:elicit`. ECA will ask structured questions about the boundary, actors, lifecycle states, triggers, edge cases, and open questions, then help turn the answers into a `.allium` specification.

If you already have code and want to capture what it does, use `/allium:distill`. ECA will inspect the implementation, separate domain behaviour from implementation details, and draft a behavioural spec that can be reviewed and refined.

Once a spec exists, use `/allium:tend` for targeted changes, `/allium:weed` to compare the spec with the implementation, and `/allium:propagate` to turn the spec into test obligations or concrete tests.

What to expect: Allium does not replace implementation or tests. It gives ECA a durable behavioural model of what the system is meant to do, so future sessions can reason about intent, spot missing decisions, catch spec-code drift, and generate better tests from explicit behaviour.

## First steps

Start with `/allium` if you are not sure which workflow you need. It gives ECA the Allium syntax summary and routes you toward the right skill.

If you are designing a new feature, start with `/allium:elicit`. ECA will ask structured questions about the boundary, actors, lifecycle states, triggers, edge cases, and open questions, then help turn the answers into a `.allium` specification.

If you already have code and want to capture what it does, use `/allium:distill`. ECA will inspect the implementation, separate domain behaviour from implementation details, and draft a behavioural spec that can be reviewed and refined.

Once a spec exists, use `/allium:tend` for targeted changes, `/allium:weed` to compare the spec with the implementation, and `/allium:propagate` to turn the spec into test obligations or concrete tests.

What to expect: Allium does not replace implementation or tests. It gives ECA a durable behavioural model of what the system is meant to do, so future sessions can reason about intent, spot missing decisions, catch spec-code drift, and generate better tests from explicit behaviour.

## Plugin components

### Skills (6)

Plugin skills are namespaced by ECA. Invoke them as:

| Skill | Purpose |
|-------|---------|
| `/allium` | Entry point — syntax summary, routing table, quick reference |
| `/allium:elicit` | Build a spec through structured conversation with stakeholders |
| `/allium:distill` | Extract a spec from an existing codebase |
| `/allium:tend` | Edit and update existing specs |
| `/allium:weed` | Check spec-to-code alignment, find and resolve divergences |
| `/allium:propagate` | Generate tests from specifications |

### Agents (2)

| Agent | Purpose |
|-------|---------|
| `tend` | Subagent for editing `.allium` spec files (read, search, edit, write, shell) |
| `weed` | Subagent for checking spec-code alignment (read, search, edit, write, shell) |

### Rules (1)

| Rule | Scope | Purpose |
|------|-------|---------|
| `allium` | `**.allium` files | Syntax distinctions, anti-patterns, and key conventions — loaded on-demand when editing `.allium` files |

### Hooks (1)

| Hook | Trigger | Purpose |
|------|---------|---------|
| `allium.check-spec` | ECA `write_file`/`edit_file` on `.allium` files | Runs `allium check` automatically when the CLI is installed and returns diagnostics to the model as additional context |

### References (7)

Full language reference, 9 worked patterns, test generation taxonomy, migration guides, and skill-specific examples.

## Usage

Invoke skills with their ECA plugin names (for example `/allium`, `/allium:elicit`, `/allium:tend`) or ask ECA to use the `tend` or `weed` subagent.

The `allium` rule is path-scoped — it's automatically fetched when you work with `.allium` files. The `allium.check-spec` hook is a post-edit safety net: if the CLI is installed, diagnostics appear as `<additionalContext from="allium.check-spec">...` after ECA writes or edits a `.allium` file.

## Upstream sync

This plugin was ported from the upstream Allium repository. For reproducibility and auditing, the last upstream commit used as a reference for this port is recorded below:

- Repository: [juxt/allium](https://github.com/juxt/allium)
- Commit: `8af2da4e557560277b6621e09785b63f5c262fb9`
- Author: yavorpanayotov
- Date: 2026-06-19 17:59:41 +0300
- Message: Bump plugin version to 3.4.0 (#50)

If you update the plugin from upstream in future, please update this section with the new commit hash and date.

## Credits

Based on [Allium](https://github.com/juxt/allium) by JUXT. Licensed under the same terms as the upstream repository.
