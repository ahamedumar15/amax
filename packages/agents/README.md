# @amax/agents

Agent governance (change 006). Owner: Platform lane. Agents never change data on their own: their output
is a **suggestion** that a person accepts, queries or dismisses, with undo.

## Declaring a kind

The module that owns the change declares the kind in its manifest (`suggestions: [...]`):

```ts
import { defineSuggestionKind } from "@amax/agents";

export const rebalance = defineSuggestionKind({
  kind: "allocations.rebalance", title: "Allocation change", permission: "allocations:allocate",
  proposed: z.object({ personId: z.uuid(), projectKey: z.string(), month: z.string(), percent: z.number() }),
  apply: (tx, ctx, p) => /* the module's own write, in this transaction */,
  undo: (tx, ctx, p, applied) => /* its inverse */,
  cutoff: (p) => new Date(`${p.month}T00:00:00Z`), // optional; the 7-day window caps it
});
```

- `apply` and `undo` write inside the decision's transaction, so the suggestion's status and the change
  commit together as one service write (chat's confirm needs exactly one). The decision service audits the
  module's write under the module's action, as the person, with the suggestion and the agent beside it.
- `sensitive: true` (pay, bank files, access, credentials): the approver can't be the person the agent acted for.
- `irreversible: true` (external effects): no undo; two different people approve, and the second runs it.
- `fields`: classified fields of the proposed change (002 classes), masked for viewers who may not see them.
- `jobs`: the recurring schedules (029) that make the kind, listed on the Suggestions screen.

## Services and tools

`@amax/agents/server`: `createSuggestion`, `acceptSuggestion`, `querySuggestion`, `dismissSuggestion`,
`undoSuggestion`, `listSuggestions`, `getSuggestion`, `suggestionRun`, `agentJobs`. MCP tools:
`list_agent_suggestions`, `get_agent_suggestion`, `get_agent_suggestion_run`, `list_agent_jobs`,
`suggest_change` (any agent), and `accept_`, `query_`, `dismiss_`, `undo_agent_suggestion` (chat only: a
person on the confirm card). A suggestion outside the viewer's scope for its kind's permission is never
returned.

## Agent runs

`agents.run` is a durable workflow: a `think` step (one bounded model turn through `@amax/ai`, offered
only the read tools on the run's allow-list plus `propose_suggestion`), a `suggest` step, then
`waitForEvent("agents.suggestion.decided")` per suggestion. A run over untrusted text names its external
source, and every suggestion it makes shows it. Tool calls and cost are on the steps, masked by class.

## Events

`agents.suggestion.created`, `agents.suggestion.decided` (`accepted` or `dismissed`), `agents.suggestion.queried`, `agents.suggestion.undone`.

## Tests

`pnpm --filter @amax/agents test` with `DATABASE_MIGRATE_URL` set.
