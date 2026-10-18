// Access and licences demo data for Lumen Labs (fixtures.md, "Access and licences", USD a month).
// Spend $14,860 over 12 products; 23 seats unused for 60+ days = $624 a month. The product ids
// (Graph sku ids) are fictional. `idle` seats have no use for 60+ days, `between` 30 to 60 days.
export type ProductSeed = {
  key: string; name: string; source: "graph" | "azure-devops" | "github" | "saas"; externalId: string | null; logo: string; color: string;
  seats: number; seatUsd: number; monthlyUsd: number; assigned: number; idle: number; between?: number; note?: string; rule?: "never-used";
};

export const PRODUCTS: ProductSeed[] = [
  { key: "m365-e3", name: "Microsoft 365 E3", source: "graph", externalId: "0e3f0000-0000-4000-8000-00000000e301", logo: "M", color: "#D83B01", seats: 190, seatUsd: 36, monthlyUsd: 6840, assigned: 184, idle: 3 },
  { key: "ado", name: "Azure DevOps, Basic + Test Plans", source: "azure-devops", externalId: "azure-devops:Basic + Test Plans", logo: "D", color: "#0078D4", seats: 60, seatUsd: 46, monthlyUsd: 2912, assigned: 56, idle: 6, note: "Test Plans add-on only", rule: "never-used" },
  { key: "copilot", name: "GitHub Copilot Business", source: "github", externalId: "github:copilot", logo: "G", color: "#24292F", seats: 120, seatUsd: 19, monthlyUsd: 2280, assigned: 112, idle: 4 },
  { key: "jetbrains", name: "JetBrains All Products", source: "saas", externalId: null, logo: "J", color: "#111111", seats: 30, seatUsd: 29, monthlyUsd: 870, assigned: 27, idle: 1, between: 1 },
  { key: "figma", name: "Figma Professional", source: "saas", externalId: null, logo: "F", color: "#A259FF", seats: 40, seatUsd: 15, monthlyUsd: 600, assigned: 38, idle: 9 },
  { key: "miro", name: "Miro Business", source: "saas", externalId: null, logo: "M", color: "#B8860B", seats: 20, seatUsd: 16, monthlyUsd: 320, assigned: 18, idle: 0 },
  { key: "1password", name: "1Password Business", source: "saas", externalId: null, logo: "1", color: "#1A73E8", seats: 30, seatUsd: 8, monthlyUsd: 240, assigned: 10, idle: 0 },
  { key: "acrobat", name: "Adobe Acrobat Pro", source: "saas", externalId: null, logo: "A", color: "#B30B00", seats: 12, seatUsd: 19.17, monthlyUsd: 230, assigned: 10, idle: 0 },
  { key: "zoom", name: "Zoom Workplace Pro", source: "saas", externalId: null, logo: "Z", color: "#0B5CFF", seats: 15, seatUsd: 14, monthlyUsd: 210, assigned: 14, idle: 0 },
  { key: "postman", name: "Postman Basic", source: "saas", externalId: null, logo: "P", color: "#C2410C", seats: 12, seatUsd: 14, monthlyUsd: 168, assigned: 12, idle: 0 },
  { key: "docker", name: "Docker Business", source: "saas", externalId: null, logo: "D", color: "#1D63ED", seats: 4, seatUsd: 25, monthlyUsd: 100, assigned: 4, idle: 0 },
  { key: "lucid", name: "Lucid Team", source: "saas", externalId: null, logo: "L", color: "#C2410C", seats: 10, seatUsd: 9, monthlyUsd: 90, assigned: 9, idle: 0 },
];

/** The people the mock names, by hr name: their seats, Entra groups, devices and admin roles. */
export const NAMED: Record<string, { products: string[]; groups: number; devices: number; adminRoles?: string[] }> = {
  "Kasun Dias": { products: ["m365-e3", "ado", "copilot", "jetbrains"], groups: 3, devices: 1 },
  "Sahan Kumara": { products: ["m365-e3", "ado", "copilot", "1password", "acrobat", "zoom"], groups: 7, devices: 2, adminRoles: ["Global admin"] },
  "Ravi Perera": { products: ["m365-e3", "1password"], groups: 5, devices: 1, adminRoles: ["Intune admin"] },
};

/** A contractor who isn't in hr (fictional company), with access that ends on Nov 15. */
export const CONTRACTOR = { name: "Vendor contractor, DataCo", products: ["figma"], groups: 1, expiresOn: "2026-11-15" };

/** Intune: 231 devices; 7 need an OS update, 1 isn't assigned to anyone, the rest are compliant. */
export const DEVICES = { total: 231, needUpdate: 7, unassigned: 1 };
export const REVIEWED_ON = "2026-07-15";
