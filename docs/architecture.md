# amax architecture

Two goals drive every choice here:
- **Simple to deploy anywhere:** Vercel, Cloudflare or k3s.
- **Modular enough** that separate teams, and separate agent runs, can build modules in parallel without stepping on each other.

## Runtime: one app, one database

```
            ┌──────────────── apps/web (Next.js 16) ─────────────────┐
browser ──► │ pages · server actions · /api/mcp · /api/chat · /api/jobs │ ──► Postgres
agents  ──► │        module registry (loads every module)              │ ──► S3-compatible files
            └──────────────────────────────────────────────────────────┘
                     ▲ scheduler calls runDueJobs() every minute
```

| Concern | Choice | Why it travels well |
|---|---|---|
| Web | Next.js 16, App Router, `output: "standalone"` | One build output: Vercel serves it natively, Cloudflare runs it through the OpenNext adapter, and k3s runs it as a Docker image |
| Database | Postgres through **Drizzle ORM** with the `postgres` driver | Works in Node and on Cloudflare Workers (via Hyperdrive); Neon, Supabase, RDS and an in-cluster Postgres all just work |
| Auth | Auth.js (NextAuth v5) with OIDC; Microsoft Entra ID is the first provider | Google Workspace and Okta work later through the same code path |
| Files | An S3 API | AWS S3, Cloudflare R2, or MinIO on k3s |
| Background work | Jobs are plain functions in modules. `runDueJobs()` is triggered by Vercel Cron, a Cloudflare Cron Trigger, or a `worker` Deployment on k3s that calls it in a loop | No queue product to run; job state lives in Postgres (`core.job`) |
| Events between modules | Transactional outbox (`core.event`), processed by `runDueJobs()` | No message broker required |
| Config | Environment variables only, validated at boot | The same config works on every host |
| Deploy artifacts | `vercel.json`, `wrangler.jsonc` (OpenNext), `Dockerfile` and `deploy/helm/amax` | CI builds all three on every pull request |

Rule: **no host-specific APIs in module code.** Anything that depends on the host (files, scheduling, environment) goes through `packages/core` adapters.

## Repository layout

```
apps/
  web/                 Next.js app: layout, shell, the module mount point, API routes
packages/
  core/                tenancy, entities, currency, service pipeline, audit, outbox, jobs, adapters
  db/                  Drizzle client, migration runner (runs each module's migrations in order)
  auth/                Auth.js config, roles, data scopes, field masking, the "View as" helper
  ui/                  design tokens (CSS variables), components (cards, tables, chips, charts, chat bubbles)
  mcp/                 MCP server; modules register tools here
  chat/                amax chat engine; modules register intents here
  agents/              suggestions (evidence, confidence, approve, undo), the agent run model
  testing/             fixtures loader, contract tests, a11y and visual-diff helpers
modules/
  delivery/  time/  allocations/  hr/  leave/  onboarding/  payroll/  payroll-lk/  payroll-au/
  finance/  expenses/  accounting/  presales/  it-access/  helpdesk/  recruitment/  learning/
  insights/  reports/  inbox-agent/  keyflow/
deploy/
  helm/amax/           web Deployment, worker Deployment, Ingress, Postgres optional (bitnami subchart)
```

## The module contract

Every module is a workspace package (`@amax/<name>`) with the same shape:

```
modules/hr/
  module.ts            manifest: id, nav entries, roles and permissions, routes, MCP tools,
                       chat intents, jobs, events it emits and handles, fixtures
  db/schema.ts         tables in its own Postgres schema (hr.employee, hr.document …)
  db/migrations/       its own migrations, which only touch its own schema
  server/              services, built with core's pipeline: authorize → validate → write → audit → emit
  actions.ts           server actions for its screens (they call the services)
  mcp.ts               MCP tools (they call the same services)
  chat.ts              chat intents: fields, prompts, the create call
  ui/                  React screens and components, built only from @amax/ui
  contracts.ts         the only thing other modules may import: types, read functions, event names
  fixtures/            demo data for this module (it reads shared people and projects from core fixtures)
  tests/
```

- **Mounting:** `apps/web/app/(app)/[module]/[[...path]]/page.tsx` resolves the route through the registry. Adding a module means one line in `apps/web/modules.ts`; nothing else in the app changes.
- **Boundaries** are enforced by an ESLint import rule plus a CI check:
  - A module may import `@amax/core`, `@amax/ui`, `@amax/auth`, `@amax/db` and other modules' `contracts.ts`, and nothing else.
  - For example, `payroll` reads leave through `@amax/leave/contracts`, never through `leave/db`.
- **Data ownership:**
  - A module writes only its own schema.
  - Cross-module reads go through contract functions, which apply the caller's data scope.
  - Cross-module reactions go through events. Example: `hr.person.left` makes `it-access` revoke access as a suggestion that someone must approve.
- **Every write** goes through the service pipeline, so every path (UI, MCP, chat, agent, pipeline) gets the same permission check and the same audit record.
- **Ownership:** `CODEOWNERS` maps each `modules/<name>/` folder to its team (HR team → `hr`, `leave`, `onboarding`; IT department → `it-access`, `helpdesk`; and so on). The platform team owns `packages/` and `apps/web`.

## Parallel development, for teams and agent runs

- Each specclaw change names the module it touches and its **Depends on** list (see `.specclaw/STATUS.md` and the roadmap).
- Changes with no unmet dependency can be built at the same time. specclaw uses `worktree-per-change`, so each agent run works in its own git worktree and branch.
- Module changes only touch their own `modules/<name>/` folder plus one line in `apps/web/modules.ts`, so merge conflicts are rare and trivial.
- **Contract-first:** when module B needs something from A, A's change publishes the contract (types plus a stub) first, so B can build against it before A finishes.

## Static mock

The GitHub Pages site (`app/` at the repo root today) only hosts the interactive mock. When change 001 lands, the real app moves into `apps/web`. The mock site then becomes `apps/mock` (static export), separate from the deployable product.
