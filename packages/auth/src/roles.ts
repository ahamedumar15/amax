export const ROLES = ["Admin", "Leadership", "PM", "Engineer", "Finance", "Sales", "HR", "Payroll", "Employee"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);
