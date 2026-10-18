# Backlog

Follow-up work that a change deliberately left out. Each item becomes its own specclaw proposal.

- [ ] **Promote an opportunity from chat** (from 043). `promote_opportunity` makes three writes: presales' claim, delivery's create under its own key, then the link. It can't be one keyed chat write, so it declares `service: null` and no longer becomes a confirm card. Before 043 every chat confirm of it ended "unknown". Make promote one service whose `run` calls the claim, the create and the link as nested commands, then declare it.

- [ ] **Public pages for signed-out visitors** (from 013). The exit questionnaire link (`/exit/<token>`) needs a page a leaver can open without an amax session. Module routes all require a session and the module's read permission. `modules/onboarding/ui/ExitPage.tsx` and `answerExit` are ready to mount. Add a platform slot for a module's public, token-gated pages (rate-limited, no shell), then mount the exit page.

- [ ] **Payroll pays approved reimbursements** (from 018). Expenses publishes `reimbursementsDue(tx, reader, { legalEntityId, period })` and suggests marking claims paid when payslips go out, but payroll's draft doesn't add them to net pay yet. Until it does, expenses defaults to bank. Have payroll's draft add a "Reimbursements" line from expenses' contract when expenses is installed, then make payroll the default again.

- [ ] **Receipt photos in chat** (from 018). The chat drawer has no file picker, and `@amax/ai` takes text only. So a receipt reaches expenses only through the `add_receipt` tool (MCP or API), and the receipt agent reads only the receipt's text. Add an attachment picker to chat and image input to the AI gateway, so a photo alone gets its fields suggested.

- [ ] **Billing agent identity** (from 017). Finance's billing agent reads time's project hours as a fixed Finance-role reader (`modules/finance/server/agent.ts`), because event handlers have no viewer. Give 006 agents a first-class identity that time's contract can authorise.

- [ ] **Hire creates the HR person in one step** (from 023). Accepting `recruitment.hr-record` only records HR's confirmation; HR then adds the person through hr's `add_person`. One step needs a write in `hr/contracts.ts` that runs inside the suggestion's transaction.
