# Recruitment

**Change:** 023-recruitment · **Created:** 2026-10-17
**Lane:** Talent · **Module:** `modules/recruitment` · **Depends on:** [011](../011-hr-core/change.md)

## Problem

Open roles from staffing demand, candidates through stages, offers with e-signature, and hire into HR.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-recruitment`](../../mock/index.html#001-amax-foundation-recruitment)

Recruitment: stats, pipeline board with +N more, hiring funnel, hires per month.

## Acceptance Criteria

1. **AC-1** Role, candidate, application, interview and offer. Hiring emits `recruitment.hired`, which creates the HR person (through the HR contract) as a suggestion HR confirms.
2. **AC-2** Agent match scores are suggestions with evidence (CV sections), never automatic rejections.
3. **AC-3** E-signature through a provider adapter (Zoho Sign first).

## Tasks

## Verify
