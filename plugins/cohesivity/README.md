# cohesivity

> Backend services for the apps you build with ECA: Postgres, Redis, object storage, hosting, auth and email through [Cohesivity](https://cohesivity.ai?ref=gh-eca-plugins)'s hosted MCP server, with no account or API key needed to start.

## What it does

- **MCP server**: connects ECA to `https://cohesivity.ai/mcp`, which gives the agent `cohesivity__*` tools to create a project, provision services and claim the project.
- **Skill**: tells the agent when to use those tools, to reuse the project's `.cohesivity` file instead of creating a second project, to read a service's docs before provisioning it, and to keep keys out of client code and commits.

When a task needs a database or a deploy, the agent loads the skill, creates a temporary project (it lasts 72 hours unless you claim it), provisions what the app needs and writes the credentials to `.cohesivity` in your project, gitignored.

## Install

```
/plugin-install cohesivity
```

Or in your config:

```javascript title="~/.config/eca/config.json"
{
  "plugins": {
    "install": ["cohesivity"]
  }
}
```

Restart ECA after installing.

## Tools

| Tool | Description |
|------|-------------|
| `cohesivity__create_tenant` | Create a temporary project and return its credentials |
| `cohesivity__provision_resource` | Provision a service (Postgres, Redis, object storage, hosting, ...) |
| `cohesivity__get_cohesivity_documentation` | Read the current docs for a service |
| `cohesivity__tenant_status` | Show the project's lifecycle, limits and services |
| `cohesivity__claim_tenant` | Get a link to claim the project and keep it |
| `cohesivity__give_feedback` | Report a problem with Cohesivity |

## Notes

- Creating a project, provisioning and claiming change external state. Keep ECA's approval prompts on for these tools if you want to confirm each one.
- When the tools are used, the requests the agent makes, such as which service to provision and the queries it runs, are sent to Cohesivity.
- Paid actions and plan upgrades always need your approval. See [pricing](https://cohesivity.ai/pricing?ref=gh-eca-plugins) and the [docs](https://cohesivity.ai/docs?ref=gh-eca-plugins).
