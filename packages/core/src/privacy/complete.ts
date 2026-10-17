import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray, type Tx } from "@amax/db";
import { defineService } from "../service";
import { applyRule } from "./apply";
import { secondApproval } from "./approval";
import { PRIVACY_MANAGE, privacyRules } from "./catalog";
import { held as heldNow } from "./holds";
import { assertChecked, inventory, matchOf, summarise, type Item } from "./inventory";
import { about, type Match } from "./match";
import { buildPackage } from "./package";
import { loadRequest, personOf, type RequestRow } from "./requests";
import { PrivacyError, resolveSubject } from "./subjects";

export const ERASED_LABEL = "Erased person";

const lower = (s: string) => s.trim().toLowerCase();

async function erase(tx: Tx, req: RequestRow, who: Match, items: Item[], approver: string) {
  const held = await heldNow(tx);
  const names = new Set(held.names.map(lower));
  if (who.ids.some((id) => held.ids.includes(id)) || who.names.some((n) => names.has(lower(n)))) throw new PrivacyError("this person is under a legal hold; release the hold before erasing");
  let n = 0;
  // Only rows found by id; rows found by name are left for a person to review (NAME_REVIEW).
  for (const rule of privacyRules().filter((r) => items.some((i) => i.rule === r.id && !i.kept && !i.review))) n += await applyRule(tx, rule, about(rule, who));
  // erase_request erases the audit and trace chains for the stored ids, so store every id the
  // inventory used, including ones resolved since the request was opened (review 058 B1).
  await tx.execute(sql`update privacy.request set status = 'approved', approved_by = ${approver}, subjects = ${textArray(who.ids)} where id = ${req.id}`);
  const [chains] = await tx.execute(sql`select privacy.erase_request(${req.id}) as n`);
  await tx.execute(sql`update privacy.request set status = 'completed', completed_at = now(), erased = ${n + Number(chains.n)}, subject_label = ${ERASED_LABEL},
    inventory = ${JSON.stringify(items)}::jsonb where id = ${req.id}`);
  return n + Number(chains.n);
}

async function access(tx: Tx, req: RequestRow, who: Match, items: Item[], approver: string) {
  const pkg = await buildPackage(tx, req.subjectLabel, who, items);
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
    // One set of ids and names for the inventory, the hold check, the rules and the chains.
    const who = matchOf({ ids: [...new Set([...req.subjects, ...subject.ids])], label: subject.label }, [req.subjectLabel]);
    const items = await inventory(tx, { ...subject, ids: who.ids }, who.names);
    assertChecked(items, `complete this ${req.kind} request`);
    const n = req.kind === "erasure" ? await erase(tx, req, who, items, personOf(ctx)) : await access(tx, req, who, items, personOf(ctx));
    const after = { kind: req.kind, status: "completed", records: n, ...summarise(items) };
    return { result: { id: req.id, ...after, kept: items.filter((i) => i.kept) }, resourceId: req.id, before: { status: "open" }, after, events: [{ name: `privacy.request.completed`, payload: { id: req.id, kind: req.kind } }] };
  },
});
