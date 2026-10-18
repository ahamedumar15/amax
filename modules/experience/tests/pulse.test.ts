import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createPostgresEngine, setWorkflowEngine, workflowRegistry } from "@amax/workflows/server";
import manifest from "../module";
import { EVENTS } from "../contracts";
import { sharedDb } from "./db";

type View = { pulse: { id: string; answers: number; shares: unknown } };

describe.skipIf(!hasDb)("pulse surveys (Postgres)", () => {
  const use = sharedDb();
  const call = async (key: string, tool: string, args: object) => use().registry.call(await use().as(key), tool, args, { source: "mcp" });

  it("AC4 at most one pulse a fortnight, sent through 030's rule to each person, answered anonymously and reported only from 5 answers", async () => {
    const db = use();
    await expect(call("maya", "send_pulse", {})).rejects.toThrow(/a pulse went out on 2026-10-13/);
    await expect(call("kasun", "send_pulse", {})).rejects.toThrow();
    await db.q(sql`update experience.settings set today = '2026-10-28'`);
    const sent = (await call("maya", "send_pulse", { question: "How well does the VPN work for you?" })) as { pulseId: string; recipients: number };
    const users = await db.q(sql`select distinct p.user_id from hr.person p where p.status = 'active' and p.user_id is not null`);
    expect(sent.recipients).toBe(users.length);
    expect((await db.q(sql`select payload->>'userId' as u from core.event where name = ${EVENTS.pulseSent}`)).map((r) => r.u).sort()).toEqual(users.map((u) => u.user_id).sort());
    expect(manifest.notifications).toEqual([expect.objectContaining({ event: EVENTS.pulseSent, to: [{ owner: "userId" }] })]);
    const engine = createPostgresEngine({ db: db.app, registry: workflowRegistry(db.modules) });
    setWorkflowEngine(async () => engine);
    await db.tick();
    expect(await db.q(sql`select n.title from notifications.notification n join auth.user u on u.id = n.user_id where u.email = 'kasun@lumenlabs.test' and n.rule_id = 'experience.pulse'`))
      .toEqual([{ title: "Pulse survey: How well does the VPN work for you?" }]);

    await call("kasun", "answer_pulse", { pulseId: sent.pulseId, choice: "a-lot" });
    await expect(call("kasun", "answer_pulse", { pulseId: sent.pulseId, choice: "well" })).rejects.toThrow(/already answered/);
    expect(await db.q(sql`select * from experience.pulse_answer where pulse_id = ${sent.pulseId}`)).toEqual([expect.objectContaining({ choice: "a-lot", department: "Engineering" })]);
    expect(Object.keys((await db.q(sql`select * from experience.pulse_answer limit 1`))[0]).sort()).toEqual(["choice", "department", "id", "legal_entity_id", "pulse_id", "tenant_id"]);
    expect(await db.q(sql`select after from core.audit_event where resource = 'experience.pulse_answer'`)).toEqual([{ after: { pulseId: sent.pulseId } }]);
    const v = (await call("maya", "get_experience", {})) as View;
    expect([v.pulse.id, v.pulse.answers, v.pulse.shares]).toEqual([sent.pulseId, 1, null]);
  });
});
