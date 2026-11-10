# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/delivery/server/agent-first.ts:13` `agentFirstLine` is exported as 'the one line' for this message, but nothing uses it. `ui/AgentFirstLine.tsx` writes its own copy, and the two already disagree: one says ': write one with', the other '· write one with'. Have the component render `agentFirstLine` (with the code styling), or delete the unused export. (round 1) <!-- fp:d8b45fbc40e7 -->
- [minor B4] `modules/delivery/ui/ProposalsPage.tsx:44` The rule 'may create by hand = !agentFirst && can(create, projectId)' is written out again here, twice: in `manual` and in the `filtered` branch. `manualProjects` in queries.ts is meant to be that one rule. Use `manualProjects` (or one shared predicate) so the page and chat can't drift apart. (round 1) <!-- fp:2264c4dafa9b -->
- [minor B4] `modules/delivery/server/push.ts:109` push.ts calls `skipReason`, then decides again which reason applied (`dupes.has(r.number)`) and replaces skipReason's unreadable text with its own. So the push and the self-sync still have two copies of the precedence and the wording. Have skipReason return a code along with its text. (round 1) <!-- fp:2be436d77ede -->
