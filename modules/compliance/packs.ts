// Breach notification rules per country pack (AC-2). The clock starts when the organisation becomes
// aware of a possible personal-data breach, which is when the incident is flagged as one. Confirm each
// rule against the regulator's current guidance before relying on it; these are not legal advice.
export type BreachRule = { country: string; hours: number; regulator: string; rule: string };

export const BREACH_PACKS: Record<string, BreachRule> = {
  AU: { country: "AU", hours: 30 * 24, regulator: "OAIC", rule: "Privacy Act 1988, Part IIIC (Notifiable Data Breaches): assess within 30 days, then notify the OAIC and the people affected as soon as practicable" },
  LK: { country: "LK", hours: 72, regulator: "Data Protection Authority", rule: "Personal Data Protection Act No. 9 of 2022: notify the Data Protection Authority within 72 hours" },
};

// No pack for the entity's country: the strictest common rule (72 hours) applies until one is added.
export const DEFAULT_BREACH_RULE: BreachRule = { country: "", hours: 72, regulator: "the regulator", rule: "No country pack: 72 hours, the strictest common rule" };

export const breachRuleFor = (country: string | null | undefined) => (country && BREACH_PACKS[country]) || DEFAULT_BREACH_RULE;

/** When a breach flagged at `awareAt` must be decided by. */
export const notifyBy = (awareAt: Date, country: string | null | undefined) => new Date(awareAt.getTime() + breachRuleFor(country).hours * 3_600_000);
