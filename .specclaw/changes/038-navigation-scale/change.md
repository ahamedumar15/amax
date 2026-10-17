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

## Verify
