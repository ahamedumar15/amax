# Chat cost per person and in total

**Change:** 048-chat-cost · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/ai` · **Depends on:** [033](../archive/033-ai-gateway-and-residency/change.md), [005](../archive/005-amax-chat/change.md)

## Problem

`ai.call` records tokens and cost for each model call, but `caller` is free text and nothing links a call to a person or a conversation. AI and data shows only the tenant's total for the month, so no one can see what each person's chat costs or which conversations cost the most.

## Mock Delta

What changes on screen, and where to see it: [`048-chat-cost`](../../mock/index.html#048-chat-cost)

- New Admin screen, **AI usage** (under Settings › AI and data): this month's total cost, tokens, calls and calls at unknown cost; a cost-per-day chart; a per-person table; the most expensive conversations.
- The chat panel footer shows each person their own usage this month ("This month: $4.12 · 212 calls").

## Acceptance Criteria

1. **AC-1** `ai.call` gains `user_id` and `conversation_id`, both nullable for jobs. Chat turns fill them in. The migration backfills `user_id` from `caller` where it matches a user.
2. **AC-2** The AI usage screen (Admin only) shows totals for the selected month (cost, input and output tokens, calls, unknown-cost calls), cost per day, a per-person table (calls, tokens, cost, last used) and the top 10 conversations by cost. A month picker and a source filter (chat, agents, jobs) change the view. Every ticket, row and chart point has a pin.
3. **AC-3** The chat panel shows the signed-in person their own cost and call count this month. Nobody sees another person's figures unless they are an Admin (test).
4. **AC-4** The read tool `get_ai_usage` takes `scope: self | tenant` (`tenant` is Admin only), a month and a group-by (person, day, conversation), and returns the same numbers as the screen (test).
5. **AC-5** A call with no known price counts as "unknown cost", never as $0, in every total and on every screen (test).
6. **AC-6** The screen matches the mock and passes the axe check, in light and dark themes. Typecheck, unit tests, lint and e2e stay green.

## Tasks

- [x] `T1` — AI usage screen and chat footer, matching the mock (AC-2, AC-3, AC-5, AC-6)
  Files: apps/web/app/(app)/settings/ai/usage/page.tsx, apps/web/app/(app)/settings/ai/usage/UsageFilters.tsx, apps/web/app/(app)/settings/ai/usage/CostChart.tsx, apps/web/app/(app)/settings/ai/usage/UsageTables.tsx, apps/web/app/(app)/settings/ai/page.tsx, apps/web/app/(app)/settings/settings.css, apps/web/app/(app)/layout.tsx, apps/web/components/shell/Shell.tsx, apps/web/components/chat/Chat.tsx, apps/web/app/actions/chat.ts, apps/web/lib/chat-usage.ts, packages/ui/src/styles/chat.css
- [x] `T2` — Migration 0019: `ai.call.user_id` and `conversation_id`, backfill `user_id` from `caller` (AC-1)
  Files: packages/db/migrations/0019_ai_call_owner.sql
- [x] `T3` — Gateway logs the person and conversation; chat turns pass them (AC-1)
  Files: packages/ai/src/gateway.ts, packages/chat/src/engine.ts
  Depends: T2
- [x] `T4` — `aiUsage()` query and the `get_ai_usage` read tool (self or tenant, month, group-by, source); unknown cost never counts as $0 (AC-3, AC-4, AC-5)
  Files: packages/ai/src/usage.ts, packages/ai/src/usage-format.ts, packages/ai/src/usage-tool.ts, apps/web/lib/server.ts
  Depends: T3
- [x] `T5` — Tests: migration backfill, gateway attribution, usage totals and unknown cost, self vs tenant permission, tool equals screen; e2e for the screen (axe, light and dark) and the chat footer (AC-1 to AC-6)
  Files: packages/ai/tests/usage.test.ts, packages/ai/tests/usage-migration.test.ts, apps/web/tests/e2e/ai-usage.spec.ts, apps/web/playwright.auth.config.ts, apps/web/playwright.config.ts
  Depends: T1, T4

## Verify

**Verdict:** PASS

- AC-1: pass — `packages/ai/tests/usage-migration.test.ts` migrates to 0018, inserts calls, applies 0019: `user:<known id>` is backfilled, an unknown id and a job stay null; a chat `converse` call records `user_id` and `conversation_id`. e2e footer count rises after a chat turn.
- AC-2: pass — `apps/web/tests/e2e/ai-usage.spec.ts` "048 AC-2 AC-6": four tickets each with a pin, a pin per day on the chart, pinned person and conversation rows, the source filter changes the view. Month picker covered by the same `UsageFilters` control.
- AC-3: pass — `usage.test.ts` AC-3 (self sees only own; tenant scope throws ForbiddenError for non-Admins, through the tool too; footer totals equal the self totals); e2e: Nimal's footer shows his own `$0.00 · 0 calls` and /settings/ai/usage is not found for him.
- AC-4: pass — `usage.test.ts` AC-4: `get_ai_usage` totals and person, day and conversation rows equal `aiUsage()` (the screen's query); `key` narrows to one row; source filter.
- AC-5: pass — `usage.test.ts` AC-5: unpriced calls give `costUsd: null` and `unknownCostCalls`, label "Unknown" or "$x + unknown", never $0; e2e footer reads "This month: Unknown" for the scripted (unpriced) model.
- AC-6: pass — axe (wcag2a/2aa/21aa/22aa) clean in light and dark on the screen; typecheck, unit, lint and e2e green.

Commands (exit codes):
- `pnpm test` with DATABASE_MIGRATE_URL set — 0
- `pnpm lint` (tsc per package + graph check) — 0
- `pnpm build` (apps/web) — 0
- `pnpm exec playwright test --config playwright.auth.config.ts` (E2E_DB=amax_e2e_048) — 0, 36 passed, three runs in a row
- `pnpm exec playwright test` (guest config) — 0
- `specclaw-preset-check .` — 1 on the repo (654 pre-existing comment and line-limit violations); no violations in files this change adds after fixes.
- `specclaw-quality-scan . --gate` — 126, the tool does not run on this repo (`jq: Argument list too long`). Not run.
- specclaw-review loop: skipped on operator instruction (review cadence: once per module end).

Screenshots: `.specclaw/changes/048-chat-cost/shots/app.png` (light), `shots/app-dark.png`, `shots/app-chat-footer.png`, `shots/mock.png`. Layout, tickets, chart card and the two tables match the mock section; the chart line uses the brand violet.

Note: in two early full e2e runs, `auth.spec.ts` "AC5 non-admins get no View as" failed once each (signed out, then /delivery still served). It passed in isolation and on main 3 of 3. After the footer moved to one totals query loaded in parallel with voice, the full suite passed 4 runs in a row.
