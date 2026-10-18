# Backlog

Follow-up work that a change deliberately left out. Each item becomes its own specclaw proposal.

- [ ] **Promote an opportunity from chat** (from 043). `promote_opportunity` makes three writes: presales' claim, delivery's create under its own key, then the link. It can't be one keyed chat write, so it declares `service: null` and no longer becomes a confirm card. Before 043 every chat confirm of it ended "unknown". Make promote one service whose `run` calls the claim, the create and the link as nested commands, then declare it.

- [ ] **Public pages for signed-out visitors** (from 013). The exit questionnaire link (`/exit/<token>`) needs a page a leaver can open without an amax session. Module routes all require a session and the module's read permission. `modules/onboarding/ui/ExitPage.tsx` and `answerExit` are ready to mount. Add a platform slot for a module's public, token-gated pages (rate-limited, no shell), then mount the exit page.

- [ ] **Close an inbox find when its record is added** (from 025). "Add" opens the owning module's chat intent, and the owner's tool writes the record; the find's 006 suggestion stays open until the person accepts or dismisses it (or it expires in 7 days). Have presales, leave and helpdesk emit a created event that carries the source ref (the find id), so the inbox agent closes the find itself.

- [ ] **A "log activity" chat intent in Presales** (from 025). The inbox agent routes a sales activity to Presales' `log_opportunity_activity` by prompt, because Presales declares no intent for it. Add `presales.log-activity` and point `modules/inbox-agent/routes.ts` at it.

- [ ] **Helpdesk's ticket intent and permission** (from 025). `modules/inbox-agent/routes.ts` expects 022 to declare the chat intent `helpdesk.new-ticket`, the permission `helpdesk:ticket:create` and the table `helpdesk.ticket`. Until 022 lands that route stays dark; when it does, match the names or update the route.

- [ ] **Graph read credential label** (from 025). The inbox agent reads mail and Teams with the 031 `msgraph-read` credential, whose "used for" line in `packages/core/src/secrets/connectors.ts` still says "People, licences, devices sync". Add the inbox agent, and say which Graph permissions it needs (Mail.Read, ChannelMessage.Read.All).

- [ ] **Insights "Recurring agent work" switch** (from 025). The Teams and email scan is the 029 schedule `inbox-agent.scan`, switchable today under Settings, Workflows and on the Suggestions screen. 026 should list it with its on/off switch, as in the mock.
