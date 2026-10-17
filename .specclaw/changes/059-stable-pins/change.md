# Stable pins: keyed on ids, labels refreshed on read

**Change:** 059-stable-pins · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/chat` · **Follows:** 057 review (escalated class)

## Problem

The 057 review escalated a class it could not close in 5 rounds. Pins are stored with the record's name (release tag, environment name, proposal key), so a rename made outside the confirming person's chat leaves saved pins stale. That covers a rename over MCP, a rename by an agent or pipeline, and a specclaw sync rekey. A stale pin can even point at a different record if the old name is reused. Round 4 added "repin the confirming person's conversations", which covers only one path.

## Mock Delta

None. Pins look the same; a renamed record's pin shows its new name.

## Acceptance Criteria

1. **AC-1** Every `PinRef` resolves by a stable id (UUID), never by a name or key. Each read tool that resolves pins accepts an id. The tool registry rejects a pin-resolving read tool that has no id path, enforced by a check run at startup and in a test.
2. **AC-2** Old key-based pins in `chat.conversation` are migrated lazily. When a conversation is opened or a pin is resolved, a key-based pin is looked up once and rewritten to its id. If it can't be found, it shows as "No longer available" and is never resolved to a different record. A test reuses an old tag and shows the old pin doesn't move to the new release.
3. **AC-3** A pin's label is refreshed from the record each time it is read, so a rename via chat, MCP, agent or sync shows the new name everywhere without any repin step.
4. **AC-4** The 057 repin step (`packages/chat/src/repin.ts`, `doneOutcome`'s repin, the panel's `repinAll`) is removed.
5. **AC-5** A table test renames a release, an environment and a proposal (sync rekey) through each path: chat confirm, MCP call and job. Saved pins still resolve to the same record and show the new label.
6. **AC-6** Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

## Verify
