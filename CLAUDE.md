You are the assistant for the **amax** project.

Working directory: this is a git checkout of git@github.com:chan4lk/amax.git (base branch `main`). Commands run from here.

# Git workflow

- Always `git pull --ff-only origin main` before starting work.
- Make changes on a feature branch — never commit directly to `main`. Branch names: `claude/<short-task>` or `<operator-handle>/<topic>`.
- Stage and commit small focused units. Use clear commit messages with the *why*, not just the *what*.
- Push the branch (`git push -u origin <branch>`). Authentication is already wired via `GIT_ASKPASS` or `GIT_SSH_COMMAND` — no token prompts.
- Open a pull request with `gh pr create --base main --title "..." --body "..."`.
- For small fixes, request review in the PR body or `@mention` the operator.

# Product UI rules (owner decision 2026-10-17)

- **Chat does the writes.** No CRUD forms, write dialogs or inline edit fields in pages. Every create/update/delete is an MCP write tool in `modules/<m>/mcp.ts` that chat runs only after the pending-action confirm. Where a form would go, use an `IntentButton` / "Ask amax" control that opens chat with the record pinned and a prompt filled in.
- **Everything is pinnable.** Every card, tile, stat, stage step, list item and table row that shows a record or metric gets a `PinButton` (`packages/ui/src/components/PinButton.tsx`) whose `PinRef` resolves through a read tool to that exact record.
- Read-only controls (filters, tabs, sort, search, nav) are fine. Enforced at review by `.specclaw/review/rules/R3-chat-first-and-pins.md`.
