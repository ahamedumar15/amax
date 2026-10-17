# HR: people records and directory

**Change:** 011-hr-core · **Created:** 2026-10-17
**Lane:** People · **Module:** `modules/hr` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md)

## Problem

Replace the HRIS for people records: directory, profile, employment history, documents, probation. Other modules (leave, payroll, access, allocations) read people through this module's contract.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-people`](../../mock/index.html#001-amax-foundation-people)

People: stats, departments, joiners vs leavers, directory; Person page with employment (pay masked), documents and balances.

## Acceptance Criteria

1. **AC-1** `hr` schema: person (linked to auth user), employment (entity, department, grade, manager, contract), document and probation. Pay fields are `sensitive: 'pay'`, bank details `'bank'`, and documents carry their own class (medical certificates `'health'`).
2. **AC-2** Directory and person page match the mock. A PM sees masked pay; HR and Payroll see it per the 002 rules.
3. **AC-3** Chat intent "add person". Events `hr.person.joined`, `hr.person.left` and `hr.person.changed`.
4. **AC-4** `contracts.ts`: `getPerson`, `listPeople(scope)`, `getEmployment`.
5. **AC-5** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Publish `contracts.ts` (types, `getPerson`, `listPeople(scope)`, `getEmployment`, event names and payloads) with contract tests (AC-4, AC-5)
  Files: modules/hr/contracts.ts, modules/hr/package.json, modules/hr/tsconfig.json, modules/hr/tests/contracts.test.ts
- [ ] `T2` — People screen (stats, departments, joiners vs leavers, directory) and Person page (employment with pay masked, documents, balances placeholder) matching the mock (AC-2)
  Files: modules/hr/ui/PeoplePage.tsx, modules/hr/ui/PersonPage.tsx, modules/hr/ui/parts.tsx, modules/hr/ui/Reveal.tsx, modules/hr/ui/hr.css, modules/hr/css.d.ts
  Depends: T1
- [ ] `T3` — `hr` schema: person, employment, document, probation with RLS; classified fields (pay, bank, per-document class); queries that mask through `@amax/auth` (AC-1, AC-2)
  Files: modules/hr/db/migrations/0001_hr.sql, modules/hr/server/queries.ts, modules/hr/server/context.ts
  Depends: T1
- [ ] `T4` — Services (add person, change person, record leaver) emitting `hr.person.joined`, `hr.person.left`, `hr.person.changed`; MCP tools and the "add person" chat intent (AC-3)
  Files: modules/hr/server/services.ts, modules/hr/mcp.ts, modules/hr/chat.ts, modules/hr/actions.ts
  Depends: T3
- [ ] `T5` — Manifest (group People, grants, retention, viewer `reports` scope), fixtures consistent with fixtures.md (184 people, departments, joiners and leavers), README, CODEOWNERS line (AC-5)
  Files: modules/hr/module.ts, modules/hr/fixtures/index.ts, modules/hr/README.md, .github/CODEOWNERS
  Depends: T4
- [ ] `T6` — Tests: service, permission and masking (PM masked, Payroll/HR per 002), fixtures totals, RLS and retention columns; screen render checks (no edits outside the module, so no apps/web e2e file) (AC-1..AC-5)
  Files: modules/hr/tests/hr.test.ts, modules/hr/tests/ui.test.tsx
  Depends: T5

## Verify
