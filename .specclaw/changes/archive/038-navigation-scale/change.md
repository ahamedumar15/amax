# Navigation that scales: one heading per group, a Settings hub, and a rail that overflows well

**Change:** 038-navigation-scale · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/ui (rail), packages/core (manifest nav), apps/web (shell)` · **Depends on:** [001](../archive/001-amax-foundation/change.md)

## Problem

With every module installed, an Admin sees 21 rail items, more than fit on a laptop screen. The rail scrolls with a hidden scrollbar, so Operations and the current screen sit out of sight with no sign there is more. Each new admin screen would add another item. The shell needs a place for configuration screens and a rail that stays usable however many modules a tenant installs.

## Mock Delta

What changes on screen, and where to see it: [`038-settings`](../../mock/index.html#038-settings)

A Settings item at the end of Operations opens a hub with Connections and keys, Data retention, AI and data, Backups and export, and API and webhooks (031–035). Those screens leave the rail and gain a "Settings /" breadcrumb, and Settings stays highlighted on them. The rail keeps the current item in view and fades its top or bottom edge when more items are out of sight. HR sees only the hub cards it may open.

## Acceptance Criteria

1. **AC-1** A manifest nav entry declares `group` (work, people, business, ops) or `parent: 'settings'`. The registry emits one heading per group, in a fixed group order, whatever order modules are discovered in. A test installs modules in shuffled order and gets one heading per group.
2. **AC-2** Entries with `parent: 'settings'` appear as cards on the Settings hub (title, one-line description, one status line from the module), not in the rail. Their screens show a "Settings /" breadcrumb, and the rail marks Settings as current.
3. **AC-3** When the rail is taller than the viewport, it scrolls on its own, the current item is scrolled into view on every navigation, keyboard focus scrolls the focused item into view, and the top or bottom edge fades while items are hidden there. A Playwright test at 1440×800 with every fixture module installed finds the current item visible after navigating to the last screen.
4. **AC-4** Hub cards and rail items follow the same role check as their screens. A test signs in as HR and sees only Data retention on the hub.
5. **AC-5** The 001 shell visual test still passes (rail logo and first item unchanged at 1440 and 390 px), and the phone More sheet lists Settings.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"). 047 already built the Settings
hub, its breadcrumbs and Settings staying current on its screens, and the registry already merges items into one heading
per group. These tasks close the rest.

- [x] `T1` — The rail overflows well: it scrolls on its own, keeps the current item and the focused item in view, and fades the edge where items are hidden. Backups and export leaves the rail for the hub. The More sheet lists Settings (AC-3, AC-5)
  Files: packages/ui/src/components/Rail.tsx, packages/ui/src/styles/shell.css, apps/web/lib/registry.ts, apps/web/tests/e2e/shell.spec.ts
- [x] `T2` — Hub cards and the Settings rail item follow their screens' role checks. Anyone who may open a card sees Settings, and HR sees only Data retention (AC-4)
  Files: apps/web/app/(app)/settings/page.tsx, apps/web/lib/admin/status.ts, apps/web/lib/registry.ts, apps/web/tests/e2e/admin.spec.ts
- [x] `T3` — A manifest nav entry declares `group` or `parent: 'settings'`. The registry emits one heading per group in fixed order whatever the discovery order. Settings entries become hub cards (title, blurb, the module's status line) with a "Settings /" breadcrumb, and Settings stays current (AC-1, AC-2)
  Files: packages/core/src/module.ts, apps/web/lib/registry.ts, apps/web/lib/admin/status.ts, apps/web/components/shell/Shell.tsx, apps/web/tests/registry-038.test.ts
  Depends: T2

## Verify

**Verdict:** PASS

- AC-1: pass — `NavEntry` (`packages/core/src/module.ts`) may name its own `group` or `parent: "settings"`. `moduleNav` sorts into one heading per group in the fixed order Work, People, Business, Operations. Test: `apps/web/tests/registry-038.test.ts` "AC-1" (five shuffled discovery orders, plus a late module with an Operations entry, give the same headings and hrefs).
- AC-2: pass — `settingsEntries` turns `parent: "settings"` entries into hub cards (title, blurb, the module's `status` line), gated by `<module>:read`, and they're left out of the rail. The module page adds a "Settings /" breadcrumb, and the Shell marks Settings current for those paths. The platform's own Settings screens already had both (047). Test: `registry-038.test.ts` "AC-2".
- AC-3: pass — the Rail scrolls on its own, scrolls the current item into view on every navigation and the focused item on focus, and sets `data-fade-top` or `data-fade-bottom` (CSS mask; not on the phone bar). e2e: `admin.spec.ts` "038 AC-3, AC-5" at 1440×800 as Admin (the rail overflows and fades at the bottom; after navigating to the last item it is current and in view, and the top fades; focusing Overview brings it back into view).
- AC-4: pass — each hub card runs its screen's own check (`CARDS` in `apps/web/lib/admin/status.ts`). Settings shows in the rail when any card would open (`seesSettings`), and `settings_overview` lists only those cards. e2e: `retention.spec.ts` "032 AC-6" (HR has Settings current on Data retention, and the hub lists only Data retention). Backups and export left the rail (`admin.spec.ts`, `backups.spec.ts`).
- AC-5: pass — `shell.spec.ts` (001 visual: rail logo and first item vs. the mock at 1440 and 390 px) passes. The phone More sheet lists Settings (`admin.spec.ts` "038 AC-3, AC-5").

Commands (worktree, Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm turbo run lint` → 0 (23/23); `check-graph` → 0; `check-module-standard` → 0
- `pnpm turbo run test --continue` → 0 (22/22 packages)
- `pnpm --filter @amax/web build` → 0
- `playwright test shell.spec` → 1/1
- `playwright test --config playwright.auth.config.ts` → 78/78. On the first run `auth.spec` "AC5 … sign out" failed once (the URL stayed `/delivery` after sign-out). It then passed 15/15 with `--repeat-each=3`, and the full rerun was green. It's an existing flaky test, not touched by this change.
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run: it fails with "jq: Argument list too long" on this repo.

Screenshots: `.specclaw/changes/038-navigation-scale/shots/app-admin.png` (Settings hub as Admin at 1440×800; the rail is scrolled so the current Settings item is in view) and `.specclaw/changes/038-navigation-scale/shots/mock.png` (`#038-settings`). Compared: same hub layout and cards. The app has the extra cards 047 and 048 added (Scheduler, Integrations, AI usage, Audit and trace). The HR view is covered by the e2e above: the fresh e2e database has no HR user until `retention.spec` creates one.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).
