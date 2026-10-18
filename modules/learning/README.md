# learning (change 024)

Learning and development: programmes, who enrolled and how far they got, the hours they spent, the certifications people hold with their expiry, and reminders before one lapses.

- **Owner:** `/modules/learning/` in `.github/CODEOWNERS`
- **Screen:** `/learning` (lede, tickets for programmes, people in optional programmes, completion rate against the 80% target and certifications; the Programmes table, most hours first, filtered by All, Running or Done; people taking part each month; certifications expiring before January with Remind)
- **Contracts** (`contracts.ts`): `listProgrammeRefs`, `certificationsOf(personId)`, `expiringCertifications(on, until)`, `statusOn`, `numberOf`, `KINDS`, `COMPLETION_TARGET`, `EVENTS`, and the payload types
- **Events:** `learning.programme.created`, `learning.enrolment.created`, `learning.enrolment.completed`, `learning.certification.recorded`, `learning.certification.expiring` (a reminder is due; `kind` is `scheduled` or `manual`). Its `notifications` rule (030) tells the holder (`userId`) under reminders; learning never sends a message itself.
- **MCP tools** (`mcp.ts`): read `list_programmes`, `get_programme`, `learning_summary`, `list_certifications`, `get_certification`; write `create_programme`, `enrol_in_programme`, `record_completion`, `record_certification`, `remind_certification`
- **Chat-first (046).** The screen has no forms. "New programme" opens chat in the `learning.new-programme` intent (`chat.ts`); Remind is an "Ask amax" chip with the certification pinned. Every write runs only after chat's confirm. Every ticket, card, row and list item has a pin.
- **Reminders (029):** the `learning.certification-expiry` workflow runs daily at 06:00 UTC on the `learning.certification-expiry` schedule; each certification inside 60 days, then 14 days, of its expiry gets that window's reminder once (`learning.reminder`)
- **Figures:** optional programmes are those not mandatory. Completion is the average progress of enrolments (100 once completed); the people-taking-part chart counts people with hours in an optional programme each month; the share of people is of the active headcount the viewer sees in hr
- **Permissions:** `learning:read` (Leadership, PM, HR), `learning:programme:create`, `learning:enrol`, `learning:certification:record` (HR), `learning:remind` (HR, PM). People are found through hr's contract as the caller sees them, so a scoped HR role enrols and certifies only its own entities' people.
- **Depends on hr (011)** for people and workflows (029) for the schedule. No optional integrations.
- **Data:** `learning.programme`, `enrolment`, `attendance`, `certification`, `reminder` (all RLS on `tenant_id`); people are `hr.person` ids; retention entries in `module.ts`
- **Fixtures:** fixtures.md's 18 programmes (11 internal, 7 external), 184 people through mandatory ISO 27001 awareness, 126 people (68%) in optional programmes at 74% completion, 41 certifications with 6 expiring before January (Nimal's AZ-305 on Dec 2, Ayesha's ISTQB Advanced on Dec 18)
- **Not in this change:** the mock's "Skills matrix" button (no skills data yet), and a learning page for engineers and employees about their own programmes
- **Tests:** `pnpm --filter @amax/learning test` (DB tests need `DATABASE_MIGRATE_URL`); screen: `pnpm --filter @amax/web build && pnpm --filter @amax/learning e2e`
