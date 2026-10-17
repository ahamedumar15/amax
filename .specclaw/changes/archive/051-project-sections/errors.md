# Error Journal: 051-project-sections

Build errors and their resolutions.

---

## [GENERAL] Investigation 1 — On /delivery/p/CON the section tabs (Board, Proposals, Releases, Risks and decisions, Team, Contract) appear not selectable

**When:** 2026-10-17 18:07 UTC
**Status:** upheld
**Failure-Sig:** —
**Reproduce:** `Playwright (signed-in e2e config): open /delivery/p/CON, hit-test each .tabs child with elementFromPoint, click Proposals` → exit 0
**Evidence:** Every tab is hit-testable (top element = itself, pointer-events auto). Proposals navigates to /delivery/proposals?project=CON. Risks/Team/Contract are <button aria-disabled=true> with no handler and no disabled styling (ProjectPage.tsx:103-105); Board is a pressed button, not a link; Releases links to the unfiltered global list.
**Hypothesis 1 (withdrawn):** an overlay (pin, hint line or sticky header from 046/047) covers the tabs: elementFromPoint returns each tab itself
**Hypothesis 2 (upheld):** three tabs are placeholder buttons from 041 that look enabled but have no action, and the two working ones leave the project page, so the section menu reads as broken
**Fix:** 051-project-sections: real in-project section routes; placeholder sections render an empty state naming the change that brings them

---
