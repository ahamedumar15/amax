# Follow-ups: 098-renumber-duplicate-changes

- [bug] Repo sync stored `AMX-062: undefined`, `AMX-074: undefined` and `AMX-075: undefined` as skip lines on the CI pushes at
  2026-11-10 09:30 UTC (`9613db6`) and 12:41 UTC (`25e7d86`). The 08:51 UTC push (`ecdedfc`) stored the full
  "two changes numbered …" text. `modules/delivery/server/push.ts:114-117` and `modules/delivery/sync/duplicates.ts`
  build the text correctly at those commits and at HEAD, so check which build amaxerp.com was running then. Add a test
  that pushes a duplicate pair through the deployed path and checks the stored line.
