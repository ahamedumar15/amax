# Set up a project from one card in chat: create it and link its repo in one confirm

**Change:** 106-set-up-project-card · **Created:** 2026-11-15 · **Review:** change

## Problem

"New project" in chat asks for the name, client, key and billing one message at a time before any card appears, and
linking the repo is a second flow with three more questions. People don't know the next question until they answer the
last one, and it misses Internal billing though the tool takes it. Asked 2026-11-15 by the product owner (Umar Ahamed):
one card, already filled in, that creates the project and links its repo with one click.

**Decided 2026-11-15 (product owner):** a chat card may hold several editable fields. It is still the pending-action
confirm in chat, not a form on a page, so rule 1 holds: nothing is written until the card's button is pressed.

**Out of scope (later changes):** a team row and choosing another PM (project team, Allocations); the amax plugin
offering this setup when a sync names an unknown project; Connect GitHub.

## Mock Delta

What changes on screen, and where to see it: [`106-set-up-project-card`](../../mock/index.html#106-set-up-project-card)

In chat, "New project" (or "set up a project for the amax repo") gets one **Set up a project** card at once: Name, Key
(with "✓ free" or "taken"), Client chips, Billing chips (Fixed, T&M, Retainer, Internal), PM "You", and an optional Repo
section with Branch chips (main preselected). One button, **Create AMX and link repo** (or **Create AMX** with no repo).
"Link a repo" on an existing project gets the same Repo and Branch fields on its card instead of three questions.

## Acceptance Criteria

1. **AC-1** A new MCP write tool `set_up_project` takes `key`, `name`, `client`, `billing` (fixed, t&m, retainer,
   internal) and an optional `repoUrl` with `defaultBranch` (default `main`). It creates the project with its default
   environments, makes the caller its manager and, when a repo is given, links it, in one `defineService` transaction:
   both happen or neither. It is audited and emits the same events as `create_project` and `link_project_repo`.
2. **AC-2** `set_up_project` needs `delivery:project:create`, plus `delivery:project:link` when a repo is given, and is
   refused otherwise with the reason. The repo URL is checked as `link_project_repo` checks it: a URL holding a user
   name or token is refused.
3. **AC-3** In chat, "New project" (the intent button or plain words such as "set up a project for the amax repo")
   shows the **Set up a project** card in the first reply, with no question in text first. Every field the message, a
   pinned record or the user's projects tell is already filled; the rest are empty on the card.
4. **AC-4** Name and Key are text fields on the card. Key is suggested from the name (2–10 capitals or digits, e.g.
   "amax" → AMX) and checked as it changes: "✓ free · proposal ids AMX-001" or "AMX is taken" / "2–10 capitals or
   digits". The button is disabled while the key is invalid or taken. A note says the key can't change later.
5. **AC-5** Client offers the tenant's existing clients and Internal as chips, plus a text field for a new one. Billing
   offers four chips: Fixed, T&M, Retainer, Internal. PM reads "You" (not editable in this change).
6. **AC-6** The Repo section is optional and collapsed when empty. Its URL field and Branch chips (main preselected, the
   project's or repo's other known branches if any, and "other…" with a text field) fill `repoUrl` and `defaultBranch`.
7. **AC-7** The button names the action: **Create AMX and link repo**, or **Create AMX** with no repo. Nothing is
   written until it is pressed. After it succeeds the card folds to one line, "✓ Created AMX · amax, linked
   github.com/example/portal (main)", and the project's page shows it with the Repo sync card.
8. **AC-8** A key taken between showing the card and pressing the button (or any refusal) keeps the card open with the
   reason next to the field, and nothing is created. Pressing the button twice creates one project.
9. **AC-9** "Link a repo" for an existing project shows one card with the project, Repo URL and Branch fields (main
   preselected) instead of asking three questions; it runs `link_project_repo` as today.
10. **AC-10** A person without `delivery:project:create` doesn't get the card; chat says a PM or Admin sets projects up.
11. **AC-11** The card is keyboard-complete (Tab order Name, Key, Client, Billing, Repo, Branch, button; chips are radio
    groups), every field has a label, field errors are announced (aria-live), and it reads in light and dark themes.
12. **AC-12** `create_project` and `link_project_repo` keep working over MCP unchanged; the chat intents' billing
    options include Internal.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
