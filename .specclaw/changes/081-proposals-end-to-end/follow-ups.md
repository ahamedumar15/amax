# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor module-standard] `modules/time/db/migrations/0009_entry_proposal.sql:3` Time's migration adds a foreign key into another module's schema (`references delivery.proposal(id)`). The module standard says migrations touch only the module's own schema and that a module can be switched off. This hard database link ties Time to Delivery's table. Fix: keep `proposal_id` as a plain uuid that is validated through `getProposalRef`, which the code already does. (round 1) <!-- fp:4cda07f766f6 -->
- [minor module-standard] `modules/delivery/server/pin-offers.ts:86` A proposal's pin offers 'Log time on <key>' (the `log_time` tool) after checking only Time's permission. It never checks `hasModule('time')`. With Time disabled, the chip fills a prompt for a tool that does not exist. Fix: guard this optional integration with `hasModule('time')`. (round 1) <!-- fp:3a8b7d0299d3 -->
- [minor B6] `modules/delivery/chat-suggestions.ts:35` `decodeURIComponent` runs on the raw route segment in `pageLabel`, `proposal()` and `ProposalsPage`. A malformed escape throws `URIError` instead of reaching the 'Proposal not found' path. Fix: wrap the decode, or rely on the router's own decoding. (round 1) <!-- fp:6f1a49fee59f -->
