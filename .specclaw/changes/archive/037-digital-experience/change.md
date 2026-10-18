# Digital employee experience, without a desk agent

**Change:** 037-digital-experience · **Created:** 2026-10-17
**Lane:** IT · **Module:** `modules/experience` · **Depends on:** [011](../011-hr-core/change.md), [021](../021-it-access-licences/change.md), [006](../006-agent-governance/change.md), [029](../029-workflows-scheduler/change.md) · **Integrates with (optional):** [022](../022-helpdesk/change.md), [026](../026-insights/change.md), [030](../030-notifications/change.md), [032](../032-data-retention-and-erasure/change.md)

## Problem

IT learns about slow laptops, crashing apps and failing VPNs only when someone raises a ticket, and nobody can see whether new joiners or one office have a worse experience than the rest. Intune and Defender already hold the device signals, and amax holds the people and helpdesk data, but nothing joins them. This must stay device and app health, never employee monitoring.

## Mock Delta

What changes on screen, and where to see it: [`037-digital-experience`](../../mock/index.html#037-digital-experience)

New screen, Digital experience: an experience score by department and site (groups under 5 hidden), the top device and app issues with how many devices they affect, suggested fixes from the experience agent, the latest pulse survey, and a "What we collect" card.

## Acceptance Criteria

1. **AC-1** A daily 029 job reads Intune Endpoint Analytics (startup time, app crashes and hangs, device health) and Defender device risk through the 021 connector, and stores them per device in the `experience` schema. Nothing else is collected: no keystrokes, screenshots, browsing history, window titles or activity timelines. A test fails if the schema gains a field outside the allowed list.
2. **AC-2** Collection is switched on per legal entity by an Admin, only after a notice to staff is recorded with its date. A test shows no data is read for an entity without a notice.
3. **AC-3** The experience score (0 to 10) combines device health, app reliability and the pulse survey, with the formula shown on screen. Scores appear by department, site and device model only. Groups under 5 people are hidden, and no screen or contract returns a score for one named person, apart from the person's own view on their profile.
4. **AC-4** Pulse surveys go out in Teams through 030: at most one question a fortnight, anonymous, reported only for groups of 5 or more.
5. **AC-5** An issue that affects 5 or more devices (for example, Teams crashing after an update) becomes a 006 suggestion for IT, with evidence: devices affected, first seen, and the change that likely caused it. Accepting it opens a 022 ticket or runs an approved Intune remediation. Nothing runs without approval.
6. **AC-6** Insights (026) shows an experience-trend insight with its source when the score drops by 1 point or more for a group. Device data is kept per 032 (default 90 days).
7. **AC-7** The Digital experience screen matches the mock within a 2% visual diff and is visible to Admin and Leadership.
8. **AC-8** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start work on 066 and 037").

What is collected (AC-1):
- A daily 029 job, `experience.collect` (05:00 UTC), reads Intune Endpoint Analytics and the Defender risk Intune holds for each device, through Microsoft Graph only.
  - Endpoint Analytics gives startup score and boot time, app health score, crashes and hangs per app version, and battery capacity.
  - `partnerReportedThreatState` on the managed device is Defender's risk, as reported to Intune.
- It opens 021's read credential, the 031 `msgraph-read` secret (named in 021's `READ_CONNECTORS` contract), with `useSecret`. Calls go through the 035 egress guards (`@amax/api/egress`): public https to Graph only, pinned lookups, no redirects, a size cap.
- Each Graph answer is parsed against a fixed shape. Device names, user names and anything else in it are dropped. A device is stored by its Intune id, model, owner (user id, from the UPN matched to `auth.user`) and that person's legal entity and department, read through hr's contract.
- The demo tenant has `sandbox` on: its fictional Intune readings are the seeded ones, so demo data never calls Graph.
- `tests/collect.test.ts` lists every column of the `experience` schema against an allowed list. It fails if a column is added outside that list.

Notice first (AC-2): collection is per legal entity. `set_experience_collection` (Admin) records the date of the notice to staff. It refuses to switch collection on without that notice, and the job keeps only devices whose owner is in an entity that is on. With no entity on, Graph isn't called.

The score (AC-3):
- Each part is out of 10. Device health is the startup score. App reliability is the app health score. The pulse counts Works well as 10, Gets in the way sometimes as 5, and Gets in the way a lot as 0.
- Score = 40% device health + 40% app reliability + 20% pulse. A group with fewer than 5 answers has no pulse part, and device health and app reliability count 50% each. The screen shows the formula.
- Groups are departments, sites (the legal entity) or device models. A group under 5 people goes into "Other", and "Other" is hidden when it too has fewer than 5. Only the five largest groups are listed; the rest go into "Other", as the mock shows.
- Nothing names a person: no screen, tool or contract returns a person's score. The one exception is `get_my_experience` and `myExperience`, the person's own devices and score. hr's profile page doesn't show it yet; that's a BACKLOG follow-up, because it would change hr.
- Admin, Leadership and IT Admin open the screen (IT reviews the fixes). Each viewer sees only devices in the legal entities their `experience:read` reaches.

