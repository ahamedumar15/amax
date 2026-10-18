# Mock: close the 047, 048 and 049 sections

**Change:** 062-mock-unclosed-sections · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `.specclaw/mock/index.html`

## Problem

The mock's 047-admin-end-to-end, 048-chat-cost and 049-chat-history sections never close their `<section>`. Every later section is therefore nested inside a hidden one, so `#048` onwards (050–061, including all of wave 3) renders blank, and `specclaw-screenshot` of those anchors captures nothing. Five agents worked around it today by lifting their section out by hand.

## Mock Delta

What changes on screen, and where to see it: [`062-mock-unclosed-sections`](../../mock/index.html#062-mock-unclosed-sections)

- Every change's section after 047 renders under its own anchor again. Nothing inside any section changes.
- The template comment's `NNN-slug` example is left as is (it is inside a comment).

## Acceptance Criteria

1. **AC-1** Every `<section data-change>` in the mock closes before the next one starts (a check script counts the opening and closing tags per section, ignoring comments, and exits 1 on a mismatch).
2. **AC-2** `specclaw-screenshot` of `#048-chat-cost`, `#055-it-admin-role` and `#036-compliance-registers` each captures a non-blank section, and no other section's markup changes (the diff only adds closing tags).

## Tasks

## Verify
