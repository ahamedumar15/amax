# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor AC-8] `modules/delivery/tests/portfolio-121.test.ts:11` AC-8 asks for unit tests of each rule's branches from AC-1 to AC-6. There is no test for AC-6 ('No manager' for a null manager). The AC-2 'Nothing open' branch in ProjectsPage is never rendered in a test. The e2e checks only AMX's Margin and Manager cells, not its computed Sprint, Health or Next release. Add those cases. (round 1) <!-- fp:77cf18d295d3 class:other -->
- [minor docs] `modules/delivery/mcp.ts:39` The `list_projects` description names `healthReason` but not `nextReleaseNote` or `openProposals`, which the tool now returns and AC-4 names. Add them so agents know these fields exist. (round 1) <!-- fp:d1ea722d5d08 class:other -->
- [minor docs] `.specclaw/changes/121-agent-first-portfolio-columns/change.md:54` T1 says Progress reads 'N of M tasks'. Amendment 1 and the code use 'N of M'. AC-3 asks for the reason as `sr` text, but the code shows it as a visible `<small>` plus a `title`. Bring the task text in line with what shipped. (round 1) <!-- fp:b816fcb7197f class:other -->
