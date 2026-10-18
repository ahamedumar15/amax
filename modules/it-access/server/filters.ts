/** The People and access filter (read-only, R3). Pure, so the client filter can use it. */
export const FILTERS = [
  { id: "everyone", label: "Everyone" }, { id: "admins", label: "Admins only" }, { id: "leavers", label: "Leavers" }, { id: "contractors", label: "Contractors" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];
export const filterOf = (raw: unknown): FilterId => FILTERS.find((f) => f.id === raw)?.id ?? "everyone";
