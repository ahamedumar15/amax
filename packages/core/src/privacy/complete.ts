import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "../service";
import { applyRule } from "./apply";
import { secondApproval } from "./approval";
import { PRIVACY_MANAGE, privacyRules } from "./catalog";
import { heldIds } from "./holds";
import { inventory, summarise, type Item } from "./inventory";
import { about } from "./match";
import { buildPackage } from "./package";
import { loadRequest, personOf, type RequestRow } from "./requests";
import { PrivacyError, resolveSubject } from "./subjects";

export const ERASED_LABEL = "Erased person";

async function erase(tx: Tx, req: RequestRow, items: Item[], approver: string) {
  const held = new Set(await heldIds(tx));
  if (req.subjects.some((id) => held.has(id))) throw new PrivacyError("this person is under a legal hold; release the hold before erasing");
  let n = 0;
  for (const rule of privacyRules().filter((r) => items.some((i) => i.rule === r.id && !i.kept))) n += await applyRule(tx, rule, about(rule, req.subjects));
  await tx.execute(sql`update privacy.request set status = 'approved', approved_by = ${approver} where id = ${req.id}`);
  const [chains] = await tx.execute(sql`select privacy.erase_request(${req.id}) as n`);
  await tx.execute(sql`update privacy.request set status = 'completed', completed_at = now(), erased = ${n + Number(chains.n)}, subject_label = ${ERASED_LABEL},
    inventory = ${JSON.stringify(items)}::jsonb where id = ${req.id}`);
  return n + Number(chains.n);
}

async function access(tx: Tx, req: RequestRow, items: Item[], approver: string) {
  const pkg = await buildPackage(tx, req.subjectLabel, req.subjects, items);
  await tx.execute(sql`update privacy.request set status = 'completed', completed_at = now(), approved_by = ${approver}, package = ${JSON.stringify(pkg)}::jsonb,
    inventory = ${JSON.stringify(items)}::jsonb where id = ${req.id}`);
  return pkg.sections.reduce((n, s) => n + s.rows.length, 0);
}

export const completePrivacyRequest = defineService({
  name: "privacy.request.complete",
  action: PRIVACY_MANAGE,
  resource: "privacy.request",
  input: z.object({ id: z.uuid() }),
  async run(tx, input, ctx) {
    const req = await loadRequest(tx, input.id, true);
    if (req.status !== "open") throw new PrivacyError(`this ${req.kind} request is already ${req.status}`);
    await secondApproval(ctx, req);
    if (!req.subjectUserId) throw new PrivacyError("this request has no person to act on");
    const subject = await resolveSubject(tx, req.subjectUserId);
    const items = await inventory(tx, { ...subject, ids: [...new Set([...req.subjects, ...subject.ids])] });
    const n = req.kind === "erasure" ? await erase(tx, req, items, personOf(ctx)) : await access(tx, req, items, personOf(ctx));
    const after = { kind: req.kind, status: "completed", records: n, ...summarise(items) };
    return { result: { id: req.id, ...after, kept: items.filter((i) => i.kept) }, resourceId: req.id, before: { status: "open" }, after, events: [{ name: `privacy.request.completed`, payload: { id: req.id, kind: req.kind } }] };
  },
});
