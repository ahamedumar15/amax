# Follow-ups

What 087 left open of 081's follow-ups, and what its build found.

- **[from 081, round 3] The hours write uses a second connection.** `modules/time/server/proposal-hours.ts`:
  `setProposalHours` runs as a service in its own transaction while the handler's transaction holds the project locks.
  If the handler fails after the service commits, a retry writes a second audit row. Moving the write after the
  handler's transaction changes the event contract. Out of scope for 087.
- **[from 081, round 3] Keying the history-line pin on the line.** `pinOf.event` resolves to the proposal's id. The
  registry's pin check needs a UUID id, and a line id ("audit:12") isn't one, so this needs a pin-spec change in
  `@amax/mcp`. Out of scope for 087.
- **[found in 087 T7] `time.entry.project_id` references `delivery.project`.** This key has been there since Time's first
  migration (0001), so it is older than 081. The module standard says a module's migrations touch only its own schema.
  Dropping it needs the same check-on-write that `getProposalRef` gives proposals: Time already validates projects
  through `getProjectRef`. It's for a change of its own.
- [minor B2] `modules/delivery/tests/proposal-lifecycle.test.ts:99` The "withdrawn by the repo" case writes `meta = '{"withdrawn": true}'` straight into the table instead of driving the sync import (`sync/import.ts:82`), which is the real path that withdraws a spec proposal. It also replaces the whole meta, so `source` and the other meta stay as a hand-made row has them. Drive it through the import of a spec proposal whose folder is gone. (round 1) <!-- fp:a28cd5ff0568 -->
- [minor B1] `modules/delivery/tests/pin-offers.test.ts:128` The AC-6 test's `finally` resets the installed list to ["delivery","time"] instead of the value it had before. If the suite started unset (null, where the table check decides), every later test in the file now runs with an explicit list. Save the prior list and restore it, or reset it in afterEach. (round 1) <!-- fp:df67ab99438a -->
