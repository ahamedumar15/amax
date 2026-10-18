// Payroll demo data for the shared Lumen Labs people (fixtures.md). Everything here is fictional: the
// pay group runs on the demo country pack (made-up rates), and the components, overtime and
// settlement below are invented for the demo. Base salaries come from hr's fixtures.
export const GROUP = { name: "Lumen Labs Lanka, monthly (demo pack)", entity: "lk", pack: "demo" } as const;

/** The named Sri Lanka staff paid in the demo group, by employee number. Rizwan Farook left Sep 30. */
export const MEMBERS = ["LL-0102", "LL-0150", "LL-0233", "LL-0291", "LL-0388", "LL-0417", "LL-0455", "LL-0598", "LL-0612"];

export type Component = { employeeNo: string; code: string; label: string; kind: "earning" | "deduction"; amount: string; from: string; to?: string; basis?: string };

export const COMPONENTS: Component[] = [
  { employeeNo: "LL-0417", code: "allowance", label: "Fixed allowance", kind: "earning", amount: "40000", from: "2022-03-03" },
  { employeeNo: "LL-0233", code: "allowance", label: "Fixed allowance", kind: "earning", amount: "30000", from: "2020-06-01" },
  { employeeNo: "LL-0102", code: "allowance", label: "Fixed allowance", kind: "earning", amount: "50000", from: "2019-02-11" },
  // Kasun's on-call overtime is the same both months, so it isn't a change.
  { employeeNo: "LL-0417", code: "overtime", label: "Overtime, 4 h", kind: "earning", amount: "8250", from: "2026-09-01", to: "2026-10-31", basis: "On-call release support (fictional)" },
  { employeeNo: "LL-0388", code: "final-settlement", label: "Final settlement", kind: "earning", amount: "285000", from: "2026-09-01", to: "2026-09-30", basis: "Leaver, last day Sep 30 (fictional)" },
  { employeeNo: "LL-0233", code: "overtime", label: "Overtime, 6 h", kind: "earning", amount: "12400", from: "2026-10-01", to: "2026-10-31", basis: "6 h weekend overtime for the Sep 19 release of CON-009 Reports v2 (fictional)" },
  { employeeNo: "LL-0291", code: "no-pay", label: "No-pay days, 1.5", kind: "deduction", amount: "9850", from: "2026-10-01", to: "2026-10-31",
    basis: "1.5 days with no time logged and no approved leave; Leave shows casual leave on Oct 16 that may not have synced (fictional)" },
];

/** September was paid in full; October is drafted and checked, waiting on its changes and HR. */
export const PAID = "2026-09";
export const CURRENT = "2026-10";
