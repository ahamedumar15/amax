import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { tokenHash } from "@amax/auth/tokens";
import { getChecklist } from "../server/queries";
import { answerExit, exitQuestionnaire } from "../server/exit";
import { onboardingDb } from "./db";

const ON = "2026-10-16";

describe.skipIf(!hasDb)("exit questionnaire (Postgres)", () => {
  let db: Awaited<ReturnType<typeof onboardingDb>>;
  beforeAll(async () => { db = await onboardingDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-3 the exit link is single-use, stored hashed and expires after 14 days; the answers reach HR only", async () => {
    const [hr, ravi, nimal] = [await db.as("maya", "HR"), await db.as("ravi"), await db.as("nimal")];
    const [rizwan] = await db.q(sql`select id from onboarding.checklist where person_name = 'Rizwan Farook'`);
    const send = (v: typeof hr, checklistId: string) => db.registry.call(v, "send_exit_questionnaire", { checklistId }, { source: "mcp" }) as Promise<{ token: string; path: string; expiresAt: string }>;
    await expect(send(nimal, rizwan.id as string)).rejects.toThrow();
    const link = await send(hr, rizwan.id as string);
    expect(link.path).toBe(`/exit/${link.token}`);
    const [row] = await db.q(sql`select token_hash, extract(day from expires_at - issued_at)::int as days from onboarding.exit_link`);
    expect(row).toEqual({ token_hash: tokenHash(link.token), days: 14 });
    expect(JSON.stringify(await db.q(sql`select * from core.audit_event a, core.event e where a.action = 'onboarding.exit.issue' and e.name = 'onboarding.exit.issued'`))).not.toContain(link.token);

    expect(await exitQuestionnaire(link.token)).toMatchObject({ state: "open", personName: "Rizwan Farook" });
    expect(await exitQuestionnaire("amx_exit_not-a-real-token-at-all")).toEqual({ state: "unknown" });
    await answerExit(link.token, { reason: "Moving abroad (fictional)", change: "" });
    await expect(answerExit(link.token, { reason: "Again" })).rejects.toThrow("already been used");
    expect(await exitQuestionnaire(link.token)).toMatchObject({ state: "answered" });
    await expect(send(hr, rizwan.id as string)).rejects.toThrow("already answered");
    expect((await getChecklist(hr, rizwan.id as string, ON))!.exit).toMatchObject({ answers: { reason: "Moving abroad (fictional)" }, answeredAt: expect.any(String) });
    expect((await getChecklist(ravi, rizwan.id as string, ON))!.exit).toMatchObject({ answers: null });

    // Another leaver's link, past its 14 days, takes no answers.
    await db.registry.call(hr, "record_leaver", { employeeNo: "LL-0291", leftOn: "2026-10-31" }, { source: "mcp" });
    await db.tick();
    const [ayesha] = await db.q(sql`select id from onboarding.checklist where person_name = 'Ayesha Rahman'`);
    const late = await send(hr, ayesha.id as string);
    await db.t.owner`update onboarding.exit_link set expires_at = now() - interval '1 minute', issued_at = now() - interval '14 days 1 minute' where checklist_id = ${ayesha.id as string}`;
    expect(await exitQuestionnaire(late.token)).toMatchObject({ state: "expired" });
    await expect(answerExit(late.token, { reason: "Late" })).rejects.toThrow("expired");
  });
});
