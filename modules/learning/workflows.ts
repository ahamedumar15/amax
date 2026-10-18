import { contextFor } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { remindDue } from "./server/certifications";
import { today } from "./server/read";

// Certification expiry reminders (029): every morning the sweep sends each certification inside a
// window its reminder once; notifications (030) turns the events into messages.
export const certificationExpiry = defineWorkflow({
  name: "learning.certification-expiry",
  title: "Certification expiry reminders",
  async run(ctx) {
    const on = today();
    const { sent } = await step("remind", () => remindDue(contextFor.job(ctx.tenantId, "learning.certification-expiry"), { on }), { timeout: "5m", retry: { maxAttempts: 3 } });
    return { ok: true, summary: sent ? `Reminded ${sent} about a certification expiring` : "No certification reached a reminder window" };
  },
});

export const workflows = [certificationExpiry];
export const schedules = [
  cron({ name: "learning.certification-expiry", title: "Certification expiry reminders", description: "Reminds people 60 and 14 days before a certification expires",
    workflow: "learning.certification-expiry", cron: "0 6 * * *" }),
];
