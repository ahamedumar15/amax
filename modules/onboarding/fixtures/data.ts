// Checklist templates by legal entity and role (013 AC-1). Lumen Labs and everything in it is
// fictional (fixtures.md). `entity` is a shared-fixtures entity key; `due` is days from the start.
export type Owner = "HR" | "ITAdmin" | "Manager";
export type Template = { kind: "joiner" | "leaver"; title: string; entity?: "lk" | "au"; role?: string; tasks: [title: string, owner: Owner, due: number][] };

export const TEMPLATES: Template[] = [
  { kind: "joiner", title: "Engineering joiner, Sri Lanka", entity: "lk", role: "Engineering", tasks: [
    ["Send the welcome pack", "HR", -28],
    ["Collect the signed contract and ID copies", "HR", -21],
    ["Order and image a laptop", "ITAdmin", -7],
    ["Pick a buddy and plan the first week", "Manager", -5],
    ["Register for EPF and ETF", "HR", 0],
    ["First-week check-in", "Manager", 5],
  ] },
  { kind: "joiner", title: "Joiner, Sri Lanka", entity: "lk", tasks: [
    ["Send the welcome pack", "HR", -14],
    ["Collect the signed contract and ID copies", "HR", -7],
    ["Order a laptop", "ITAdmin", -3],
    ["Plan the first week", "Manager", -3],
    ["Register for EPF and ETF", "HR", 0],
  ] },
  { kind: "joiner", title: "Joiner, Australia", entity: "au", tasks: [
    ["Send the welcome pack", "HR", -14],
    ["Order a laptop", "ITAdmin", -3],
    ["Plan the first week", "Manager", -3],
    ["Collect the TFN declaration and super choice", "HR", 0],
  ] },
  { kind: "leaver", title: "Leaver", tasks: [
    ["Agree the handover of work", "Manager", -10],
    ["Send the exit questionnaire link", "HR", -7],
    ["Collect the laptop and access card", "ITAdmin", 0],
    ["Send the final settlement to payroll", "HR", 0],
    ["Issue the certificate of service", "HR", 7],
  ] },
];

/** Leavers since this day get a checklist in the demo: Rizwan Farook (left Sep 30). Everyone joining gets one. */
export const LEAVERS_SINCE = "2026-09-01";
/** Rizwan's offboarding is finished; Mohamed Rifkhan's welcome pack has gone out, his contract is still to come. */
export const DONE: Record<string, number> = { "LL-0388": Infinity, "LL-0640": 1 };
