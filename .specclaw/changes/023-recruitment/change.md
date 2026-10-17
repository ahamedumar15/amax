# Recruitment

**Change:** 023-recruitment · **Created:** 2026-10-17
**Lane:** Talent · **Module:** `modules/recruitment` · **Depends on:** [011](../011-hr-core/change.md), [006](../006-agent-governance/change.md) · **Integrates with (optional):** [032](../032-data-retention-and-erasure/change.md)

## Problem

Open roles from staffing demand, candidates through stages, offers with e-signature, and hire into HR.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-recruitment`](../../mock/index.html#001-amax-foundation-recruitment)

Recruitment: stats, pipeline board with +N more, hiring funnel, hires per month.

## Acceptance Criteria

1. **AC-1** Role, candidate, application, interview and offer. Candidate data is `sensitive: 'candidate'` and kept according to 032. Hiring emits `recruitment.hired`, which creates the HR person (through the HR contract) as a suggestion HR confirms.
2. **AC-2** Agent match scores are suggestions with evidence (CV sections), never automatic rejections.
3. **AC-3** E-signature through a provider adapter (Zoho Sign first).
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
