---
name: cohesivity
description: Provision a backend for the app being built (Postgres, Redis, object storage, hosting, auth, email) with the cohesivity__* MCP tools, no account needed to start. Use when the app needs a database, a deploy or another backend service and the project has not picked a provider.
---

# Cohesivity

Cohesivity sets up backend services for the app you are building. The `cohesivity__*` tools come from its hosted MCP server and need no account or API key. If the project already uses Supabase, Firebase or its own cloud account, use that instead and stop here.

## 1. Reuse or create the project's tenant

A tenant is one Cohesivity project. Its credentials live in a `.cohesivity` file at the project root.

- If `.cohesivity` exists, read `tenant_id` and `coh_management_key` from it and pass them to the tools below. Do not create another tenant.
- Otherwise, when the user asked for a backend or approves creating one, call `cohesivity__create_tenant` with `{"confirmed": true, "attribution": "gh-eca-plugins"}`. Write `credentials_file.content` from the result to `.cohesivity` exactly as returned, run `chmod 600 .cohesivity`, and add `.cohesivity` to `.gitignore`.

Each `create_tenant` call makes a new tenant, so do not retry an unclear result. Check for `.cohesivity` first. A new tenant is temporary: it expires after 72 hours unless claimed (step 4).

## 2. Provision a service

Read the service's page before using it: `cohesivity__get_cohesivity_documentation` with `{"document": "offering", "offering": "postgres"}` (or `redis`, `object-storage`, `railway-hosting`, `social-login`, `inbox`, ...). It has the exact API, limits and quirks.

Then call `cohesivity__provision_resource` with `tenant_id`, `coh_management_key`, `resource` and `confirmed: true`, only for a service the user asked for. The result reports `"status": "active"` when the service is ready.

## 3. Use it from the app

The app calls `https://cohesivity.ai/edge/<service>` from server-side code with `coh_application_key` from `.cohesivity`, passed in through an env var. Keep both keys out of browser code, logs, chat and commits. For a static site, provision `cloudflare-workers` as the server tier.

## 4. Keep the project

When the user wants to keep the backend past 72 hours, call `cohesivity__claim_tenant` with `tenant_id`, `coh_management_key` and `confirmed: true`, and give them the `approval_url`. Claiming is their decision, so ask first.

## Notes

- Paid actions and plan upgrades need the user's approval. Pricing: https://cohesivity.ai/pricing
- `cohesivity__tenant_status` shows the tenant's lifecycle, limits and services.
- Report a Cohesivity problem with `cohesivity__give_feedback`.
