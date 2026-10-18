import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { getPerson } from "@amax/hr/contracts";
import { HISTORY, IMPORT_SOURCE, IMPORTED_THROUGH, KASUN, PROPOSED } from "./kasun";

const later = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();
const JOB = "career.fixtures";

// Seeds the demo's "today" (Oct 16), Kasun's imported history with its cutover, his confirmed
// technologies per project, and the agent's two proposals. Safe to re-run.
export const careerFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  await tx.execute(sql`insert into career.settings (tenant_id, today) values (${tenantId}, ${shared.today}) on conflict (tenant_id) do update set today = excluded.today`);
  const kasun = await getPerson(tx, contextFor.job(tenantId, JOB), KASUN);
  if (!kasun) return;
  await tx.execute(sql`insert into career.import (tenant_id, person_id, through, source, imported_by) values (${tenantId}, ${kasun.id}, ${IMPORTED_THROUGH}, ${IMPORT_SOURCE}, ${JOB}) on conflict do nothing`);
  for (const e of HISTORY) {
    const { id, kind, on, trace: t, ...detail } = e;
    const { technologies = [], ...rest } = detail as { technologies?: { name: string }[] };
    await tx.execute(sql`insert into career.history (id, tenant_id, person_id, kind, effective_on, detail, recorded_by, recorded_for, recorded_at, approved_by, approved_at, source_module, source_label, source_href, trace_ref)
      values (${id}, ${tenantId}, ${kasun.id}, ${kind}, ${on}, ${JSON.stringify(rest)}::jsonb, ${t.recordedBy}, ${t.recordedFor}, ${t.recordedAt}, ${t.approvedBy}, ${t.approvedAt},
        ${t.source.module}, ${t.source.label}, ${t.source.href}, ${t.traceRef}) on conflict do nothing`);
    for (const [j, tech] of technologies.entries()) {
      const at = later(t.recordedAt!, j);
      await tx.execute(sql`insert into career.technology (tenant_id, person_id, project, name, status, source, proposed_by, proposed_at, confirmed_by, confirmed_at)
        values (${tenantId}, ${kasun.id}, ${(rest as { project: string }).project}, ${tech.name}, 'confirmed', ${IMPORT_SOURCE}, ${t.recordedBy}, ${at}, ${t.recordedBy}, ${at}) on conflict do nothing`);
    }
  }
  for (const [j, name] of PROPOSED.names.entries()) {
    await tx.execute(sql`insert into career.technology (id, tenant_id, person_id, project, name, status, source, proposed_by, proposed_for, proposed_at)
      values (${PROPOSED.ids[j]}, ${tenantId}, ${kasun.id}, ${PROPOSED.project}, ${name}, 'proposed', ${PROPOSED.source}, ${PROPOSED.by}, ${PROPOSED.for}, ${later(`${PROPOSED.on}T08:00:00Z`, j)}) on conflict do nothing`);
  }
};
