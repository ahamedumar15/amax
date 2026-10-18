import type { LeaveType } from "./contracts";

export type PackPolicy = { type: LeaveType; label: string; daysPerYear: number | null; paid: boolean; halfDays: boolean; rule?: string };
export type PackHoliday = { on: string; name: string; kind: "poya" | "public" | "bank" };
export type CountryPack = { country: string; name: string; policies: PackPolicy[]; holidays: PackHoliday[] };

// Leave rules by country (AC-1). Holiday dates are the demo's 2026 Q4 calendar: confirm each year's
// list against the government gazette (Sri Lanka) or the state's list (Australia, NSW here).
export const PACKS: Record<string, CountryPack> = {
  LK: {
    country: "LK", name: "Sri Lanka",
    policies: [
      { type: "annual", label: "Annual", daysPerYear: 14, paid: true, halfDays: true },
      { type: "casual", label: "Casual", daysPerYear: 7, paid: true, halfDays: true },
      { type: "medical", label: "Medical", daysPerYear: 7, paid: true, halfDays: true, rule: "A medical certificate for more than 2 days in a row" },
      { type: "lieu", label: "Lieu", daysPerYear: null, paid: true, halfDays: true, rule: "Earned by working on a holiday or a rest day" },
      { type: "unpaid", label: "No-pay", daysPerYear: null, paid: false, halfDays: true },
    ],
    holidays: [
      { on: "2026-10-26", name: "Vap Full Moon Poya Day", kind: "poya" },
      { on: "2026-11-08", name: "Deepavali", kind: "public" },
      { on: "2026-11-24", name: "Il Full Moon Poya Day", kind: "poya" },
      { on: "2026-12-23", name: "Unduvap Full Moon Poya Day", kind: "poya" },
      { on: "2026-12-25", name: "Christmas Day", kind: "public" },
    ],
  },
  AU: {
    country: "AU", name: "Australia",
    policies: [
      { type: "annual", label: "Annual", daysPerYear: 20, paid: true, halfDays: true },
      { type: "personal", label: "Personal/carer's", daysPerYear: 10, paid: true, halfDays: true },
      { type: "long-service", label: "Long service", daysPerYear: null, paid: true, halfDays: false, rule: "After 10 years' continuous service (NSW: 2 months)" },
      { type: "unpaid", label: "Unpaid", daysPerYear: null, paid: false, halfDays: true },
    ],
    holidays: [
      { on: "2026-10-05", name: "Labour Day", kind: "public" },
      { on: "2026-12-25", name: "Christmas Day", kind: "public" },
      { on: "2026-12-28", name: "Boxing Day (additional day)", kind: "public" },
    ],
  },
};

export const packFor = (country: string): CountryPack | null => PACKS[country.toUpperCase()] ?? null;
