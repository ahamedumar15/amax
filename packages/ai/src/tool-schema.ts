import { z } from "zod";

type Schema = { type?: unknown; properties?: Record<string, Schema>; required?: string[]; oneOf?: Schema[]; anyOf?: Schema[]; allOf?: Schema[]; const?: unknown; enum?: unknown[]; [k: string]: unknown };
type ObjectSchema = Schema & { type: "object"; properties: Record<string, Schema>; required: string[] };

const values = (s: Schema) => ("const" in s ? [s.const] : s.enum);

function mergeProperty(a: Schema | undefined, b: Schema): Schema {
  if (!a) return b;
  const [va, vb] = [values(a), values(b)];
  if (!va || !vb) return a;
  const { const: _c, ...rest } = a;
  return { ...rest, enum: [...new Set([...va, ...vb])] };
}

function flatten(s: Schema): ObjectSchema {
  const { oneOf, anyOf, allOf, $schema: _s, ...own } = s;
  const branches = oneOf ?? anyOf;
  const parts = [...(branches ?? []), ...(allOf ?? [])].map(flatten);
  const properties: Record<string, Schema> = { ...own.properties };
  for (const p of parts) for (const [k, v] of Object.entries(p.properties)) properties[k] = mergeProperty(properties[k], v);
  const fromBranches = branches ? parts.slice(0, branches.length).map((p) => p.required).reduce((a, b) => a.filter((k) => b.includes(k))) : [];
  const fromAll = parts.slice(branches?.length ?? 0).flatMap((p) => p.required);
  const required = [...new Set([...(own.required ?? []), ...fromBranches, ...fromAll])];
  return { ...own, type: "object", properties, required };
}

export function toolInputSchema(input: z.ZodType): ObjectSchema {
  return flatten(z.toJSONSchema(input) as Schema);
}
