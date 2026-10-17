# allocations (change 010)

Plan people across projects by month, and see over-allocation and the bench ahead.

- **Owner:** `/modules/allocations/` in `.github/CODEOWNERS`
- **Screens:** `/allocations` (capacity vs demand, bench by skill for the first forecast month, per-person monthly grid for the projects you manage), `/allocations/everyone`
- **Depends on:** `hr` (people, FTE and dates via `listPeople`, `getPerson`, `listEmploymentPeriods`) and `delivery` (projects via `listProjectRefs`, `getProjectRef`). **Integrates with (optional):** `leave` (012). It isn't installed yet, so capacity doesn't subtract booked leave (`leaveAdjusted: false`, said on screen).
- **Contracts** (`contracts.ts`, v1): `listAllocations`, `personMonthTotals`, `monthOf`, `EVENTS`, payload types
- **Events:** `allocations.allocation.set`, `allocations.month.copied`
- **Rules:** capacity = the team's FTE on the 15th of each month (hr employment periods); demand = allocated percent / 100 plus unstaffed forecast demand; bench = members employed that month with nothing allocated; a person is over-allocated when their total is above their FTE. Months after the current quarter are a forecast.
- **MCP tools** (`mcp.ts`): read `get_capacity_forecast`, `list_allocations`; write `allocate`, `copy_allocations_to_next_month`
- **Chat intents** (`chat.ts`): Allocate (`allocations.allocate`)
- **Permissions:** `allocations:read` (Leadership, HR, PM); `allocations:allocate@managed` and `allocations:copy` (PM; Copy to next month only copies rows on projects the viewer may allocate)
- **Viewer scopes:** contributes the projects a user is allocated to this month (`assignedProjects`)
- **Data:** `allocations.member` (team, skill), `allocation` (person, project or other work, month, percent), `forecast` (unstaffed demand), all RLS on `tenant_id`. No personal fields of its own: people are hr ids.
- **Fixtures:** the delivery team (Engineering, Quality and seven delivery staff), Nimal, Kasun and Ayesha as in the mock, and generic allocations that reproduce fixtures.md: capacity 140..144, demand 138..141 (Oct to Mar), 6 on the bench in January
- **Tests:** `pnpm --filter @amax/allocations test` (DB tests need `DATABASE_MIGRATE_URL`)
