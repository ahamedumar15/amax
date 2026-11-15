import { contextFor } from "@amax/core/server";
import type { JobDef } from "@amax/core";
import { applyStatusDates } from "./services";

/**
 * Statuses follow joined_on and left_on by each entity's own today, so 'joining' and future leavers don't go stale. 109
 * review round 2: hourly, so each entity moves within the hour after its own midnight; re-running changes nothing.
 */
export const statusDatesJob: JobDef = {
  name: "hr.person.status",
  cron: "5 * * * *",
  async run({ tenantId }) {
    await applyStatusDates(contextFor.job(tenantId, "hr.person.status"), {});
  },
};
