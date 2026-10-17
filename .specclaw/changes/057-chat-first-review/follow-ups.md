# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B3] `modules/time/server/sheet.ts:13` `getTimesheet` with a `project` that matches no row in the week returns an empty `rows` array with `total: 0` and the week's status, instead of not-found. A stale pin, for example after a project rename, then reads as '0 h logged' rather than 'record not found'. Fix: return null when `project` is given and no row matches. (round 1) **Fixed** in 3058810 (returns null). <!-- fp:18e4abcedf1f -->
- [minor B4] `packages/ai/src/scripted-writes.ts:10` Each Ask amax prompt is now written twice: as a template literal in the module UIs and as a regex in the scripted provider. A wording change in the UI quietly breaks the scripted path, and only e2e runs catch it. Fix: export the prompt builders from one place and have the scripted rules depend on them, or add a unit test that feeds every UI prompt template through `scriptedWrite`. (round 1) **Partly fixed** in 3058810: Team time prompts come from `modules/time/ui/prompts.ts` and `modules/time/tests/prompts.test.ts` feeds them through `scriptedWrite`. Delivery, allocations and presales prompts are still written twice. <!-- fp:c80419d3172e -->
- [minor B10] `modules/delivery/ui/ReleasePage.tsx:25` The 'Tag and proposals' card used to list every candidate proposal with its include state. It now lists only the included ones, so a reviewer can no longer see which proposals could be added before asking chat to change the set. Fix: list the excluded candidates as well, read-only and marked as not included. (round 1) <!-- fp:854c791f48aa -->
- [minor B6] `modules/allocations/ui/CopyMonth.tsx:6` `months[0]` is used unguarded (`monthLabel(months[0])`, `months[0].slice`). The old select rendered empty when there were no months; this throws during render if `grid.months.slice(0, -1)` is ever empty. Render the button only when months.length > 0. (round 1) <!-- fp:1262ca667eb9 -->
- [minor B6] `modules/presales/server/update.ts:42` The person only learns that the owner link will be cleared (`ownerLinked: false` and the note) after confirming. The confirm card they approve does not mention it. Show this on the pending action, or reject an unlinkable owner name until the person confirms they want a name-only owner. (round 2) <!-- fp:47f62857cae6 -->
- [minor B3] `packages/ai/src/scripted-writes.ts:9` weekIds only accepts names without ',' or '('. Any other display name, such as 'Silva, Nimal' or a fixture name with '(fictional)', makes the whole bulk prompt map to zero calls. The scripted model then silently does nothing instead of failing the e2e step. Match from the '(week id <uuid>)' anchors instead, or throw when the list doesn't parse. (round 2) <!-- fp:5dcd4f314b9c -->
- [minor B1] `modules/allocations/server/row.ts:9` The name is trimmed, but the employee-number match is not. A padded employee number misses the exact match, falls through to the name match and returns null ('not found'). Trim `ref.person` once and use it for both matches. (round 2) <!-- fp:952762aa1fe8 -->
- [minor B1] `modules/delivery/server/queries.ts:217` getProposal and getEnvironment match the key and name exactly, so case matters. Chat or MCP callers can pass free text, which then reads as 'not found'. Fix: normalise the lookup, the same way the other key lookups in this module are done. (round 2) <!-- fp:a3ca98440d8d -->
- [major B1] `apps/web/components/chat/Chat.tsx:185` This fix is for one case only. It keys the pins created from now on by id, but pins that already have `{ projectKey, version }` arguments are left alone. That covers pins saved in `chat.conversation` by 054 and pins open in a live conversation that were made before this deploy. `get_release`, `get_release_history` and `get_deployment` all still accept those arguments, and nothing rewrites them when `moved` is applied. A re-tag still leaves them pointing at a release that is gone. The round-2 finding asked for the conversation's pins to be rewritten on `moved`, and that part is still not done. Fix: when `moved` is applied, rewrite this conversation's pins whose arguments name the old project key and version so they use `releaseId`. Or add a one-off migration that converts stored release and deployment pins to ids. (round 3) **Partly fixed** in 6ff7fb6/d74edcf (repin of the confirming person's conversations); the rest is the escalated class below. <!-- fp:cc5769d324c2 -->
- [major B1] `modules/delivery/mcp.ts:41` Release and deployment pins now use ids so that a rename can't strand them. Environment pins have the same problem and were not changed. `get_environment` is still looked up by `(projectKey, name)`, and `upsert_environment` in the same file can rename an environment (`rename`). Fix: add an `environmentId` lookup to `get_environment`, key the environment-row pins on it, and extend the post-rename test to cover an environment rename. (round 3) **Fixed** in 6ff7fb6 (environmentId pins, rename test). <!-- fp:fdfb32543a18 -->
- [minor B1] `modules/delivery/ui/ReleasePage.tsx:17` Each pin's label is a snapshot (`${name}`, which contains the version), even though its arguments are now keyed by id. After a re-tag, the pin chip in the conversation still shows the old version while it resolves to the release under its new version. Fix: refresh the label from the result when the pin resolves, or rewrite the labels when `moved` is applied. (round 3) **Open**, see the round-5 minor on id-keyed labels. <!-- fp:db2ad98afc59 -->
- [minor B1] `modules/delivery/server/queries.ts:233` getDeployment reads in two separate transactions. The first `read` checks project and version scope, and the second gets the row through getRelease. The result combines `hit.version` from the first read with the deployment row from the second. If a re-tag commits between the two reads, the returned version is stale and has already passed the scope check. Fix: do the scope check and the row select in a single `read`. (round 3) <!-- fp:4cae4ca225bf -->
- [minor B1] `apps/web/lib/chat-move.ts:45` The label is rewritten by replacing every substring match (`split(old).join(new)`), so a short old name also changes unrelated parts of the label, such as the project key or project name. Replace only the label part built from the old name, for example the last whole-word match or a rebuilt label. (round 4) **Fixed** in d74edcf (`relabel` swaps the last whole-word match). <!-- fp:d34a5138c912 -->
- [minor docs] `modules/delivery/server/queries.ts:203` The docblock 'One release with its proposals and full deployment history…' is now stranded above `ReleaseRef`/`releaseWhere`, so `getRelease` has lost its doc comment and `ReleaseRef` has two. Move it back above `getRelease`. (round 4) **Fixed** in d74edcf. <!-- fp:a4fa8fc4d8b4 -->
- [minor B4] `modules/delivery/server/queries.ts:208` When an id is given, the lookups now treat the narrowing project key differently. get_environment and get_deployment return null when the id belongs to another project. get_release and get_release_history (releaseWhere/isRelease) ignore projectKey/version when releaseId is set. Pick one rule for every ref read. (round 4) **Fixed** for releases in d74edcf; `get_environment` still ignores `name` with an id (round-5 major below). <!-- fp:b6d8336ea15c -->
- [minor B1] `modules/delivery/ui/ReleasePage.tsx:17` Release-page pins are keyed on ids, so `repinAll` never matches them (`match` needs projectKey/version in args), and their labels are never updated. After a confirmed re-tag, the open conversation's pins still read 'CON v2.4.0 proposals' and 'CON v2.4.0 on Prod, …' while the record is now v2.4.1. Consider a repin that matches on `releaseId` and only relabels. (round 5) <!-- fp:4898cc6d507a -->
- [minor B1] `packages/ai/src/scripted-writes.ts:27` The scripted rules match versions and environments with `(\S+)`, and opportunity numbers with `PS-\d{4}`. The Ask amax prompts can carry versions with spaces (the delivery test re-tags to '2.3.1 rc/1'), environment names with spaces, and PS numbers of up to 6 digits (`NUMBER`). Those prompts fall through to list_projects in e2e and local demos. (round 5) <!-- fp:1f8fed54b493 -->

## Open after the 5-round cap

Round 5 (the `--final` pass) exited 4, escalate: the "stale pin after a rename" class survived two fixes
(round 3: id-keyed pins; round 4: repin of saved conversations). Per the cap, no further patches were made
after round 5. Open majors from round 5:

- [major B1, escalated] `apps/web/app/actions/chat.ts:38`, `packages/chat/src/repin.ts:51` Repin only runs
  when a rename is confirmed in chat, and only over the confirming person's conversations. A rename made over
  MCP (an agent or pipeline calling `tag_release` / `upsert_environment` with `rename`) repins nothing, and
  other people's saved key-based pins (every pin made before 057) go stale, or point at a different release if
  the old tag is reused.
- [major B1, escalated] `modules/delivery/ui/ProjectPage.tsx:39` Proposal pins (`get_proposal`) are keyed on
  `key`, which the specclaw sync can rekey (`ProposalRekeyed`). Nothing repins on a rekey.
- [major B3, introduced in round 4] `apps/web/app/actions/chat.ts:39` `repinConversations` runs after the write
  committed but inside the same try: if it throws, the card shows an error for a write that happened, and the
  page doesn't follow the re-tag. Must be fixed before merge (own try/catch, still `state: "done"` with `moved`).
- [major B1, introduced in round 4] `apps/web/components/chat/Chat.tsx:185` After a repinning confirm the
  client replaces its pins with the saved copy, dropping pins added or removed since the last turn. Must be
  fixed before merge (apply the repin to the client's current pins instead).
- [major B4] `modules/delivery/server/queries.ts:245` `getEnvironment` with an `environmentId` ignores a given
  `name`, unlike `releaseWhere`/`isRelease`. Derive all three readers from one helper.

### Proposed redesign: pins never depend on a renamable key

1. **Every pin keys on an immutable id.** Add `proposalId` to `get_proposal` (key only narrows), as done for
   releases, environments and deployments. A review rule (R3) checks that a row PinRef's args contain an id.
2. **Old key-based pins resolve by id at read time, once.** In `@amax/chat`, when a pin is resolved
   (`runTurn`) and its tool result carries the record's id, rewrite that saved pin to the id form in the same
   turn (lazy migration). Plus a one-off backfill job that does the same for every saved conversation in the
   tenant, run by chat (its own schema), so no module writes `chat.conversation`.
3. **Drop `repin` and `repinConversations`.** With ids everywhere, a rename needs no pin rewrite. Labels are
   refreshed from the resolved record (the read tool returns a `label`), so chips never show the old name.
4. Keep `moved` (URL follow) but apply it in its own try/catch so a follow-up failure can't mask a done write.

This replaces the repin machinery added in rounds 3 and 4 rather than extending it, and needs a short
proposal of its own (it touches `@amax/chat` pin resolution and the R3 rule).
