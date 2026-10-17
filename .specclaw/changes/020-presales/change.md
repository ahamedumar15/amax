# Presales pipeline

**Change:** 020-presales · **Created:** 2026-10-17
**Lane:** Sales · **Module:** `modules/presales` · **Depends on:** [007](../007-delivery-projects/change.md), [003](../003-data-core/change.md) · **Integrates with (optional):** [017](../017-finance-contracts-billing/change.md)

## Problem

Opportunities from new idea to won or lost, with activities, tasks, risks and promotion to a delivery project.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-presales`](../../mock/index.html#001-amax-foundation-presales)

Presales board with Move, the opportunity page (stage history, win chance, activities, tasks, risks), Mark as lost, Promote to delivery.

## Acceptance Criteria

1. **AC-1** `presales` schema: client, opportunity (stage, win chance, value with currency, health computed from risks), activity, task, risk and stage history (every change logged with who and when).
2. **AC-2** Moving stage is explicit and audited. Lost needs a reason. Promote to delivery creates a project through the delivery contract.
3. **AC-3** Chat intent "new opportunity". The pipeline converts to USD with the original currency kept, and matches fixtures.md ($596,000 open).
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Contract first: `contracts.ts` (opportunity refs, stages, events and payloads, pipeline read) with contract tests; manifest (Business group, grants, routes, retention); README; package; CODEOWNERS line (AC-4)
  Files: modules/presales/{module.ts,contracts.ts,package.json,tsconfig.json,css.d.ts,README.md}, modules/presales/tests/contracts.test.ts, .github/CODEOWNERS, pnpm-lock.yaml
- [x] `T2` — Screens matching the mock: Presales board (tickets, found-by-agents strip, six stage lanes with Move and Remove, pipeline chart, recent stage changes) and the opportunity page (stage steps, details with computed health, stage history, activities, tasks, risks, win-chance chart, Mark as lost dialog, Promote to delivery) (AC-1, AC-2)
  Files: modules/presales/ui/*, modules/presales/actions.ts
  Depends: T1
- [x] `T3` — `presales` schema and fixtures: client, opportunity (stage, win chance, value + currency + USD, health from risks), activity, task, risk, stage history, suggestion, fx rate, pipeline snapshot; RLS on tenant_id; fixtures.md pipeline ($596,000 open, $280,800 weighted, Northwind history) (AC-1, AC-3)
  Files: modules/presales/db/migrations/0001_presales.sql, modules/presales/fixtures/index.ts
  Depends: T1
- [x] `T4` — Services and queries: explicit audited stage moves logging who and when, Lost needs a reason, remove, activities/tasks/risks, accept/dismiss suggestions, USD conversion keeping the original currency, Promote to delivery through the delivery contract (degrades when delivery doesn't publish project creation) (AC-1, AC-2, AC-3)
  Files: modules/presales/server/*
  Depends: T3
- [x] `T5` — MCP tools and the "new opportunity" chat intent; search contribution; monthly pipeline snapshot job (AC-3)
  Files: modules/presales/{mcp.ts,chat.ts,jobs.ts}
  Depends: T4
- [x] `T6` — Tests: service and audit, permissions, RLS leak, switch-off and without-finance, chat intent, and the module e2e (board and opportunity against the mock, axe) (AC-1–AC-4)
  Files: modules/presales/tests/*
  Depends: T5

## Verify

**Verdict:** PASS
- AC-1: pass — `tests/presales.test.ts` AC-1: nine `presales` tables, all RLS-forced (`tablesMissingRls` empty); Northwind's five history rows with who and when (Aug 4 → Oct 2, 10% → 60%); health amber from the open high-impact risk, red with an open high-impact issue, green once closed. e2e: board and opportunity page render it.
- AC-2: pass — `tests/presales.test.ts` AC-2: a move is audited with before/after; Lost without a reason is refused, with one it closes and logs; closed deals can't move or be removed; promote claims the opportunity, creates a real delivery project through delivery's own `create_project` service under an idempotency key (so a retry never makes a second project), links it and emits `presales.opportunity.promoted`; `review.test.ts` covers races, resume and refusals; Sales can't promote; not-won is refused; without a delivery contract write it refuses cleanly. e2e: explicit Move (disabled until a stage is chosen), Move to Negotiation and the Mark as lost dialog. **Open:** delivery's `contracts.ts` doesn't export `createProject` yet, so in the app Promote is disabled with that reason until delivery publishes it (presales detects it; no code change needed here).
- AC-3: pass — `chat.test.ts`: the "new opportunity" intent becomes a confirm card and confirming writes with source chat; `presales.test.ts` AC-3: AUD values keep amount/currency/rate with USD value, unknown currency refused, an agent's find is added only on accept; `contracts.test.ts`: $596,000 open, $280,800 weighted. e2e: lede, tickets ($596,000 · $280,800 · 38% · 64 days), lanes, Fill with amax opens chat in intent mode.
- AC-4: pass — only `modules/presales/`, its CODEOWNERS line and the lockfile entry change; `contracts.ts` with contract tests; README, fixtures, manifest; `permissions.test.ts`: switch-off (nothing else imports it) and role grants; `check-graph` and `check-module-standard` ok. Finance (017) isn't used, so there is no optional integration to degrade.

Commands (exit codes): `pnpm lint` 0 (includes graph check); `node scripts/check-module-standard.mjs` 0; `turbo run test` with `DATABASE_MIGRATE_URL` 0 (presales 5 files / 37 tests, every other package green, including time after merging main); `pnpm --filter @amax/web build` 0; `pnpm --filter @amax/presales e2e` (DB `amax_e2e_020`, port 3520) 0, 4 flows, axe clean, Pipeline value card and Win chance card within 2% of the mock at 1440 px.
`specclaw-preset-check .` 1 and `specclaw-quality-scan . --gate` 1, both also failing on `origin/main` (repo-wide comment/line-length convention; the two `high` functions are `modules/delivery/sync/specclaw.ts parse` and `apps/web/.../settings/ai/page.tsx`). Presales adds no `high` function; it follows the repo's existing comment style.
Quality: 71 → 71 duplicated lines (repo-wide; presales accounts for 23: its `ctxFor` and MCP `tool()` helper mirror delivery's, which only a platform change could share, and two 6-line service headers). No refactor kept.
Screenshots: `shots/app-board.png` vs `shots/mock-board.png`, `shots/app-opportunity.png` vs `shots/mock-opportunity.png`, region diffs `shots/{app,mock}-chart.png`, `shots/{app,mock}-win-chance.png`.
Local review (`specclaw-review`, Opus, operator-requested, capped at 5 rounds): rounds 1–5 each fixed and committed as `fix(review-rN)`. Rounds 3–5 escalated on the same theme (promote to delivery can't create the project inside presales' transaction); round 3 redesigned it around a claim plus core idempotency on delivery's create. The cap was reached with round 5's fixes committed but not re-reviewed, so `specclaw-review verdict` is not clean; what's left is in `follow-ups.md`.
