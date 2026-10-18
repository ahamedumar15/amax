# Backlog

Follow-up work that a change deliberately left out. Each item becomes its own specclaw proposal.

- [ ] **Career tree** (066, proposal and mock merged in #83; wave 5). One view of a person's whole history drawn as a tree: years as the trunk, grade changes as rings, projects as branches, technologies as leaves, certifications as fruit, and department, manager and entity moves as roots, with a "What changed" list and a trace panel. A new `career` module (hr importing allocations would be a cycle). Plan must check whether delivery's ingested data carries languages or dependencies for the technology tags. Proposal: `.specclaw/changes/066-career-tree/change.md`; mock: `.specclaw/mock/index.html#066-career-tree`.

- [ ] **Promote an opportunity from chat** (from 043). `promote_opportunity` makes three writes: presales' claim, delivery's create under its own key, then the link. It can't be one keyed chat write, so it declares `service: null` and no longer becomes a confirm card. Before 043 every chat confirm of it ended "unknown". Make promote one service whose `run` calls the claim, the create and the link as nested commands, then declare it.

- [ ] **Public pages for signed-out visitors** (from 013). The exit questionnaire link (`/exit/<token>`) needs a page a leaver can open without an amax session. Module routes all require a session and the module's read permission. `modules/onboarding/ui/ExitPage.tsx` and `answerExit` are ready to mount. Add a platform slot for a module's public, token-gated pages (rate-limited, no shell), then mount the exit page.

- [ ] **Close an inbox find when its record is added** (from 025). "Add" opens the owning module's chat intent, and the owner's tool writes the record; the find's 006 suggestion stays open until the person accepts or dismisses it (or it expires in 7 days). Have presales, leave and helpdesk emit a created event that carries the source ref (the find id), so the inbox agent closes the find itself.

- [ ] **A "log activity" chat intent in Presales** (from 025). The inbox agent routes a sales activity to Presales' `log_opportunity_activity` by prompt, because Presales declares no intent for it. Add `presales.log-activity` and point `modules/inbox-agent/routes.ts` at it.

- [ ] **021 grants access when helpdesk approves it** (from 022). When a resource's owner approves the support agent's `helpdesk.access` suggestion, the ticket is resolved and `helpdesk.access.approved` is emitted, but nothing is granted: someone still adds the person by hand. Map helpdesk's access resources to 021's products and groups, and have it-access handle the event by queueing the grant (without a second approval, since the owner approved it).

- [ ] **Graph read credential label** (from 025). The inbox agent reads mail and Teams with the 031 `msgraph-read` credential, whose "used for" line in `packages/core/src/secrets/connectors.ts` still says "People, licences, devices sync". Add the inbox agent, and say which Graph permissions it needs (Mail.Read, ChannelMessage.Read.All).

- [x] **Insights "Recurring agent work" switch** (from 025; done in 026). The Teams and email scan is the 029 schedule `inbox-agent.scan`, switchable today under Settings, Workflows and on the Suggestions screen. 026 should list it with its on/off switch, as in the mock.

- [ ] **Payroll pays approved reimbursements** (from 018). Expenses publishes `reimbursementsDue(tx, reader, { legalEntityId, period })` and suggests marking claims paid when payslips go out, but payroll's draft doesn't add them to net pay yet. Until it does, expenses defaults to bank. Have payroll's draft add a "Reimbursements" line from expenses' contract when expenses is installed, then make payroll the default again.

- [ ] **Receipt photos in chat** (from 018). The chat drawer has no file picker, and `@amax/ai` takes text only. So a receipt reaches expenses only through the `add_receipt` tool (MCP or API), and the receipt agent reads only the receipt's text. Add an attachment picker to chat and image input to the AI gateway, so a photo alone gets its fields suggested.

- [ ] **Billing agent identity** (from 017). Finance's billing agent reads time's project hours as a fixed Finance-role reader (`modules/finance/server/agent.ts`), because event handlers have no viewer. Give 006 agents a first-class identity that time's contract can authorise.

- [ ] **Hire creates the HR person in one step** (from 023). Accepting `recruitment.hr-record` only records HR's confirmation; HR then adds the person through hr's `add_person`. One step needs a write in `hr/contracts.ts` that runs inside the suggestion's transaction.

- [ ] **Delivery velocity, due dates and margin in delivery's contract** (from 026). Insights' delivery and commercial risks ("velocity down 32%", "due Nov 14", "margin 29.6%") are insight records because `listProjectRefs` carries none of these. Publish sprint velocity, release due dates and contract margin, then have the risk scan read them live.

- [ ] **A skills matrix in learning's contract** (from 026). "People with AI skills" and the skills-to-opportunity match need people's skills, not only certifications. Publish skills per person, then compute the AI-skills series live.

- [ ] **Promotions in hr's contract** (from 026). "Promoted this year" is an insight record. Publish promotions (grade changes with a date), then count them live.

- [ ] **RFP debriefs, client conversations and close dates in presales' contract** (from 026). Market position, the trends and the 12-month win rate (3 of 8, 38%) are insight records because `OpportunityRef` has no close date and presales publishes no debriefs or logged conversations. Publish them, then compute the win rate and its change live.

- [ ] **Insights shows experience drops** (from 037). When a group's experience score falls 1 point or more on four weeks earlier, experience emits `experience.score.dropped` and `scoreDrops()` in `modules/experience/contracts.ts` returns each drop with its source, in 026's `InsightSource` shape. Insights only shows insights it computes or records itself. Have insights read `scoreDrops` as one of its live figures (or handle the event), so the trend shows as a sourced insight.

- [ ] **Helpdesk opens the ticket for an accepted hardware fix** (from 037). Accepting the experience agent's hardware fix emits `experience.fix.accepted` (fix `ticket`). Today the person then raises the ticket through "Open ticket", which opens chat in `helpdesk.new-ticket` with the fix pinned. Have helpdesk handle the event and open the Hardware ticket itself, as it does for onboarding's joiner laptop.

- [ ] **A person's own experience on their profile** (from 037). `get_my_experience` and `myExperience()` give a person their own devices and score, the only person-level read. hr's profile page doesn't show it yet. Add a profile slot that experience fills, for the signed-in person only.
