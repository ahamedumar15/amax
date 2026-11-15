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

**Amendment 1 (2026-11-15, product owner, after the build):** on `/delivery`, the **New project** button opened chat
with "tell me the details" and waited for typing, so the card didn't come first (AC-3), and chat suggested nothing on
the project list. The button now sends at once, and chat suggests setting up a project and linking a repo there
(AC-13, AC-14).

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
13. **AC-13** (Amendment 1) The **New project** button on `/delivery` opens chat and sends "Set up a new project" at
    once: the Set up a project card is the first thing chat shows, with nothing typed.
14. **AC-14** (Amendment 1) Opening chat on `/delivery` suggests **Set up a project** and **Link a repo to a project**
    (each only for someone who may do it) and **Which projects need attention?**; on a project's page with no linked repo
    it suggests **Link a repo** to someone who may link it. A suggestion fills the message box, as chat's suggestions do.

## Tasks

- [x] `T1` — Editable fields on chat's confirm card: a tool's card may declare a `form` (text fields, chip groups with
  an "other…" text field, an optional collapsible section); the card renders it with labels, field errors announced
  (aria-live), radio-group chips, keyboard order, both themes, and the button label following the fields (AC-4, AC-5,
  AC-6, AC-7, AC-11)
  Files: packages/core/src/module.ts, packages/chat/src/engine.ts, apps/web/components/chat/CardForm.tsx,
  apps/web/components/chat/ConfirmCard.tsx, apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css
- [x] `T2` — Confirm with edits: `confirmChat` sends the card's edited fields; the engine merges only fields the card
  declared, parses the tool's input again, reruns its propose check, and runs it under the card's one key, so a refusal
  keeps the card open with the reason by its field and a second press writes nothing more; a `checkCardField` action
  answers a field's check while it is edited (AC-4, AC-8)
  Files: packages/chat/src/engine.ts, apps/web/app/actions/chat.ts, apps/web/components/chat/Chat.tsx,
  packages/chat/tests/card-form.test.ts
  Depends: T1
- [x] `T3` — `set_up_project`: one `defineService` that creates the project with its environments, makes the caller
  manager and, with a repo, links it (link step shared with `link_project_repo`), audited, both events emitted; MCP tool
  with `delivery:project:create` plus `delivery:project:link` when a repo is given, the repo URL checked as linking
  checks it, and a propose check for key format and a free key (AC-1, AC-2, AC-8, AC-12)
  Files: modules/delivery/server/set-up-project.ts, modules/delivery/server/repo-sync.ts,
  modules/delivery/server/project-create.ts, modules/delivery/mcp.ts, modules/delivery/tests/set-up-project-106.test.ts
- [x] `T4` — The Set up a project card and intents: the card's form (name; key suggested from the name with "✓ free ·
  proposal ids KEY-001" / taken / format; client chips from existing clients plus Internal and a new one; four billing
  chips; PM "You"; repo URL and branch chips with main preselected), titled and labelled "Create KEY and link repo" or
  "Create KEY"; "New project" calls it in the first reply with what the message or pins tell; "Link a repo" gets the
  repo and branch form on `link_project_repo`'s card; billing options include Internal; no card without
  `delivery:project:create` (AC-3, AC-4, AC-5, AC-6, AC-9, AC-10, AC-12)
  Files: modules/delivery/chat.ts, modules/delivery/server/set-up-project-card.ts, modules/delivery/server/write-cards.ts,
  modules/delivery/mcp.ts, modules/delivery/tests/chat-106.test.ts
  Depends: T1, T3
- [x] `T5` — End to end and docs: the scripted chat sets up a project with a repo (edits the key on the card, sees a
  taken key refused, creates, sees the receipt and the project page's Repo sync card) and links a repo to an existing
  project; keyboard-only pass and axe check of the card; Delivery README's chat section (AC-3, AC-7, AC-8, AC-9, AC-11)
  Files: apps/web/tests/e2e/set-up-project.spec.ts, modules/delivery/README.md
  Depends: T2, T4
- [x] `T6` — Amendment 1: an intent button may send its message at once (`send`), and New project on `/delivery` does;
  Delivery's chat suggests Set up a project, Link a repo to a project and Which projects need attention? on `/delivery`,
  and Link a repo on a project page with no repo, each only when allowed; the scripted model answers "Set up a new
  project"; e2e for the button and the suggestions (AC-13, AC-14)
  Files: packages/ui/src/components/PinButton.tsx, apps/web/components/chat/Chat.tsx, modules/delivery/ui/ProjectsPage.tsx,
  modules/delivery/chat-suggestions.ts, packages/ai/src/scripted-writes.ts, modules/delivery/tests/chat-106.test.ts,
  apps/web/tests/e2e/set-up-project.spec.ts
  Depends: T5

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

Quality: not_run (`specclaw-quality-scan .`: jq "Argument list too long" on this Windows host, as in 066–105; no refactor
made). Every new file is under 80 lines.
