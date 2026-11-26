# Recording a deployment takes the project lock

**Change:** 129-deployment-project-lock · **Created:** 2026-11-26 · **Review:** change

## Problem

123's final review pass left one major open (123's `## Verify`). `record_deployment` locks only the release row, while
release edits and environment changes take the project row lock first. A deployment to QA and making QA the Prod
environment can therefore run together, each miss the other's write, and a Prod release keeps a live deployment on its
Prod environment yet stays open; the hourly check then turns it Off track and notifies its PM.

## Mock Delta

What changes on screen, and where to see it: [`129-deployment-project-lock`](../../mock/index.html#129-deployment-project-lock)

- No screen changes. The section shows the case: a release deployed to QA while QA is made Prod ends Completed, not
  Off track.

## Acceptance Criteria

1. **AC-1 One lock order.** `recordDeployment` takes the project row lock (`lockProject`) before it locks the release,
   the order `openRelease`, `createRelease`, `upsertEnvironment` and `removeEnvironment` use (123). `voidDeployment` is
   unchanged: since 126 a void never changes a release's status.
2. **AC-2 Deployment and environment change at once.** A deployment of an open Prod release to QA and making QA the
   Prod environment, run together, always end with the release Completed on that QA deployment, once (one completion
   in its history), whichever commits first. Tested with two sessions and the order forced: the environment change
   holds the project lock while the deployment waits, and the other way round.
3. **AC-3 Nothing else changes.** The other deployment behaviour (completion, Prod releasing proposals, the failed
   notice, the events) is as before; the existing release and deployment suites pass.

## Tasks

No UI task: no screen changes.

- [ ] `T1` — AC-1 AC-3: `recordDeployment` takes `lockProject` before `releaseOf`; README line
  Files: modules/delivery/server/services.ts, modules/delivery/README.md
- [ ] `T2` — AC-2 AC-3: two-session tests, both orders forced (environment change first, deployment first), one completion on the QA deployment; the existing suites
  Files: modules/delivery/tests/deployment-lock-129.test.ts
  Depends: T1

## Verify
