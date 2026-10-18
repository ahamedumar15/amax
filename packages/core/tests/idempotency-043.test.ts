import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, contextFor, defineService, ForbiddenError, keyedOutcome, lookupKey, ReplayedError, setAuthorizer, UndeclaredWriteError, withIdempotency } from "../src/server";

const T = "00000000-0000-4000-8000-000000000043";
const maya = contextFor.ui(T, { id: "user:maya", roles: ["Admin"] });
const liam = contextFor.ui(T, { id: "user:liam", roles: ["Admin"] });

const rename = (name: string, inner?: () => Promise<unknown>) =>
  defineService({
    name,
    action: "core:legal_entity:update",
    resource: "core.legal_entity",
    input: z.object({ id: z.uuid(), name: z.string() }),
    async run(tx, input) {
      await tx.execute(sql`update core.legal_entity set name = ${input.name} where id = ${input.id}`);
      await inner?.();
      return { result: { id: input.id, key: input.name }, resourceId: input.id };
    },
  });

describe.skipIf(!hasDb)("043 idempotency contract", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let id: string;
  const keys = () => withTenant(app, T, (tx) => tx.execute(sql`select key, outcome from core.idempotency order by key`));

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    [{ id }] = await t.owner`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${T}, 'Lumen', 'LK', 'LKR') returning id`;
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setAuthorizer(() => true);
  });
  afterAll(() => t?.drop());

  it("AC-1 a scope that declares its service refuses any other before it writes", async () => {
    const declared = rename("core.test.declared");
    const other = rename("core.test.other");
    const run = await withIdempotency("043:declared", () => other(maya, { id, name: "Other" }), { service: declared.spec.name });
    expect(run).toMatchObject({ ok: false, writes: 0 });
    expect((run as { error: unknown }).error).toBeInstanceOf(UndeclaredWriteError);
    expect(await keys()).toEqual([]);
    expect(await withIdempotency("043:declared", () => declared(maya, { id, name: "Declared" }), { service: declared.spec.name })).toMatchObject({ ok: true, writes: 1 });
  });

  it("AC-2 a service called inside another's run gets a derived key and isn't a second top-level write", async () => {
    const inner = defineService({ name: "core.test.inner", action: "core:legal_entity:update", resource: "core.legal_entity", input: z.object({}), run: async () => ({ result: null }) });
    const outer = rename("core.test.outer", () => inner(maya, {}));
    const run = await withIdempotency("043:nested", () => outer(maya, { id, name: "Outer" }));
    expect(run).toMatchObject({ ok: true, writes: 1, nested: 1 });
    expect((await keys()).map((k) => k.key)).toEqual(expect.arrayContaining(["043:nested", "043:nested/1"]));
  });

  it("AC-4 a stored outcome comes back as ReplayedError, found through a wrapping error too", async () => {
    const svc = rename("core.test.replay");
    await withIdempotency("043:replay", () => svc(maya, { id, name: "Once" }));
    const again = await withIdempotency("043:replay", () => svc(maya, { id, name: "Once" }).catch((e) => Promise.reject(new Error("wrapped", { cause: e }))));
    expect(again).toMatchObject({ ok: false });
    expect(keyedOutcome((again as { error: unknown }).error)).toBeInstanceOf(ReplayedError);
    expect((keyedOutcome((again as { error: unknown }).error) as ReplayedError).replay).toMatchObject({ resourceId: id, key: "Once" });
  });

  it("AC-5 a record bound to its actor is refused to anyone else", async () => {
    const svc = rename("core.test.bound");
    await withIdempotency("043:bound", () => svc(maya, { id, name: "Mine" }), { by: "user:maya" });
    expect(await lookupKey(app, T, "043:bound", "user:maya")).toMatchObject({ done: { key: "Mine" }, by: "user:maya" });
    await expect(lookupKey(app, T, "043:bound", "user:liam")).rejects.toBeInstanceOf(ForbiddenError);
    const theirs = await withIdempotency("043:bound", () => svc(liam, { id, name: "Mine" }), { by: "user:liam" });
    expect((theirs as { error: unknown }).error).toBeInstanceOf(ForbiddenError);
  });
});
