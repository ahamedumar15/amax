# Error Journal: 057-chat-first-review

Build errors and their resolutions.

---

## [GENERAL] Investigation 1 — CI e2e:auth releases.spec.ts:35 times out: after the re-tag, 'Ask amax to record a deployment' never gets a Confirm card (2 of 2 runs at bc391b2; passes locally)

**When:** 2026-10-17 21:08 UTC
**Status:** upheld
**Failure-Sig:** —
**Reproduce:** `CI pull_request run of #50 (pnpm --filter @amax/web e2e:auth); locally: focus main h1 after the chip fills the prompt, then pressSequentially` → exit 1
**Evidence:** CI error-context.md (run 39068827537): the message sent was 'ProdRecord a deployment of CON v2.4.1 to ', so the scripted model fell back to list_projects ('I found 4 results'), and there was no card. The h1 had been announced ('Contoso Portal v2.4.1') and focus had left the chat input. Local experiment: stealing focus to the h1 after the chip, then typing, gives exactly 'ProdRecord ...'.
**Hypothesis 1 (withdrawn):** slow RSC navigation leaves the panel stale. 2.5s RSC delay locally: passes
**Hypothesis 2 (withdrawn):** slow client CPU races the panel state. 6x CPU throttle locally: passes
**Hypothesis 3 (withdrawn):** timezone. The local server already runs in UTC, as CI does
**Hypothesis 4 (upheld):** useRouteFocus moves focus to the new page's h1 when chat's router.replace commits. On a slow runner that lands after the chip has filled the prompt, so the chat input loses focus mid-typing and the refocused caret sits at 0
**Fix:** chat marks the path it navigates to (keepFocusFor), and useRouteFocus announces that screen but leaves focus in the chat, once, for that path only
**Proof:** e2e assertion (h1 not focused after the follow) fails without the fix and passes with it; full e2e:auth with CI=1 57/57; route-focus unit table

---
