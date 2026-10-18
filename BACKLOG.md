# Backlog

Follow-up work that a change deliberately left out. Each item becomes its own specclaw proposal.

- [ ] **Promote an opportunity from chat** (from 043). `promote_opportunity` makes three writes: presales' claim, delivery's create under its own key, then the link. It can't be one keyed chat write, so it declares `service: null` and no longer becomes a confirm card. Before 043 every chat confirm of it ended "unknown". Make promote one service whose `run` calls the claim, the create and the link as nested commands, then declare it.

- [ ] **Public pages for signed-out visitors** (from 013). The exit questionnaire link (`/exit/<token>`) needs a page a leaver can open without an amax session. Module routes all require a session and the module's read permission. `modules/onboarding/ui/ExitPage.tsx` and `answerExit` are ready to mount. Add a platform slot for a module's public, token-gated pages (rate-limited, no shell), then mount the exit page.
