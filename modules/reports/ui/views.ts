export const VIEWS = [
  { key: "utilisation", label: "Utilisation", href: "/reports" },
  { key: "availability", label: "Availability", href: "/reports?view=availability" },
] as const;
export type ViewKey = (typeof VIEWS)[number]["key"];

/** The tab from the URL, looked up in the known list: an unknown value falls back to the first tab. */
export const viewOf = (raw?: string): ViewKey => VIEWS.find((v) => v.key === raw)?.key ?? "utilisation";
