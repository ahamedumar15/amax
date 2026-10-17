import { randomBytes } from "node:crypto";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, contextFor } from "@amax/core/server";
import { configureSecrets, localKms, putSecret, type ConnectorId } from "@amax/core/secrets";
import { installAuthorizer, setGrants } from "@amax/auth";

export const T = "35353535-0000-4000-8000-000000000035";
export const OTHER = "35353535-0000-4000-8000-000000000036";
export const job = (tenantId = T) => contextFor.job(tenantId, "api-test");

export async function apiDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) });
  setGrants([]);
  installAuthorizer();
  await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs'), (${OTHER}, 'Harbour Works')`;
  const secret = (connector: ConnectorId, value: string, tenantId = T) => putSecret(job(tenantId), { connector, value });
  return { t, app, secret };
}
