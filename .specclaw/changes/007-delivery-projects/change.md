# Delivery: projects, proposals and releases

**Change:** 007-delivery-projects · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md)

## Problem

Delivery leads need the portfolio, each project's board of specclaw proposals, and releases moving through environments. These are the first real business screens and they establish the module pattern for every other team.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-projects`](../../mock/index.html#001-amax-foundation-projects)

Projects (portfolio), project page with the board, Proposals with phase bar, Releases with the map; Overview's delivery widgets.

## Acceptance Criteria

1. **AC-1** Tables in the `delivery` schema: project, proposal (project-scoped key such as `CON-014`, specclaw phase), release, environment and deployment. Fixtures follow fixtures.md.
2. **AC-2** Projects, the project board, Proposals and Releases render from the database and match the mock at 1440 px within a 2% visual diff.
3. **AC-3** "Released" means reached Prod. Stage moves on the board use an explicit Move action and are audited.
4. **AC-4** MCP tools: `list_projects`, `get_project`, `list_proposals`, `get_release`, `record_deployment` (PM/Admin). Chat intents: new project, new proposal, new release.
5. **AC-5** `contracts.ts` exports project lookups and events `delivery.release.deployed` and `delivery.proposal.phase_changed`.

## Tasks

## Verify
