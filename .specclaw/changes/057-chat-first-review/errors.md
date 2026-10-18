# Error Journal: 057-chat-first-review

Build errors and their resolutions.

---

## [GENERAL] Investigation 1 — CI e2e:auth releases.spec.ts:35 times out: after the re-tag, 'Ask amax to record a deployment' never gets a Confirm card (2 of 2 runs at bc391b2; passes locally)

**When:** 2026-10-17 21:08 UTC
**Status:** open, architecture question (four hypotheses withdrawn)
**Failure-Sig:** —
**Reproduce:** `CI pull_request run of #50 (pnpm --filter @amax/web e2e:auth); locally: focus main h1 after the chip fills the prompt, then pressSequentially` → exit 1
**Evidence:** CI error-context.md (run 39068827537): the message sent was 'ProdRecord a deployment of CON v2.4.1 to ', so the scripted model fell back to list_projects ('I found 4 results'), and there was no card. The h1 had been announced ('Contoso Portal v2.4.1') and focus had left the chat input. Local experiment: stealing focus to the h1 after the chip, then typing, gives exactly 'ProdRecord ...'.
**Hypothesis 1 (withdrawn):** slow RSC navigation leaves the panel stale. 2.5s RSC delay locally: passes
**Hypothesis 2 (withdrawn):** slow client CPU races the panel state. 6x CPU throttle locally: passes
**Hypothesis 3 (withdrawn):** timezone. The local server already runs in UTC, as CI does
**Hypothesis 4 (withdrawn):** useRouteFocus moves focus to the new page's h1 when chat's router.replace commits, and the chat input loses focus mid-typing. With the fix in 89d47b2, CI run 39069721741 still sent 'ProdRecord a deployment of CON v2.4.1 to '. The new 'h1 not focused' assertion passed, and the snapshot shows focus on the document root, not the h1. So something else blurs or remounts the input. The attempt was reverted.
**Fix:** none yet. See the architecture question below.
**Ruled out:** slow RSC fetches, a slow client CPU, the timezone, and route focus to the h1.
**Known:** on CI only (3 of 4 runs without tracing; 0 of 2 with tracing on), the record step's message is sent with 'Prod' in front of the prompt. At failure, focus is on the document root (not the input, not the h1). Locally it doesn't reproduce: CI=1, cold build, fresh DB, 6x CPU throttle and 2.5s RSC delay all pass. Forcing the input to blur after the chip fills it reproduces the exact text: Playwright refocuses with the caret at 0.
**Architecture question:** after a confirmed re-tag, chat starts a client-side router.replace while confirmChat's revalidatePath("/", "layout") refresh is still in flight. Something in that window blurs or remounts the chat input (focus ends on the document root). Should a write that renames the page's record navigate the page from inside the chat panel at all? The alternatives: (a) don't navigate, and show an 'Open v2.4.1' link on the done card; (b) do a full navigation and reopen the conversation from History; (c) keep router.replace, but only after the refresh settles, and stop the e2e helper from typing into a pre-filled input (fill the whole text instead). Each changes 057's 'follow the re-tag' behaviour, so it is a decision, not a patch.

---
