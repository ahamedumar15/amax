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

## Verify
