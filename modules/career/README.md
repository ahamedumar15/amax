# career (change 066)

One person's whole history in one view: where they started, each grade change, the projects they worked on and with which technologies, their certifications, their managers, and who recorded each change.

- **Owner:** `/modules/career/` in `.github/CODEOWNERS`
- **Screens:** `/hr/p/<employeeNo>/career`, mounted under the Person page (051) and linked from its Sections nav through hr's `PERSON_SECTIONS` slot. `/career` (profile menu) is the signed-in person's own tree. The tree is drawn to scale by `layout/tree.ts`, a pure function from events to geometry (a port of the proposal's `tree-layout.py`). Below it are the Selected node's trace and "What changed", newest first.
- **Where the data comes from:** before a person's cutover (`career.import`), from career's own imported history (`career.history`). After it, live through `@amax/hr/contracts` (`getPerson`, `listEmploymentPeriods`, `getEmployment` at each period's start; pay is never read into an event), `@amax/allocations/contracts` (`listAllocations`), `@amax/delivery/contracts` (`listProjectRefs`), `@amax/learning/contracts` (`certificationsOf`), and core's audit trail (`searchAudit`) for who recorded a live record and when.
- **Contracts** (`contracts.ts`): the event types (`CareerEvent` and its kinds), `technologiesOf(personId)`, `careerHref(employeeNo)`, `EVENTS` and `TechnologyTagged`
- **Events:** `career.technology.tagged` (a tag was confirmed or added)
- **MCP tools** (`mcp.ts`): read `get_career` (pins by person), `get_career_event` (pins by event id); write `tag_technology`, the only write, which chat runs after its confirm. A tag the agent proposed shows as a faint leaf until someone confirms it.
- **Chat-first:** no forms. "✦ Ask amax to review N proposed" and "✦ Ask amax to correct history" open chat with the person pinned. Every ticket, card, node and row has a pin.
- **Who sees a career (AC-6):** hr decides whether the reader may see the person at all. Then only the person, their manager chain, HR and leadership may see the career, and anyone else gets not found. `career:read` is granted to every role, because the person check is the real gate; `career:tag` goes to HR and PM.
- **Optional modules:** allocations, delivery and learning are each optional. When one is off, its part of the tree is left out and a note says why. hr alone gives the trunk, rings and roots.
- **Compact mode:** above 4 concurrent lanes on a side, lanes narrow to fit and branch labels are dropped. The list keeps them.
- **Data:** `career.settings` (the pinned demo "today"), `career.import`, `career.history`, `career.technology`. All have RLS on `tenant_id`, and the retention entries are in `module.ts`.
- **Fixtures:** Kasun Dias (LL-0417), clearly fictional, imported from a made-up previous HR system:
  - Associate Engineer (Jun 2021), Engineer (Jul 2022), Senior Engineer (Apr 2024).
  - Contoso Portal, Northwind Claims, Fleet Tracker, Internal Design System and Adatum claims spike, three at once in Apr–May 2025.
  - 9 technologies, two of them still agent proposals on Fleet Tracker.
  - Two certifications, one expired.
  - Managers Nimal Silva, then Maya Fernando.
- **Not in this change:** the agent that proposes tags from commits and linked repos (delivery's contract has no languages or dependencies yet), and the skills-matrix leaf (allocations' contract has no member skill). Both are in BACKLOG.
- **Tests:** `pnpm --filter @amax/career test` (DB tests need `DATABASE_MIGRATE_URL`). Screen: `pnpm --filter @amax/web build && pnpm --filter @amax/career e2e` (port `CAREER_E2E_PORT`, default 3566; database `CAREER_E2E_DB`, default `amax_e2e_066`).
