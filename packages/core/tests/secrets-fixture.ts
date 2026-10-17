import { randomBytes } from "node:crypto";
import { afterAll, beforeAll } from "vitest";
import type { Db } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureSecrets, localKms } from "../src/secrets";
import { configureRuntime, contextFor, setAuthorizer } from "../src/server";

export const T = "00000000-0000-4000-8000-0000000031a1";
export const admin = contextFor.ui(T, { id: "user:maya", roles: ["Admin"] });
export const job = contextFor.job(T, "graph-sync");
export const testValue = (label: string) => `test-${label}-${randomBytes(12).toString("hex")}`;

export function secretsDb() {
  const state = {} as { t: Awaited<ReturnType<typeof migratedDatabase>>; app: Db };
  beforeAll(async () => {
    state.t = await migratedDatabase();
    await state.t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    state.app = state.t.app();
    configureRuntime({ db: state.app, auditKey: "test-audit-key-test-audit-key-123456" });
    configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) });
    setAuthorizer(() => true);
  });
  afterAll(() => state.t?.drop());
  return state;
}

export async function databaseText(owner: Awaited<ReturnType<typeof migratedDatabase>>["owner"]) {
  const tables = await owner`select table_schema || '.' || table_name as t from information_schema.tables
    where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')`;
  const dumps = await Promise.all(tables.map(async ({ t }) => (await owner.unsafe(`select coalesce(string_agg(x::text, E'\\n'), '') as d from ${t} x`))[0].d as string));
  return dumps.join("\n");
}
