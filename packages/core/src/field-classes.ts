import { SENSITIVITY_CLASSES, type Sensitivity } from "./audit";
import type { ModuleManifest } from "./module";

/** One spelling per field: `epf_number`, `epfNumber` and `EPF-Number` are the same field. */
export const fieldKey = (field: string) => field.replace(/[^a-z0-9]/gi, "").toLowerCase();

const isClass = (c: string): c is Sensitivity => (SENSITIVITY_CLASSES as readonly string[]).includes(c);

/** The 002 classes the installed modules declare for their fields: their retention entries and their
 * tools' classified results. What masks outgoing webhooks (review 058 B4), so they follow the modules. */
export function declaredFieldClasses(modules: Pick<ModuleManifest, "retention" | "mcpTools">[]): Record<string, Sensitivity> {
  const out: Record<string, Sensitivity> = {};
  for (const m of modules) {
    for (const r of m.retention ?? []) if (isClass(r.class)) for (const f of r.fields) out[fieldKey(f)] = r.class;
    for (const t of m.mcpTools ?? []) for (const [f, c] of Object.entries(t.sensitive ?? {})) if (c) out[fieldKey(f)] = c;
  }
  return out;
}
