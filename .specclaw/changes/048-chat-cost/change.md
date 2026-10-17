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

## Verify
