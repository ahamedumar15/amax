export const ROLES = ["Admin", "ITAdmin", "Leadership", "PM", "Engineer", "Finance", "Sales", "HR", "Payroll", "Employee"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);

const LABELS: Partial<Record<Role, string>> = { ITAdmin: "IT Admin" };
/** How a role reads on screen: "IT Admin", not "ITAdmin". */
export const roleLabel = (r: string) => LABELS[r as Role] ?? r;
