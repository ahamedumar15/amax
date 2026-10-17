# Delivery: projects, proposals and releases

**Change:** 007-delivery-projects · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md) · **Integrates with (optional):** [004](../004-mcp-gateway/change.md)

## Problem

Delivery leads need the portfolio, each project's board of specclaw proposals, and releases moving through environments. These are the first real business screens and they establish the module pattern for every other team.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-projects`](../../mock/index.html#001-amax-foundation-projects)

Projects (portfolio), project page with the board, Proposals with phase bar, Releases with the map; Overview's delivery widgets.

## Acceptance Criteria

1. **AC-1** Tables in the `delivery` schema: project, proposal (project-scoped key such as `CON-014`, specclaw phase), release, environment and deployment. Fixtures follow fixtures.md.
2. **AC-2** Projects, the project board, Proposals and Releases render from the database and match the mock at 1440 px within a 2% visual diff.
3. **AC-3** "Released" means reached Prod. Stage moves on the board use an explicit Move action and are audited.
4. **AC-4** MCP tools: `list_projects`, `get_project`, `list_proposals`, `get_release`, `record_deployment` (PM/Admin). Chat intents: new project, new proposal, new release. Tools register with the 004 gateway when it is installed; without it the screens work and the tools are simply not exposed.
5. **AC-5** `contracts.ts` exports project lookups and events `delivery.release.deployed` and `delivery.proposal.phase_changed`.
6. **AC-6** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

Assumptions (Rule 1):
- Built on 002 + 003 (merged). Phases are specclaw's five board columns: proposed, planned, building, verified, released; "released" is set only by a Prod deployment (AC-3), never by a board move.
- Screens reuse the mock's markup and class names; the styles they need move from the mock into `modules/delivery/ui/delivery.css` (module standard: shared UI starts inside the module).
- Without 004, `mcp.ts` tool definitions sit in the manifest unused; with it they register. Chat intents are plain manifest data.
- Fixtures reproduce fixtures.md's delivery numbers (3 projects, 37 in flight = 6 + 4 + 18 + 9, 5 released this month, the Contoso board, the three releases), filling unnamed proposals with neutral titles.

- [ ] `T1` — Contract first: `contracts.ts` (project lookups, proposal/release types, `delivery.release.deployed` and `delivery.proposal.phase_changed` payloads) with stubs and contract tests; manifest (grants, nav, routes); README; CODEOWNERS line (AC-5, AC-6)
  Kind: impl
  Files: modules/delivery/{module.ts,contracts.ts,package.json,tsconfig.json,README.md}, modules/delivery/tests/contracts.test.ts, .github/CODEOWNERS
- [ ] `T2` — Schema and fixtures: `delivery.project`, `delivery.proposal` (project-scoped key, phase, tasks, hours, owner, release), `delivery.release`, `delivery.environment`, `delivery.deployment`, RLS on all; fixture seed matching fixtures.md (AC-1)
  Kind: migration
  Files: modules/delivery/db/{schema.ts,migrations/0001_delivery.sql}, modules/delivery/fixtures/index.ts, modules/delivery/tests/schema.test.ts
  Depends: T1
- [ ] `T3` — Services and queries: create project/proposal/release, `moveProposal` (explicit, audited, can't move into released), `recordDeployment` (Prod ⇒ proposals released; emits events), list/get queries behind `can()`; MCP tool and chat intent definitions (AC-3, AC-4, AC-5)
  Kind: impl
  Files: modules/delivery/server/{services,queries}.ts, modules/delivery/mcp.ts, modules/delivery/chat.ts, modules/delivery/tests/{services,mcp}.test.ts
  Depends: T2
- [ ] `T4` — Screens: Projects (tickets, portfolio), project page with the board and Move action, Proposals (phase bar, table), Releases (map, table) from the database; e2e visual check against the mock at 1440 px (≤2%) and axe (AC-2, AC-3)
  Kind: impl
  Files: modules/delivery/ui/*, modules/delivery/actions.ts, apps/web/tests/e2e/delivery.spec.ts
  Depends: T3

## Verify