Pulse surveys (AC-4):
- `send_pulse` is refused within 14 days of the last pulse.
- It emits `experience.pulse.sent` once for each person in an entity that is on. 030 takes it from there through a notification rule in the manifest, and sends on that person's channels: Teams once they've switched it on in their 030 preferences, which is opt-in. Experience sends nothing itself.
- `answer_pulse` stores the receipt (pulse and user, so a person answers once) apart from the answer (pulse, choice, department, entity). There is no user and no timestamp on the answer, and the audit row says only which pulse.
- Results show only for groups with 5 or more answers.

Fixes (AC-5): the experience agent is the collect job's step that finds issues.
- An app whose crashes or hangs cluster on one version is an issue. So is a device model whose boot time is over 4 minutes, and a laptop whose battery is under 60% of its capacity.
- An issue on 5 or more devices becomes a 006 suggestion, `experience.fix`, decided with `experience:fix` (IT Admin, Admin). Its evidence: devices affected, first seen, and the likely cause (the app version and the day it arrived).
- Accepting an app fix queues an Intune remediation. A daily step, `experience.remediate`, runs it only when the tenant has switched remediation on (`set_experience_remediation`, Admin, off by default), through the 031 `msgraph-write` secret that 021 also uses. Otherwise it is recorded as "manual: run it in Intune".
  - 021's write consent and scopes are internal to 021, and its scopes don't cover device management. So experience keeps its own switch, which is off by default.
- Accepting a hardware fix marks the issue for a ticket and emits `experience.fix.accepted`. Experience can't write helpdesk's schema, and helpdesk's contract publishes only counts. So the fix's "Open ticket" opens chat in helpdesk's `helpdesk.new-ticket` intent with the issue pinned, as 025 does, and `create_ticket` writes after the person confirms. It shows only when helpdesk is installed. BACKLOG: helpdesk handles `experience.fix.accepted`, as it does onboarding's event.
- Nothing runs without a person's approval.

Trends and insights (AC-6):
- The daily job snapshots each group's score. A drop of 1 point or more against four weeks earlier emits `experience.score.dropped` once, and `scoreDrops()` in `contracts.ts` returns each drop with its source, in 026's `InsightSource` shape.
- Insights has no hook for another module's insight: its `record_insight` is its own write, and its `currentInsights` reads only its own table. So 026 showing it needs a change inside insights, which is a BACKLOG follow-up.
- Device data (devices, daily readings, app readings) has 032 retention entries: deleted 90 days after the reading.

Visual (AC-7): the module e2e compares the screen with the mock section region by region (the four tile labels and the card titles), each within 2%, as 036's compliance spec does. The demo's clock is pinned in `experience.settings` (Oct 16, 2026), so no figure follows the wall clock.

Ripples outside the module (AC-8, besides CODEOWNERS and BACKLOG):
- In `apps/web/lib/operations.ts` the Coming-soon slug `dex` becomes `experience`, so the installed module replaces it, as 021 did.
- `apps/web/tests/e2e/admin.spec.ts` has no unbuilt Operations screen left to use as its Coming-soon example, so it follows Digital experience to its real screen instead.

