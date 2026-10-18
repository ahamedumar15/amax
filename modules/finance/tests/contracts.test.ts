import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { CONTRACT_KINDS, EVENTS, KIND_LABELS, listContractRefs, type InvoiceIssued } from "../contracts";
import { financeDb, T } from "./db";

describe("AC-4 contract shape", () => {
  it("publishes the contract kinds and every event the manifest emits, each with a declared payload", () => {
    expect(CONTRACT_KINDS).toEqual(["fixed", "tm", "retainer"]);
    expect(Object.keys(KIND_LABELS)).toEqual([...CONTRACT_KINDS]);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(manifest).toMatchObject({ id: "finance", group: "Business", dependsOn: ["delivery"], integratesWith: ["time"] });
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads and payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("lists contracts with invoiced and open for the job and Finance, none for others, and the issued event names the invoice", async () => {
    const refs = await db.tx((tx) => listContractRefs(tx, contextFor.job(T, "test")));
    expect(refs.map((r) => [r.kind, r.currency, r.value, r.invoiced, r.open])).toEqual([
      ["fixed", "USD", "420000.00", "231000.00", "78085.00"], ["tm", "USD", "210000.00", "151200.00", "18315.00"], ["retainer", "USD", "144000.00", "36000.00", "0.00"]]);
    expect(await db.tx(async (tx) => listContractRefs(tx, await db.as("maya", "Finance")))).toHaveLength(3);
    expect(await db.tx(async (tx) => listContractRefs(tx, await db.as("nimal")))).toEqual([]);
    const finance = await db.as("maya", "Finance");
    await db.registry.call(finance, "invoice_retainer", { contractId: refs[2].id, month: "2026-10" }, { source: "mcp" });
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.invoiceIssued}`);
    expect(Object.keys(e.payload as InvoiceIssued).sort()).toEqual(["by", "contractId", "invoiceId", "legalEntityId", "number", "projectId", "source"]);
  }, 60_000);
});
