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

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"). Candidate data
is the 002 `candidate` class, so only HR reads names, contact details, CVs and match evidence; Admin
and Leadership see the pipeline's counts, stages and dates with names masked. The demo figures come
from fixtures.md (funnel 63 → 41 → 19 → 5 → 4; board 22, 9, 5, 1, 4; hires per month 4, 4, 6, 4, 3, 3).

- [x] `T1` — Recruitment screen, as in the mock: the lede, a role filter, "New role" through Ask amax, the four tiles (open roles, candidates, time to hire, offers accepted), the pipeline board with one or two cards per stage and "+N more", the hiring funnel and hires per month. Every tile, card, stage and funnel row is pinned; there are no forms; names are masked for anyone without the candidate class (AC-1, AC-2)
  Files: modules/recruitment/ui/*.tsx, modules/recruitment/ui/recruitment.css, modules/recruitment/module.ts, modules/recruitment/tests/e2e/recruitment.spec.ts
- [x] `T2` — Contracts first, then the `recruitment` schema (role, candidate, application, interview, offer), each write an audited service and MCP write tool, and the read tools. Candidate fields are `sensitive: 'candidate'` on every read tool and masked below HR; retention per 032 (candidates not hired: 12 months from the decision) (AC-1)
  Files: modules/recruitment/contracts.ts, modules/recruitment/db/migrations/0001_recruitment.sql, modules/recruitment/server/*.ts, modules/recruitment/mcp.ts, modules/recruitment/pins.ts, modules/recruitment/fixtures/, modules/recruitment/tests/pipeline.test.ts, modules/recruitment/tests/contracts.test.ts
- [x] `T3` — The screening agent: each new application gets a match score with its evidence (the CV sections that matched) as a 006 suggestion. Accepting moves it to screening; no agent path rejects anyone, and rejection is refused for anything but a person (AC-2)
  Files: modules/recruitment/suggestions.ts, modules/recruitment/server/match.ts, modules/recruitment/tests/match.test.ts
  Depends: T2
- [x] `T4` — E-signature through a provider adapter: the `SignProvider` interface, Zoho Sign first (its token from the 031 `zoho-sign` credential), and a demo provider labelled fictional. Sending an offer creates the envelope; a signed envelope hires (AC-3)
  Files: modules/recruitment/sign.ts, modules/recruitment/server/offers.ts, modules/recruitment/tests/sign.test.ts
  Depends: T2
- [x] `T5` — Hiring emits `recruitment.hired`; the hire agent proposes the HR record as a 006 suggestion only HR (`hr:person:create`) can accept, and the hire links to the HR person once hr reports them joined (`hr.person.joined`, read through the HR contract) (AC-1)
  Files: modules/recruitment/suggestions.ts, modules/recruitment/server/hire.ts, modules/recruitment/tests/hire.test.ts
  Depends: T3, T4
- [x] `T6` — Module standard: README, manifest, CODEOWNERS line, contract tests, retention entries, can be switched off (AC-4)
  Files: modules/recruitment/README.md, modules/recruitment/package.json, .github/CODEOWNERS, modules/recruitment/tests/standard.test.ts
  Depends: T5

## Verify

Quality: 15 → 0 duplicated lines (jscpd over modules/recruitment; specclaw-quality-scan fails on this repo with jq "Argument list too long", so jscpd was run directly. The 15 lines were the DB tests' shared setup, moved into `tests/db.ts` `sharedDb`.)
