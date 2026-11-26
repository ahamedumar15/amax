# Release tracking, phase 5: the project's PM hears when a release goes Off track

**Change:** 127-release-off-track-notice · **Created:** 2026-11-26 · **Review:** change

## Problem

Since 126 the hourly check turns a release Off track when its target day passes without a valid deployment, but nobody
is told: the PM finds out only by opening the release list. The phase 5 brief (product owner, 2026-11-26) asks for the
project's PM to be notified once, when the release goes Off track, with its name, category, target date, status and a
link, through the existing workflow and notification infrastructure.

Decision (product owner, 2026-11-26): **keep 126's hourly check** (one schedule for every zone; a release turns Off
track within the hour after its target day ends where its project is) instead of a daily one. Already in place from
126 and kept: automatic evaluation, the status rule, history only on a change, one transaction and one audit row per
tenant run, and the workflows engine's retries and run log.

## Mock Delta

What changes on screen, and where to see it: [`127-release-off-track-notice`](../../mock/index.html#127-release-off-track-notice)

- The PM's notifications show "November Release is now Off track" with "UAT release · target 12 Dec 2026 · no
  successful UAT deployment yet" and a link to the release.

## Acceptance Criteria

1. **AC-1 The event.** Every status change a release takes (create, edit, deployment, the check) raises
   `delivery.release.status_changed` (`EVENTS.releaseStatusChanged`, contract type `ReleaseStatusChanged`: releaseId,
   projectId, projectKey, version, name, category (its label), targetDate (as "12 Dec 2026"), from, to, toLabel,
   source, href), in the same transaction as the status and its history row. A write that leaves the status as it
   was raises none. Its payload is declared for outgoing webhooks; README and contracts say so (additive).
2. **AC-2 The notice.** A notification rule `delivery.release-off-track` on that event, when `to` is `overdue`, tells
   the project's PMs (role PM, with `delivery:release:create` on the project), category releases, urgent: title
   "{name} is now Off track", body "{category} release · target {targetDate} · no successful {category} deployment
   yet", linking to the release page. It goes through the notifications module, so each person's preferences, quiet
   hours and permissions apply.
3. **AC-3 Once per transition.** A release that stays Off track through later runs raises nothing more and notifies
   no one again; a release that goes Off track, is edited back to In progress and passes its target again notifies
   again (a new transition). Completing an Off track release is a normal status change and sends no Off track notice.
4. **AC-4 Safe runs.** A run that fails part way writes nothing for that tenant (its evaluation, history rows and
   events are one transaction) and the engine retries the step; the retry finds the same releases and notifies each
   once. A failed run shows on Settings → Workflows with its error, as every workflow run does.
5. **AC-5 Tests.** The check run on a pinned day: an Off track transition notifies the project's PM (and not a PM of
   another project, nor Finance); a second run notifies no one; edited back and overdue again notifies again;
   completion sends no Off track notice; the zone decides the day (a Kiritimati project goes Off track before a UTC
   one); a run that throws part way leaves no status change, history row or notification, and its retry sends each
   notice once.

## Tasks

- [ ] `T1` — The event: `EVENTS.releaseStatusChanged` and `ReleaseStatusChanged` in the contract, built in one place from the release and its project and returned by `writeStatus` on a change; every writer (create, edit, deployment, the check) emits it with its write; payload declared in the manifest (AC-1)
  Files: modules/delivery/contracts.ts, modules/delivery/server/release-tracking.ts, modules/delivery/server/services.ts, modules/delivery/server/release-check.ts, modules/delivery/module.ts
- [ ] `T2` — The notice: rule `delivery.release-off-track` on the change to `overdue`, to the project's PMs, urgent, with the title, body and link from the payload (AC-2, AC-3)
  Files: modules/delivery/module.ts
  Depends: T1
- [ ] `T3` — Tests and docs: notice to the project's PM only, once per transition, again after a new transition, none on completion, the zone deciding the day, a run that throws part way writes and notifies nothing and its retry notifies once; README and contracts note; lint and typecheck (AC-4, AC-5)
  Files: modules/delivery/tests/release-notice-127.test.ts, modules/delivery/README.md
  Depends: T2

## Verify

<!-- Filled by verify. -->
