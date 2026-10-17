import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { putSecret, useSecret, type ConnectorId } from "../src/secrets";
import { contextFor, ForbiddenError, setAuthorizer, type ServiceContext } from "../src/server";
import { admin, secretsDb, T, testValue } from "./secrets-fixture";

const xeroUser = contextFor.ui(T, { id: "user:finance", roles: ["Finance"] });
const nobody = contextFor.ui(T, { id: "user:nimal", roles: ["Engineer"] });
const job = contextFor.job(T, "sync");
const GRANTS: Record<string, string[]> = { "user:finance": ["secrets:use:xero"], "user:maya": ["secrets:credential:manage"] };

const CASES: [string, ServiceContext, ConnectorId, boolean][] = [
  ["a user granted xero, on xero", xeroUser, "xero", true],
  ["a user granted xero, on msgraph-write", xeroUser, "msgraph-write", false],
  ["a user with no grant, on xero", nobody, "xero", false],
  ["a system job, on msgraph-write", job, "msgraph-write", true],
];

describe.skipIf(!hasDb)("031 AC-1 using a credential is authorised per connector", () => {
  secretsDb();

  it.each(CASES)("AC1 %s", async (_name, ctx, connector, allowed) => {
    setAuthorizer((c, action) => c.actor.kind === "system" || (GRANTS[c.actor.id] ?? []).includes(action));
    try {
      for (const c of ["xero", "msgraph-write"] as const) await putSecret(admin, { connector: c, value: testValue(c), expiresAt: null });
      const attempt = useSecret(ctx, { connector, purpose: "probe" }, async () => "ok");
      if (allowed) expect(await attempt).toBe("ok");
      else await expect(attempt).rejects.toThrow(ForbiddenError);
    } finally {
      setAuthorizer(() => true);
    }
  });
});
