import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion } from "@amax/agents/server";
import { applyDue } from "../server/apply";
import { ctxFor } from "../server/read";
import { sharedDb, T } from "./db";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!hasDb)("leavers (Postgres)", () => {
  const use = sharedDb(true);

  it("AC3 hr.person.left proposes revoking everything on the last day, once (with onboarding's request too), and nothing is revoked before it", async () => {
    const db = use();
    const [maya, ravi] = [await db.as("maya"), await db.as("ravi")];
    const lastDay = inDays(10);
    await db.registry.call(maya, "record_leaver", { employeeNo: "LL-0417", leftOn: lastDay }, { source: "mcp" });
    await db.tick();
    await db.tick();
    const open = await db.q(sql`select id, title, proposed, agent_name from agents.suggestion where kind = 'it-access.revoke'`);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ title: `Revoke Kasun Dias's access on their last day, ${lastDay}`, agent_name: "Access agent", proposed: { account: "Kasun Dias", lastDay } });

    await acceptSuggestion(ctxFor(ravi), { id: open[0].id as string });
    await applyDue(T);
    const [c] = await db.q(sql`select status, effective_on::text as day, jsonb_array_length(detail->'seatIds') as seats from it_access.change where action = 'revoke'`);
    expect(c).toEqual({ status: "queued", day: lastDay, seats: 4 });
    expect(await db.q(sql`select count(*)::int as n from it_access.seat s join it_access.account a on a.id = s.account_id where a.display_name = 'Kasun Dias' and s.removed_on is null`)).toEqual([{ n: 4 }]);
  }, 240_000);
});
