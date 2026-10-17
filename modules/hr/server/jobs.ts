import { contextFor } from "@amax/core/server";
import type { JobDef } from "@amax/core";
import { today } from "./inforce";
import { applyStatusDates } from "./services";

/** Daily: statuses follow joined_on and left_on, so 'joining' and future leavers don't go stale. */
export const statusDatesJob: JobDef = {
  name: "hr.person.status",
  cron: "5 0 * * *",
  async run({ tenantId }) {
    await applyStatusDates(contextFor.job(tenantId, "hr.person.status"), { on: today() });
  },
};
