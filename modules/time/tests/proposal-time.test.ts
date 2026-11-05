import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { mcpTools } from "../mcp";
import { createRegistry } from "@amax/mcp";
import { chatIntents } from "../chat";
import { proposeLog } from "../server/entry-card";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { ctxFor } from "../server/context";
import { correctEntry, deleteEntry } from "../server/correct";
import { logTime } from "../server/log";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("081 time against a proposal (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  const proposalOf = async (entryId: string) => (await db.q(sql`select p.key from time.entry e left join delivery.proposal p on p.id = e.proposal_id where e.id = ${entryId}`))[0]?.key ?? null;

  it("AC1 an entry names a proposal of its own project; another project's, an unknown or a withdrawn one is refused", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-19", hours: 2 });
    expect(e).toMatchObject({ proposalKey: "CON-014" });
    expect(await proposalOf(e.id)).toBe("CON-014");
    await expect(logTime(nimal, { projectKey: "FLT", proposalKey: "CON-014", day: "2026-10-19", hours: 1 })).rejects.toThrow(/belongs to CON, not FLT/);
    await expect(logTime(nimal, { projectKey: "CON", proposalKey: "CON-999", day: "2026-10-19", hours: 1 })).rejects.toThrow(/no proposal CON-999/);
    await db.t.owner`update delivery.proposal set withdrawn_at = now(), withdrawn_by = 'test', withdraw_reason = 'dropped' where key = 'CON-011'`;
    await expect(logTime(nimal, { projectKey: "CON", proposalKey: "CON-011", day: "2026-10-19", hours: 1 })).rejects.toThrow(/withdrawn/);
  });

  it("AC2 accepting a commit's hours logs them on the commit's proposal", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-20", hours: 1.5, commit: "c0ffee081" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-081", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id from agents.suggestion where kind = 'time.commit-draft' and proposed->>'commit' = 'c0ffee081'`);
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    const [entry] = await db.q(sql`select id from time.entry where source_ref = 'git:c0ffee081'`);
    expect(await proposalOf(entry.id as string)).toBe("CON-014");
  });

  it("AC3 a correction keeps the proposal on the same project, clears it on a move, and sets or clears it when named", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-21", hours: 3 });
    await correctEntry(nimal, { entryId: e.id, hours: 2.5 });
    expect(await proposalOf(e.id)).toBe("CON-014");
    await correctEntry(nimal, { entryId: e.id, proposalKey: null });
    expect(await proposalOf(e.id)).toBeNull();
    await correctEntry(nimal, { entryId: e.id, proposalKey: "CON-012" });
    expect(await proposalOf(e.id)).toBe("CON-012");
    await correctEntry(nimal, { entryId: e.id, projectKey: "FLT" });
    expect(await proposalOf(e.id)).toBeNull();
  });

  it("AC26 Log time asks which proposal (optional); the card shows it; the entry keeps its id; none and other-project proposals behave", async () => {
    const intent = chatIntents.find((i) => i.id === "time.log")!;
    expect(intent.required).not.toContain("proposalKey");
    expect(intent.fields.map((f) => f.name)).toContain("proposalKey");
    // 081 amendment 9 (AC-83, AC-84): settled on every log, from the button or typed, with quick replies.
    for (const text of [intent.fields.find((f) => f.name === "proposalKey")!.ask, mcpTools.find((t) => t.name === "log_time")!.description]) {
      expect(text).toMatch(/settle which proposal before the card unless they named one or said none/);
      expect(text).toMatch(/likelyForMe true/);
      // Product owner, 2026-11-05: never pick for them; the likeliest is the first answer.
      expect(text).toMatch(/always ask, even when one row is clearly likeliest \(it goes first\)/);
      expect(text).not.toMatch(/use it, and the card shows it/);
      expect(text).toMatch(/offer_answers with "Which proposal is it for\?"/);
      expect(text).toMatch(/then "None"/);
      // Found in the end-to-end run: "<KEY>" was read as the project key ("CON · …"); it names the proposal key now.
      expect(text).toMatch(/always the full proposal key the row gives \(CON-014\), never just the project key \(CON\)/);
      expect(text).toContain('"CON-014 · Invoice export to PDF (yours · Building)"');
    }
    const nimal = await db.as("nimal");
    await expect(proposeLog(nimal, { projectKey: "FLT", proposalKey: "CON-014", day: "2026-10-26", hours: 1 })).rejects.toThrow(/belongs to CON, not FLT/);
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    const registry = createRegistry(await installedModules());
    const log = async (input: Record<string, unknown>) => {
      const provider = fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "log_time", input }] }), () => ({ text: "Log it?" })]);
      configureAi({ provider, db: db.app, model: "claude-haiku-5-5" });
      const turn = await chatTurn(db.app, registry, nimal, { text: "log 2 h on CON-014", intent: intent as never });
      expect(provider.calls[0].system).toContain("proposalKey: Which proposal is it for?");
      expect(turn.pending.map((p) => p.tool)).toEqual(["log_time"]);
      const { result } = await confirmAction(db.app, registry, nimal, turn.conversationId, turn.pending[0].id);
      return { card: turn.pending[0].lines ?? [], id: (result as { id: string }).id };
    };
    const withIt = await log({ projectKey: "CON", proposalKey: "CON-014", day: "2026-10-27", hours: 2 });
    expect(withIt.card).toContainEqual({ label: "Proposal", value: "CON-014 Invoice export to PDF" });
    expect(await proposalOf(withIt.id)).toBe("CON-014");
    const without = await log({ projectKey: "CON", day: "2026-10-28", hours: 1 });
    expect(without.card.map((l) => l.label)).not.toContain("Proposal");
    expect(await proposalOf(without.id)).toBeNull();
  }, 60_000);

  it("AC28 Time's audit rows for an entry carry its proposal id, owner, day and hours, so Delivery's history can join on the id", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const [p14] = await db.q(sql`select id from delivery.proposal where key = 'CON-014'`);
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-29", hours: 2 });
    await correctEntry(nimal, { entryId: e.id, hours: 1.5 });
    await deleteEntry(nimal, { entryId: e.id });
    const rows = await db.q(sql`select action, after from core.audit_event where resource = 'time.entry' and resource_id = ${e.id} order by seq`);
    const who = (await db.as("nimal")).userId;
    expect(rows.map((r) => [r.action, (r.after as Record<string, unknown>).proposalId, (r.after as Record<string, unknown>).userId, (r.after as Record<string, unknown>).day, Number((r.after as Record<string, unknown>).hours)])).toEqual([
      ["time.entry.log", p14.id, who, "2026-10-29", 2], ["time.entry.correct", p14.id, who, "2026-10-29", 1.5], ["time.entry.delete", p14.id, who, "2026-10-29", 1.5]]);
    expect((rows[1].after as Record<string, unknown>).previousProposalId).toBe(p14.id);
  });
});
