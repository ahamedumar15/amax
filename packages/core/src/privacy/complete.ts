import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray, type Tx } from "@amax/db";
import { defineService } from "../service";
import { countRule, eraseRule } from "./apply";
import { secondApproval } from "./approval";
import { PRIVACY_MANAGE, privacyRules } from "./catalog";
import { held as heldNow } from "./holds";
import { assertChecked, EXCLUDED_BY_APPROVER, inventory, matchOf, summarise, type Item } from "./inventory";
import { about, notHeld, type Match } from "./match";
import { decideNameRows, includedRows, nameRows } from "./name-rows";
import { buildPackage } from "./package";
import { loadRequest, personOf, type RequestRow } from "./requests";
import { PrivacyError, resolveSubject } from "./subjects";

export const ERASED_LABEL = "Erased person";

const lower = (s: string) => s.trim().toLowerCase();

export const HOLD_KEPT = "kept: legal hold. Release the hold, then erase these rows with a new request";

async function erase(tx: Tx, req: RequestRow, who: Match, found: Item[], approver: string) {
  const held = await heldNow(tx);
  const names = new Set(held.names.map(lower));
  if (who.ids.some((id) => held.ids.includes(id)) || who.names.some((n) => names.has(lower(n)))) throw new PrivacyError("this person is under a legal hold; release the hold before erasing");
  let n = 0;
  const items = [...found];
  // Rows found by id, and the name-only rows the approver included, by their ids (decideNameRows). Every
  // path keeps what a matter hold holds, through the same predicate as the purge (060 AC-1).
  for (const rule of privacyRules()) {
    const mine = found.filter((i) => i.rule === rule.id && !i.kept && !i.review);
    const rows = mine.flatMap((i) => i.rows ?? []);
    const targets = [...(mine.some((i) => !i.rows) ? [about(rule, who)] : []), ...(rows.length ? [includedRows(rows)] : [])];
    for (const target of targets) {
      const kept = await countRule(tx, rule, sql`${target} and not ${notHeld(rule, held)}`);
      if (kept) items.push({ source: rule.table, rule: rule.id, label: rule.label ?? rule.table, class: rule.class, action: rule.action, n: kept, kept: HOLD_KEPT });
      n += await eraseRule(tx, rule, who, sql`${target} and ${notHeld(rule, held)}`);
    }
  }
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

// One set of ids and names for the inventory, the hold check, the rules and the chains, and the rows
// found only by name that the approver must decide on.
async function prepare(tx: Tx, req: RequestRow) {
  if (!req.subjectUserId) throw new PrivacyError("this request has no person to act on");
  const subject = await resolveSubject(tx, req.subjectUserId);
  const who = matchOf({ ids: [...new Set([...req.subjects, ...subject.ids])], label: subject.label }, [req.subjectLabel]);
  const found = await inventory(tx, { ...subject, ids: who.ids }, who.names);
  return { who, found, named: await nameRows(tx, who, found) };
}

/** An open request's rows found only by name, for the approver to check before deciding (read). */
export async function requestNameRows(tx: Tx, id: string) {
  const req = await loadRequest(tx, id);
  if (req.status !== "open") return [];
  return (await prepare(tx, req)).named;
}

export const completePrivacyRequest = defineService({
  name: "privacy.request.complete",
  action: PRIVACY_MANAGE,
  resource: "privacy.request",
  input: z.object({ id: z.uuid(), nameRows: z.object({ include: z.array(z.string().max(100)).max(500).default([]), exclude: z.array(z.string().max(100)).max(500).default([]) }).optional() }),
  async run(tx, input, ctx) {
    const req = await loadRequest(tx, input.id, true);
    if (req.status !== "open") throw new PrivacyError(`this ${req.kind} request is already ${req.status}`);
    await secondApproval(ctx, req);
    const { who, found, named } = await prepare(tx, req);
    assertChecked(found, `complete this ${req.kind} request`);
    const items = decideNameRows(found, named, input.nameRows, EXCLUDED_BY_APPROVER);
    const n = req.kind === "erasure" ? await erase(tx, req, who, items, personOf(ctx)) : await access(tx, req, who, items, personOf(ctx));
    const after = { kind: req.kind, status: "completed", records: n, ...summarise(items) };
    return { result: { id: req.id, ...after, kept: items.filter((i) => i.kept) }, resourceId: req.id, before: { status: "open" }, after, events: [{ name: `privacy.request.completed`, payload: { id: req.id, kind: req.kind } }] };
  },
});
