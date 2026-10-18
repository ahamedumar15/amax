export const TODAY = "2026-10-16";
export const TARGET = "80000";
export const RATES = [{ from: "USD", to: "LKR", rate: "300", asOf: "2026-01-01" }, { from: "USD", to: "AUD", rate: "1.5", asOf: "2026-01-01" }];

type Contract = { key: string; kind: "fixed" | "tm" | "retainer"; value: string; rate?: string; fee?: string; starts: string; renews?: string; days: number };
export const CONTRACTS: Contract[] = [
  { key: "CON", kind: "fixed", value: "420000", starts: "2026-03-01", renews: "2027-03-01", days: 60 },
  { key: "FLT", kind: "tm", value: "210000", rate: "45", starts: "2026-03-01", days: 22 },
  { key: "HRI", kind: "retainer", value: "144000", fee: "12000", starts: "2026-07-01", days: 30 },
];

export const MILESTONES: [label: string, amount: string, release: string | null][] = [
  ["Contract signed", "30000", null], ["v2.0.0 in Prod", "45000", "v2.0.0"], ["v2.1.0 in Prod", "50000", "v2.1.0"], ["v2.2.0 in Prod", "27915", "v2.2.0"],
  ["v2.2.1 in Prod", "36085", "v2.2.1"], ["v2.2.2 in Prod", "16000", "v2.2.2"], ["v2.3.0 in Prod", "26000", "v2.3.0"], ["v2.4.0 in Prod", "60000", "v2.4.0"],
  ["v2.5.0 in Prod", "70000", "v2.5.0"], ["Final acceptance", "59000", null],
];

export type Inv = { key: string; on: string; amount: string; what: string; hours?: string; period?: string; milestone?: number; paidAfter: number | null };
export const INVOICES: Inv[] = [
  { key: "CON", on: "2026-03-02", amount: "30000", what: "Contract signed", milestone: 0, paidAfter: 30 },
  { key: "FLT", on: "2026-04-01", amount: "9990", what: "March hours, 222 h", hours: "222", period: "2026-03", paidAfter: 20 },
  { key: "FLT", on: "2026-05-01", amount: "16020", what: "April hours, 356 h", hours: "356", period: "2026-04", paidAfter: 20 },
  { key: "CON", on: "2026-05-15", amount: "45000", what: "v2.0.0 in Prod", milestone: 1, paidAfter: 45 },
  { key: "FLT", on: "2026-06-01", amount: "24030", what: "May hours, 534 h", hours: "534", period: "2026-05", paidAfter: 20 },
  { key: "CON", on: "2026-06-19", amount: "50000", what: "v2.1.0 in Prod", milestone: 2, paidAfter: 45 },
  { key: "FLT", on: "2026-07-01", amount: "18225", what: "June hours, 405 h", hours: "405", period: "2026-06", paidAfter: 20 },
  { key: "HRI", on: "2026-07-01", amount: "12000", what: "July 2026 retainer", period: "2026-07", paidAfter: 14 },
  { key: "CON", on: "2026-07-24", amount: "27915", what: "v2.2.0 in Prod", milestone: 3, paidAfter: 45 },
  { key: "FLT", on: "2026-08-01", amount: "34020", what: "July hours, 756 h", hours: "756", period: "2026-07", paidAfter: 20 },
  { key: "HRI", on: "2026-08-01", amount: "12000", what: "August 2026 retainer", period: "2026-08", paidAfter: 14 },
  { key: "CON", on: "2026-08-28", amount: "36085", what: "v2.2.1 in Prod", milestone: 4, paidAfter: null },
  { key: "FLT", on: "2026-09-01", amount: "30600", what: "August hours, 680 h", hours: "680", period: "2026-08", paidAfter: 20 },
  { key: "HRI", on: "2026-09-01", amount: "12000", what: "September 2026 retainer", period: "2026-09", paidAfter: 14 },
  { key: "FLT", on: "2026-09-15", amount: "18315", what: "September hours, 407 h", hours: "407", period: "2026-09", paidAfter: null },
  { key: "CON", on: "2026-09-22", amount: "16000", what: "v2.2.2 in Prod", milestone: 5, paidAfter: null },
  { key: "CON", on: "2026-10-01", amount: "26000", what: "v2.3.0 in Prod", milestone: 6, paidAfter: null },
];
export const FIRST_NUMBER = 898;

export const OCTOBER_HOURS = { key: "FLT", period: "2026-10", hours: "315.56", amount: "14200" };
