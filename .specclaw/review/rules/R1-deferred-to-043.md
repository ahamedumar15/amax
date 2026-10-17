# R1 — Chat write-tool contract is change 043's scope

Decided by the product owner on 2026-10-17 (042 review round 9, option 2).

While reviewing 042-release-management, these are **out of scope** and must not be reported as findings
against 042. They are the acceptance criteria of `.specclaw/changes/043-chat-write-tool-contract/change.md`:

- chat write tools that write outside `defineService`, or make more than one service write, on the
  error path or racing a cancel (043 AC-1, AC-3);
- services called from inside another service's `run` (contract commands) and how they're keyed or
  counted (043 AC-2);
- the duplicated key lookup, the `Replay as unknown as R` cast, wrapped `CancelledByKeyError` (043 AC-4);
- binding replays to the writing actor (043 AC-5);
- tests that plant the lost-settle state by hand instead of failing a real settle (043 AC-6).

Everything else about the idempotency mechanism stays in scope: report it as usual.
