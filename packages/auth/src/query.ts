import type { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { ForbiddenError, getRuntime, ValidationError, type Sensitivity } from "@amax/core/server";
import { can } from "./can";
import { mask, type MaskedRecord, type Subject } from "./sensitivity";
import type { Viewer } from "./viewer";

export type QuerySpec<I, Row extends Record<string, unknown>, K extends keyof Row & string> = {
  name: string;
  action: string;
  input: z.ZodType<I>;
  /** Classified fields on each row. */
  sensitive: Partial<Record<K, Sensitivity>>;
  /** Who each row is about, for self / manager / entity checks. */
  subject: (row: Row) => Subject;
  run: (tx: Tx, input: I, viewer: Viewer) => Promise<Row[]>;
};

// The read twin of defineService(): authorize → validate → read under the viewer's tenant → mask.
// Pages, contracts, MCP tools, chat, notifications and AI calls read through these, so a
// classified field is masked the same way on every path.
export function defineQuery<I, Row extends Record<string, unknown>, K extends keyof Row & string>(spec: QuerySpec<I, Row, K>) {
  return async (viewer: Viewer, raw: unknown): Promise<MaskedRecord<Row, K>[]> => {
    if (!can(viewer, spec.action)) throw new ForbiddenError(spec.action, spec.name);
    const parsed = spec.input.safeParse(raw);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const rows = await withTenant(getRuntime().db, viewer.tenantId, (tx) => spec.run(tx, parsed.data, viewer));
    return rows.map((row) => mask(viewer, row, spec.sensitive, spec.subject(row)));
  };
}
