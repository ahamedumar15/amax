import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { loadPolicy, REGIONS, voiceAllowed } from "@amax/ai";
import { day, type Row } from "./context";

/** A supplier. Platform rows have no id: they come from the 033 AI and data settings, not the register. */
export type Supplier = {
  id: string | null; name: string; service: string; data: string | null; region: string | null; subprocessor: boolean;
  dpaSignedOn: string | null; reviewOn: string | null; status: string; source: "register" | "platform";
};

const region = (code: string | null) => (code ? (REGIONS as Record<string, string>)[code] ?? code : null);

export const toSupplier = (r: Row): Supplier => ({
  id: r.id as string, name: r.name as string, service: r.service as string, data: (r.data as string | null) ?? null, region: (r.region as string | null) ?? null,
  subprocessor: Boolean(r.subprocessor), dpaSignedOn: day(r.dpa_signed_on), reviewOn: day(r.review_on), status: r.status as string, source: "register",
});

const platform = (s: Omit<Supplier, "id" | "subprocessor" | "dpaSignedOn" | "reviewOn" | "status" | "source">): Supplier =>
  ({ ...s, id: null, subprocessor: true, dpaSignedOn: null, reviewOn: null, status: "active", source: "platform" });

/** The platform's own subprocessors, from the AI and data settings (033), so Compliance and that screen always agree. */
export async function platformSuppliers(tx: Tx): Promise<Supplier[]> {
  const p = await loadPolicy(tx);
  return [
    ...(p.enabled ? [platform({ name: p.provider === "anthropic" ? "Anthropic" : p.provider, service: "AI models (Claude API)", data: p.allowedClasses.length ? `Prompts; may include ${p.allowedClasses.join(", ")}` : "Prompts, with classified fields redacted", region: region(p.regions.ai ?? p.providerRegion) })] : []),
    platform({ name: "Database host", service: "Postgres hosting", data: "All tenant records", region: region(p.regions.database) }),
    ...(p.regions.storage ? [platform({ name: "File storage host", service: "S3-compatible files", data: "Documents and exports", region: region(p.regions.storage) })] : []),
    ...(voiceAllowed(p).ok ? [platform({ name: "Browser speech service", service: "Voice input", data: "Voice audio", region: null })] : []),
  ];
}

export const registerSuppliers = async (tx: Tx, all = false) =>
  (await tx.execute(sql`select * from compliance.supplier ${all ? sql`` : sql`where status = 'active'`} order by name`)).map(toSupplier);

/** Every active subprocessor: the platform's first, then the register's. */
export const subprocessors = async (tx: Tx) => [...(await platformSuppliers(tx)), ...(await registerSuppliers(tx)).filter((s) => s.subprocessor)];
