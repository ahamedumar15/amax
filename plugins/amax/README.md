# amax plugin for Claude Code

Developer tools for amax, over the amax MCP server. The plugin is meant to grow: each capability is
one skill under `skills/`.

| Skill | What it does |
|---|---|
| `/amax:sync-specclaw` | Pushes this repo's specclaw change status (phase, tasks, PR, verdict) to the amax project's proposals |

## Install

```text
/plugin marketplace add chan4lk/amax
/plugin install amax@amax
```

The plugin connects to `https://amax.tecbizsolutions.com/api/mcp`. Set `AMAX_MCP_URL` to use another
amax. Sign in when Claude Code asks, the first time a tool runs. If you already added amax as an MCP
server yourself, either connection works.

## Set up a repo

1. Add the project key to `.specclaw/config.yaml`:

   ```yaml
   amax:
     project: CON
   ```

2. Ask the project's PM to link the repo in amax chat: "link CON to https://github.com/example/portal".
   amax refuses pushes from any repo other than the linked one.

## Sync

```text
/amax:sync-specclaw
```

The skill reads `.specclaw/` at your current commit, asks amax for a preview, and applies after you
confirm. `.specclaw` must have no uncommitted changes, so the commit sent describes what is synced.

What amax accepts:

- **Who:** you're on the project (Engineer) or manage it (PM). Every write is recorded as "Claude for <you>".
- **Where:** only the project's linked repo. An unknown project is refused: amax never creates one from a push.
- **What:** never Released, which comes from Prod deployments. Never a step back to an earlier phase.
  Never a proposal made by hand or from another source.
- **When:** never a commit older than the last one applied from the same branch.
- **How much:** at most 200 changes per call, inside amax's per-caller rate limit. A push with nothing
  new writes nothing.

Each project's page in amax shows a **Repo sync** card: the linked repo, the last sync, and refused pushes with their reasons.

## Sync automatically with a Claude Desktop routine

The sync reads your local checkout, so it runs as a **local** scheduled task on your machine, not as
a cloud routine.

1. In Claude Desktop, open **Code**, then create a new scheduled task (routine).
2. Set the folder to the repo, and pick a schedule, for example every hour on weekdays.
3. Use this prompt:

   ```text
   /amax:sync-specclaw --apply
   ```

With `--apply`, the skill applies only a clean preview. If amax would skip anything, the run applies
nothing and reports the preview in the task's history for you to review.

## Develop

`scripts/read-specclaw.mjs` is generated from `scripts/src/read-specclaw.ts`, which reuses amax's own
specclaw reader (`modules/delivery/sync/specclaw.ts`). After changing either, run `pnpm build:plugin`
from the amax repo root. `plugins/amax/tests/reader.test.ts` fails when the bundle is out
of date.
