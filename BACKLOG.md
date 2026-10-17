# Backlog

Follow-up work that a change deliberately left out. Each item becomes its own specclaw proposal.

## Chat-first for the remaining modules (from 046)

046 made presales chat-first. These inline forms in other modules still write without chat's
confirm card. Replace each with an "Ask amax" chip that pins the record and fills in the prompt,
backed by the MCP write tool listed (most already exist).

| Module | Screen | Form | MCP write tool |
|---|---|---|---|
| time | My timesheet (`modules/time/ui/MyPage.tsx`) | Log time, Submit week | `log_time`, `submit_week` |
| time | Team time (`ThisWeek.tsx`, `Timesheets.tsx`) | Approve submitted, Approve/Remind row, Remind all | `approve_week`, `remind_week` |
| allocations | Allocations (`CopyMonth.tsx`) | Copy month | `copy_allocations_to_next_month` |
| delivery | Release (`ReleasePage.tsx`) | Edit tag and proposals, Record deployment, Void deployment | `tag_release`, `set_release_proposals`, `record_deployment`, `void_deployment` |
| delivery | Releases (`ReleasesPage.tsx`) | Inline deploy/promote | `record_deployment` |
| delivery | Project (`EnvironmentsCard.tsx`) | Add, rename, reorder, mark Prod, remove environment | `upsert_environment`, `remove_environment` |
| delivery | Project board (`ProjectPage.tsx`) | Move proposal | `move_proposal` |

Also from 046: pins on time and allocations rows resolve to the week or grid read tool, not a
single-row read tool. Add `get_timesheet` and `get_allocation` read tools so each row pin resolves
to exactly its record. The presales "Change details" chip in the mock needs an `update_opportunity`
write tool first.
