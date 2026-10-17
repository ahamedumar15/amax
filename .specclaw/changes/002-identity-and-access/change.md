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

## Verify
