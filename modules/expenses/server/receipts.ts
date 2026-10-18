import { sql } from "drizzle-orm";
import { z } from "zod";
import { storageFromEnv, defineService, type Storage } from "@amax/core/server";
import { EVENTS, type ReceiptAdded } from "../contracts";
import { claimant } from "./claims";
import { actorOf } from "./read";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

let override: Storage | null = null;
/** Tests and hosts without env config hand in their own storage; otherwise core's S3 adapter from env. */
export const setReceiptStorage = (s: Storage | null) => { override = s; };
export const receiptStorage = () => override ?? storageFromEnv();

export const addReceipt = defineService({
  name: "expenses.receipt.add", action: "expenses:claim", resource: "expenses.receipt",
  input: z.object({
    filename: z.string().trim().min(1).max(200), contentType: z.enum(TYPES),
    dataBase64: z.string().min(4).max(Math.ceil((MAX_BYTES * 4) / 3) + 4).describe("The photo or PDF, base64"),
    text: z.string().max(20_000).optional().describe("The receipt's text: a PDF's text layer or the device's OCR, when there is one"),
  }),
  async run(tx, a, ctx) {
    const store = receiptStorage();
    if (!store) throw new Error("file storage isn't set up on this server (S3_ENDPOINT and S3_BUCKET), so receipts can't be kept yet");
    const me = await claimant(tx, ctx);
    const body = new Uint8Array(Buffer.from(a.dataBase64, "base64"));
    if (!body.length || body.length > MAX_BYTES) throw new Error("a receipt must be a file of at most 8 MB");
    const [r] = await tx.execute(sql`insert into expenses.receipt (tenant_id, user_id, legal_entity_id, filename, content_type, size_bytes, ocr_text, uploaded_by)
      values (${ctx.tenantId}, ${me.userId}, ${me.legalEntityId}, ${a.filename}, ${a.contentType}, ${body.length}, ${a.text ?? null}, ${actorOf(ctx)}) returning id`);
    const key = `expenses/${ctx.tenantId}/${r.id as string}`;
    await store.put(key, body, { contentType: a.contentType });
    await tx.execute(sql`update expenses.receipt set storage_key = ${key} where id = ${r.id}`);
    const payload: ReceiptAdded = { receiptId: r.id as string, userId: me.userId!, legalEntityId: me.legalEntityId };
    return { result: { receiptId: r.id as string, filename: a.filename, note: "The receipt agent will suggest the claim's fields; accept the suggestion to file it, or claim it yourself with this receiptId." },
      resourceId: r.id as string, after: { filename: a.filename, contentType: a.contentType, sizeBytes: body.length }, events: [{ name: EVENTS.receiptAdded, payload }] };
  },
});

export async function receiptLink(key: string | null) {
  const store = key ? receiptStorage() : null;
  return store && key ? store.presign(key, { expiresIn: 300 }).catch(() => null) : null;
}