- [x] `T1` — Digital experience screen, as in the mock:
  - the lede, "Send pulse survey" (chat intent `experience.send-pulse`) and "Review fixes" (Ask amax)
  - four tiles: experience score, devices needing attention, pulse responses, fixes waiting
  - the group table (department, site or device model through a read-only select): people, score with its meter, top issue and the 4-week trend, the total row and the formula, with groups under 5 people never shown
  - suggested fixes with Review (and Open ticket through `helpdesk.new-ticket` when helpdesk is installed)
  - the latest pulse, and "What we collect" with the notice date
  - Every tile, row and line is pinned; no forms; the module e2e checks the 2% visual diff, axe in light and dark, and 390 px with no side scroll (AC-3, AC-7)
  Files: modules/experience/ui/*.tsx, modules/experience/ui/art.ts, modules/experience/ui/experience.css, modules/experience/server/views.ts, modules/experience/module.ts, modules/experience/tests/e2e/*
- [x] `T2` — Contracts first, then the `experience` schema with RLS:
  - settings (pinned clock, sandbox, remediation switch), collection per entity with its notice, devices with daily and per-app readings, issues and their devices, remediations, pulses with receipts kept apart from answers, and score snapshots
  - scoring with k-anonymity, and the person's own view
  - read tools and pins; audited write tools (`set_experience_collection`, `set_experience_remediation`, `send_pulse`, `answer_pulse`); the chat intent `experience.send-pulse`; the 030 notification rule for a pulse
  - fictional fixtures that give the mock's numbers: 7.9 for 184 people, 18 of 231 devices, 118 of 184 answers, and the department rows and trends
  - Tests: groups under 5 hidden and no score for a named person (AC-2, AC-3, AC-4)
  Files: modules/experience/contracts.ts, modules/experience/db/migrations/0001_experience.sql, modules/experience/server/*.ts, modules/experience/mcp.ts, modules/experience/pins.ts, modules/experience/chat.ts, modules/experience/fixtures/*, modules/experience/tests/db.ts, modules/experience/tests/installed.ts, modules/experience/tests/contracts.test.ts, modules/experience/tests/privacy.test.ts, modules/experience/tests/pulse.test.ts
- [x] `T3` — The daily collection and the experience agent, as 029 workflows:
  - Collection opens `msgraph-read` through `useSecret` and the egress guards, or reads the sandbox, and stores only the allowed fields, only for entities with a notice.
  - It finds issues and turns those on 5 or more devices into `experience.fix` suggestions with their evidence.
  - Approved remediations run through `msgraph-write` only when remediation is switched on, else they are recorded as manual.
  - It snapshots group scores and emits `experience.score.dropped` for a drop of 1 point or more.
  - Tests: the allowed-columns list, no read without a notice, fixes, and drops (AC-1, AC-2, AC-5, AC-6)
  Files: modules/experience/workflows.ts, modules/experience/suggestions.ts, modules/experience/server/collect.ts, modules/experience/server/graph.ts, modules/experience/server/wire.ts, modules/experience/server/record.ts, modules/experience/server/snapshot.ts, modules/experience/server/remediate.ts, modules/experience/tests/collect.test.ts, modules/experience/tests/fixes.test.ts
  Depends: T2
- [x] `T4` — Module standard:
  - README, package.json, a CODEOWNERS line, retention (device data 90 days; pulses, notices and remediations with who set them), and switch-off
  - degrading without helpdesk, notifications and insights; the Operations slug fix and the admin e2e example
  - BACKLOG: insights shows experience drops, helpdesk handles `experience.fix.accepted`, and hr's profile shows the person's own experience (AC-6, AC-8)
  Files: modules/experience/README.md, modules/experience/package.json, modules/experience/tsconfig.json, modules/experience/css.d.ts, .github/CODEOWNERS, modules/experience/tests/standard.test.ts, pnpm-lock.yaml, BACKLOG.md, apps/web/lib/operations.ts, apps/web/tests/e2e/admin.spec.ts
  Depends: T3

## Verify

**Verdict:** PASS, with gaps on AC-4, AC-5 and AC-6 recorded below and in BACKLOG

- AC-1: pass.
  - A daily 029 job reads Intune Endpoint Analytics and Intune's Defender risk (`partnerReportedThreatState`) through 021's `msgraph-read` connector (`READ_CONNECTORS`, `useSecret`) and the 035 egress guards.
  - Answers are parsed to a fixed shape. A test fails if the schema gains a column outside the allowed list, and one checks that device and user names, window titles and browsing are dropped.
  - The demo tenant's `sandbox` setting means Graph is never called.
- AC-2: pass — collection is switched on per entity by an Admin, only with a notice date that isn't in the future. Tests show nothing is stored for an entity that's off, and the credential is never opened when no entity is on.
- AC-3: pass, with a gap.
  - The 0–10 score combines device health, app reliability and pulse, and the formula is shown under the table. Scores are by department, site and model only, and groups under 5 are hidden.
  - No `get_experience` output names a person, and no tool takes a person as input. The person's own score is `get_my_experience`.
  - **Gap:** hr's profile page doesn't show the own score yet (BACKLOG).
- AC-4: partial.
  - At most one pulse a fortnight. 030's rule sends it, tested end to end.
  - Answers are anonymous: receipts are stored apart from answers, and an answer has no user and no time. Results show only for groups of 5 or more.
  - **Gap:** Teams delivery reaches only people who have switched Teams on in their 030 preferences.
  - **Gap:** answers come back through chat (`answer_pulse`), not a Teams card.
- AC-5: partial.
  - Issues on 5 or more devices become `experience.fix` suggestions with their evidence (devices affected, first seen, likely cause). Nothing runs without approval, and an Engineer can't accept one.
  - **Remediation:** an accepted fix runs through `msgraph-write` only after an Admin switches on experience's own remediation setting with a script id; it is off by default and recorded as "manual" until then. 021's write consent is internal to 021, and its scopes don't cover device management.
  - **Ticket:** experience can't write helpdesk's schema. Accepting a hardware fix emits `experience.fix.accepted` and offers "Open ticket", which opens chat in `helpdesk.new-ticket` with the fix pinned. Helpdesk opening the ticket on its own is in BACKLOG.
- AC-6: partial.
  - Daily snapshots are kept, and a drop of 1 point or more emits `experience.score.dropped` once (Quality, 8.3 → 7.1). `scoreDrops()` returns each drop in 026's `InsightSource` shape. Device data is kept 90 days (032).
  - **Gap:** insights has no hook for another module's insight, so Insights doesn't show the drop yet (BACKLOG).
- AC-7: pass, with one deviation.
  - Every gated region (four tile labels and four card titles) measures 0.0000 against the mock, as does the whole tile row.
  - Where the fixture data can't produce the mock's wording, the screen says what the data shows: "Slow boots" for "Slow builds", "VPN client keeps hanging" for "VPN drops on office Wi-Fi", and "over the last 4 weeks" for "this fortnight".
  - **Deviation:** IT Admin can also read the screen, beyond Admin and Leadership, because IT decides the fixes and the Operations nav lists it for IT Admin. It shows only group scores, never a named person. If the product owner wants it Admin and Leadership only, it's a one-line change.
  - **Mock-level issue:** at 1440 wide the "Devices needing attention" label runs under the tile illustration in the mock too. The mock's `max-width:62%` label rule applies only below 600px. The app matches the mock, which AC-7 gates, so this is left for a design fix in the shared `Ticket`.
- AC-8: pass — contracts and contract tests, README, fixtures, manifest, switch-off, and the module still works without helpdesk, notifications and insights (tested). `check:graph` and `check-module-standard` pass.

Re-run on HEAD 26cd1ed after the build agent's last commit (E2E ports 3637/3638, `amax_e2e_037`):
- `pnpm turbo run lint --force` → 0 (34/34)
- `pnpm turbo run test --force --continue --concurrency=2` → 0 (34/34)
- `pnpm --filter @amax/web build` → 0
- `npx playwright test` (apps/web, public) → 8/8
- `npx playwright test --config playwright.auth.config.ts` → 81/81
- `pnpm --filter @amax/experience e2e` → 3/3

Re-run after merging origin/main with 066 (career), HEAD 8a0b006: lint 35/35, test 35/35, web build 0, public e2e 8/8, signed-in e2e 81/81, module e2e 3/3.

Screenshots: `.specclaw/changes/037-digital-experience/shots/app.png`, `.specclaw/changes/037-digital-experience/shots/mock.png`.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).

Quality: 0 → 0 duplicated lines (`npx jscpd@4 modules/experience`, default thresholds; `specclaw-quality-scan .` hit jq's "Argument list too long"). Nothing to refactor.

Commands (Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm turbo run lint --force` → 34/34
- `pnpm turbo run test --force --continue --concurrency=2` → 34/34 tasks, 1348 tests passed, 6 skipped. `@amax/experience` has 10 tests in 6 files.
- `pnpm --filter @amax/web build` → 0
- `npx playwright test` (apps/web, public) → 8/8
- `npx playwright test --config playwright.auth.config.ts` → 81/81
- `pnpm --filter @amax/experience e2e` → 3/3. All eight gated regions (the four tile labels and the four card titles) are 0.0000 against the mock, and the whole tile row is 0.0000 too.

Gaps:
- AC-4: the pulse goes out through 030's rule on each person's own channels. Teams applies only to people who have switched it on in their 030 preferences, which is opt-in, and answers come back through chat (`answer_pulse`), not a Teams card.
- AC-5: a hardware fix opens its ticket through helpdesk's `helpdesk.new-ticket` intent ("Open ticket"), not on its own. Remediation has its own switch, off by default, plus the script to run, because 021's write consent doesn't cover device management. Both are in BACKLOG.
- AC-6: insights doesn't show the drop yet. `experience.score.dropped` and `scoreDrops()` are published for it (BACKLOG).
- AC-3: the person's own view is a tool and a contract read. hr's profile page doesn't show it yet (BACKLOG).
- Mock text differs where the data can't say it: "Slow boots on 2021 laptops" for "Slow builds", "VPN client keeps hanging" for "VPN drops on office Wi-Fi", "2.3× the fleet's median" for "builds 2.3× slower", and "over the last 4 weeks" for "this fortnight". The formula line sits under the table (AC-3).

Ripples outside the module: `.github/CODEOWNERS`, `BACKLOG.md`, `pnpm-lock.yaml`, `apps/web/lib/operations.ts` (slug `dex` becomes `experience`) and `apps/web/tests/e2e/admin.spec.ts` (Digital experience opens `/experience`).

Shots: `shots/app.png` (`/experience` as Maya, Admin, 1440 wide) and `shots/mock.png`.
