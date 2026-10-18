import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Career } from "../server/queries";
import { sharedDb } from "./db";

describe.skipIf(!hasDb)("who sees a career (Postgres)", () => {
  const use = sharedDb();

  it("AC6 the person, their manager chain, HR and leadership see it; anyone else doesn't; pay and health documents never appear", async () => {
    const db = use();
    const see = async (who: string, role?: Parameters<typeof db.call>[3]) => (await db.call<Career | null>(who, "get_career", { employeeNo: "LL-0417" }, role))?.events.length ?? 0;
    expect([await see("kasun"), await see("maya"), await see("maya", "HR"), await see("maya", "Leadership"), await see("maya", "PM")]).toEqual([13, 13, 13, 13, 13]);
    expect([await see("sahan"), await see("nimal"), await see("ayesha")]).toEqual([0, 0, 0]);
    await expect(db.call("sahan", "tag_technology", { personId: "LL-0417", project: "FLT", technology: "Rust" })).rejects.toThrow(/whose career you can see/);
    const text = JSON.stringify(await db.call("maya", "get_career", { employeeNo: "LL-0417" }));
    for (const secret of ["285000", "baseSalary", "salary", "EPF-0552231", "8001207740", "Commercial Bank", "NIC", "Medical", "health"]) expect(text).not.toContain(secret);
  });
});
