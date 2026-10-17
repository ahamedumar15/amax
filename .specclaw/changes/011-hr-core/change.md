# HR: people records and directory

**Change:** 011-hr-core · **Created:** 2026-10-17
**Lane:** People · **Module:** `modules/hr` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md)

## Problem

Replace the HRIS for people records: directory, profile, employment history, documents, probation. Other modules (leave, payroll, access, allocations) read people through this module's contract.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-people`](../../mock/index.html#001-amax-foundation-people)

People: stats, departments, joiners vs leavers, directory; Person page with employment (pay masked), documents and balances.

## Acceptance Criteria

1. **AC-1** `hr` schema: person (linked to auth user), employment (entity, department, grade, manager, contract), document and probation. Pay fields are `sensitive: 'pay'`.
2. **AC-2** Directory and person page match the mock. A PM sees masked pay; HR and Payroll see it per the 002 rules.
3. **AC-3** Chat intent "add person". Events `hr.person.joined`, `hr.person.left` and `hr.person.changed`.
4. **AC-4** `contracts.ts`: `getPerson`, `listPeople(scope)`, `getEmployment`.

## Tasks

## Verify
