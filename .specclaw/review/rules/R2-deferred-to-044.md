# R2 — Release and region design questions are change 044's scope

Decided by the product owner on 2026-10-17 (042 final review, option 1).

While reviewing 042-release-management, these are **out of scope** and must not be reported as findings
against 042. They are the acceptance criteria of `.specclaw/changes/044-release-and-region-hardening/change.md`:

- restoring each proposal's exact pre-release phase when a releasing deployment is voided (044 AC-1);
- which writer owns a specclaw-synced proposal's phase (sync vs. Prod deployments and moves) (044 AC-2);
- making the AI provider's endpoint region match the policy's declared AI region (044 AC-3).

Everything else stays in scope: report it as usual.
