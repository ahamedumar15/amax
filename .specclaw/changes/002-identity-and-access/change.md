# Identity, roles and data scopes

**Change:** 002-identity-and-access · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/auth` · **Depends on:** [001](../001-amax-foundation/change.md)

## Problem

Every module needs to know who the user is, which roles they hold, which entity, department and projects they can see, and which fields are hidden from them. The adversarial review found a delivery manager could see everyone's pay; this change makes masking a platform rule, not a per-screen choice.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

The profile menu with View as (Admin only), the role chip, the restricted-view banner, and pay shown as •••• when hidden.

## Acceptance Criteria

1. **AC-1** Auth.js signs users in with OIDC, with Microsoft Entra ID as the first provider. Signed-out visitors are redirected to sign-in, and the header shows the user's name and roles.
2. **AC-2** Entra groups map to amax roles (Admin, Leadership, PM, Engineer, Finance, Sales, HR, Payroll, Employee) per tenant, stored in the `auth` schema; config only seeds the first tenant. A person can hold several roles. A user in no mapped group is denied access, and a test covers this.
3. **AC-3** `can(user, action, resource)` checks role permissions declared in module manifests and data scopes (legal entity, department, managed or assigned projects). Modules use it; they never check roles themselves.
4. **AC-4** Fields carry a sensitivity class (`pay`, `health`, `bank`, `performance`, `candidate`), and a policy per class names the roles that may see it (for example `health`: HR and the person; `bank`: Payroll and the person). Classified fields are masked in every read path (pages, contracts, MCP, chat, notifications, AI calls) unless the policy allows the user or the record is their own. A test reads a payslip as a PM through a page, a contract and MCP and gets masked values every time.
5. **AC-5** Navigation only shows screens the user's roles allow. Admins can use View as to preview another role, and the session records the original user.
6. **AC-6** User, Role assignment and GitIdentity tables live in the `auth` schema, with `tenant_id`.
7. **AC-7** The tenant is resolved from the OIDC issuer and tenant ID claim, never from the request. Each tenant has its own identity-provider settings, and a user from one tenant's directory can't sign in to another tenant (test).
8. **AC-8** SCIM provisioning creates, updates and deactivates users. Deactivation, or `hr.person.left`, revokes web sessions and MCP and API tokens within 5 minutes (test).
9. **AC-9** Service principals (for CI, specclaw and integrations) are first-class identities. Each has an owner, scopes, an expiry, and the people it may act for; a call outside those is refused and audited.

## Tasks

Assumptions (stated per Rule 1):
- Built on 003 (branch `specclaw/003-data-core`, PR #13): `auth` tables use 003's RLS, migrations and `defineService()`; `can()` is registered with 003's `setAuthorizer()`.
- Auth.js v5 (`next-auth@5.0.0-beta.32`, the current v5 line; it supports Next 16) with JWT sessions. Each JWT carries a session id; the `jwt` callback re-checks `auth.session` and the user every 60 s, which is how deactivation revokes web sessions within 5 minutes without a DB hit on every request.
- Multi-tenant sign-in: one Entra provider per tenant (`entra-<tenant>`), built lazily from `auth.identity_provider`. After the callback, the tenant is resolved only from the token's `iss` + `tid` (a `SECURITY DEFINER` lookup) and must match the provider used, so a user from tenant B's directory can't sign in through tenant A.
- Masked values are a `{ masked: true, class }` marker (not `null`, not a string), so types stay honest and the UI renders `••••`. Reads go through `defineQuery()`, the read twin of `defineService()`, so pages, contracts, MCP, chat, notifications and AI calls share one masking path.
- Without `DATABASE_URL` the app stays in today's guest preview (the live demo and 001's e2e keep working). With a database, sign-in is enforced; `AMAX_AUTH_DEMO=1` adds a fixtures-only "sign in as" provider for local and CI e2e, refused when `NODE_ENV=production`.
- Manifests declare `grants` (role → permissions); nav needs `<module>:read`. Admin has every permission; data scopes still apply to non-Admin roles.

- [x] `T1` — `auth` schema: migration for `auth.identity_provider` (issuer, tenant-id claim, client id, secret ref, SCIM token hash), `auth.role_mapping` (Entra group → role), `auth.user`, `auth.role_assignment` (role + data scope: legal entities, departments, projects), `auth.git_identity`, `auth.session` (original user, view-as role, revoked), `auth.api_token`, `auth.service_principal`; RLS on all; `auth.resolve_tenant(issuer, tid)` definer lookup; Drizzle schema; first-tenant seed from config (`AMAX_SEED_TENANT_*`) (AC-6, AC-2, AC-7)
  Kind: migration
  Files: packages/db/migrations/0004_auth.sql, packages/auth/src/{schema,roles,seed}.ts, packages/auth/tests/schema.test.ts
- [x] `T2` — Policy engine: roles, `grants` in manifests, `can(user, action, resource)` with data scopes (entity, department, managed or assigned projects, own record), registered via `setAuthorizer()`; sensitivity classes and per-class policy (`pay`: Payroll, Admin + self; `health`: HR + self; `bank`: Payroll + self; `performance`: HR, Leadership, manager + self; `candidate`: HR, recruiters); `mask()` and `defineQuery()`; test that a PM reading a payslip through a page loader, a contract function and an MCP handler gets masked values every time, while Payroll and the employee see them (AC-3, AC-4)
  Kind: impl
  Files: packages/auth/src/{can,sensitivity,query}.ts, packages/core/src/module.ts, packages/auth/tests/ac3-can.test.ts, packages/auth/tests/ac4-masking.test.ts
  Depends: T1
- [x] `T3` — Sign-in: Auth.js config with per-tenant Entra providers, tenant resolution from `iss` + `tid`, group → role mapping (no mapped group = denied), user upsert, `auth.session` row, 60 s revalidation in the `jwt` callback, demo provider; `proxy.ts` redirects signed-out visitors to `/signin`; `getViewer()` for server code; tests for cross-tenant refusal, unmapped-group denial and redirect (AC-1, AC-2, AC-7)
  Kind: impl
  Files: packages/auth/src/{authjs,tenant,viewer}.ts, apps/web/auth.ts, apps/web/proxy.ts, apps/web/app/signin/page.tsx, apps/web/app/api/auth/[...nextauth]/route.ts, packages/auth/tests/ac1-signin.test.ts, packages/auth/tests/ac7-tenant.test.ts
  Depends: T2
- [x] `T4` — Shell: profile menu with the user's name, role chip and Sign out; View as (Admin only) stored on the session with the original user kept; restricted-view banner; nav filtered by `can(viewer, '<module>:read')`; `Pay`/`Masked` UI rendering `••••`; e2e with the demo provider (AC-1, AC-5)
  Kind: impl
  Files: apps/web/components/shell/{ProfileMenu,Shell,ViewBanner}.tsx, apps/web/app/(app)/layout.tsx, apps/web/lib/registry.ts, apps/web/app/actions/view-as.ts, packages/ui/src/components/Masked.tsx, apps/web/tests/e2e/auth.spec.ts
  Depends: T3
- [x] `T5` — SCIM 2.0 `/api/scim/v2/Users` (create, get, list/filter, replace, patch, delete) with a per-tenant bearer token; deactivation, delete or an `hr.person.left` event revokes the user's sessions, API tokens and MCP tokens; test that a deactivated user's session and tokens stop working within 5 minutes (AC-8)
  Kind: impl
  Files: packages/auth/src/{scim,revoke}.ts, apps/web/app/api/scim/v2/Users/route.ts, apps/web/app/api/scim/v2/Users/[id]/route.ts, packages/auth/tests/ac8-scim.test.ts
  Depends: T3
- [x] `T6` — Service principals: create with owner, scopes, expiry and acts-for people; hashed bearer tokens; `authenticateToken()` for users' API/MCP tokens and principals; a call outside scope, past expiry or for someone not in acts-for is refused and audited (AC-9)
  Kind: impl
  Files: packages/auth/src/principals.ts, packages/auth/tests/ac9-principals.test.ts
  Depends: T2
- [x] `T7` — Email + password sign-in (added 2026-10-17 at the product owner's request: the hosted environment uses basic sign-in, no Entra): per-deployment password provider, scrypt hashes, lockout after 5 failures, admin CLI for tenants, users, deactivation and SCIM tokens (AC-1, AC-2)
  Kind: impl
  Files: packages/db/migrations/0005_password_auth.sql, packages/auth/src/password.ts, packages/auth/bin/admin.ts, packages/auth/tests/password.test.ts
  Depends: T3

## Verify

**Verdict:** PASS
- AC-1: pass — `packages/auth/tests/ac1-signin.test.ts` (gate: signed-out → `/signin?next=…`, public endpoints pass) and `apps/web/tests/e2e/auth.spec.ts`: sign-in lands on the requested page; the header shows name, role chip and all roles; axe clean. Email + password sign-in (T7) e2e: wrong password shown on `/signin`, right one signs in, no Microsoft button without a provider.
- AC-2: pass — `ac7-tenant.test.ts`: Entra groups map to roles per tenant (several roles per person), group changes resync on sign-in while manual roles stay; a user in no mapped group is denied. First-tenant seed from config only (`schema.test.ts`).
- AC-3: pass — `ac3-can.test.ts`: manifest grants, `@managed`/`@assigned`/`@own`, legal-entity and department scopes (Admin included); `installAuthorizer()` makes `defineService()` authorize with `can()`.
- AC-4: pass — `ac4-masking.test.ts`: a PM reading payslips through a page loader, a contract function and an MCP handler gets masked pay and bank every time; Payroll sees them only for its legal entity; the employee sees their own. Policy per class matches the AC (`health`: HR + self; `bank`: Payroll + self).
- AC-5: pass — e2e: nav and module routes need `<id>:read`; Admins get View as (chip and banner change, stored on the session with the real user kept); non-Admins don't.
- AC-6: pass — nine `auth` tables with `tenant_id`, all RLS-forced (`schema.test.ts`, `tablesMissingRls()`).
- AC-7: pass — `ac7-tenant.test.ts`: tenant resolved only from `iss` + `tid`; B's directory can't sign in through A; forged issuer unknown; per-tenant provider settings.
- AC-8: pass — `ac8-scim.test.ts`: SCIM create/list/get/replace/patch (Entra and Okta shapes)/delete; deactivation, delete or `hr.person.left` revokes sessions and API/MCP tokens in the same transaction (audited); the browser JWT is refused at its next 60-second check, well inside 5 minutes.
- AC-9: pass — `ac9-principals.test.ts`: principals have an owner, scopes, a 1–365-day expiry and acts-for people; outside scopes, not on the list, the person lacking the permission, expired or revoked: refused, and refusals are audited.

Commands (all exit 0, with `DATABASE_MIGRATE_URL` set): `pnpm test` (103 tests), `pnpm lint`, `pnpm build`, `pnpm --filter @amax/web e2e`, `pnpm --filter @amax/web e2e:auth` (5 signed-in flows), `build:cloudflare`, `node scripts/check-graph.mjs`, `node scripts/check-module-standard.mjs`.

Notes:
- Entra's `groups` claim must be enabled on the app registration; users in more than 200 groups get an overage claim instead, which this change doesn't follow (Graph lookup is a follow-up).
- Client secrets are `env:NAME` references until 031.
- OpenNext runs Node.js middleware (the proxy) on Cloudflare as experimental.
