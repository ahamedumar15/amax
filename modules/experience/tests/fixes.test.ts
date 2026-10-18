import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer } from "@amax/auth";
import { acceptSuggestion } from "@amax/agents/server";
import manifest from "../module";
import { EVENTS, FIX_KIND } from "../contracts";
import { runCollect } from "../server/collect";
import { runRemediations } from "../server/remediate";
import { sharedDb, T } from "./db";

type View = { fixes: { title: string; status: string }[]; helpdesk: boolean };

describe.skipIf(!hasDb)("the experience agent (Postgres)", () => {
  const use = sharedDb(true);
  const accept = async (key: string, id: string) => acceptSuggestion(contextForViewer(await use().as(key), "chat"), { id });
  const fixes = () => use().q(sql`select s.id, s.title, s.evidence, s.status, i.key from agents.suggestion s join experience.issue i on i.suggestion_id = s.id where s.kind = ${FIX_KIND} order by i.devices desc`);

  it("AC5 an issue on 5 or more devices becomes a suggestion for IT with its evidence; accepting queues a remediation that runs only as allowed, or marks a helpdesk ticket", async () => {
    const db = use();
    const [teams, boot, ...rest] = await fixes();
    expect([teams.title, boot.title, rest]).toEqual(["Roll back Teams on 14 laptops", "Replace 6 laptops from 2021 in Engineering", []]);
    expect((teams.evidence as { label: string }[]).map((e) => e.label)).toEqual(["14 devices affected, first seen 2026-10-13", "Likely cause: Teams 24.10 arrived on Oct 13"]);
    expect(await db.q(sql`select key, suggestion_id from experience.issue where devices < 5 order by key`)).toEqual([{ key: "app:VPN client:5.2", suggestion_id: null }, { key: "battery", suggestion_id: null }]);
    await expect(accept("nimal", teams.id as string)).rejects.toThrow();
    expect(await db.q(sql`select count(*)::int as n from experience.remediation`)).toEqual([{ n: 0 }]);
    await accept("ravi", teams.id as string);
    expect(await runRemediations(T)).toEqual([{ status: "manual" }]);
    expect(await db.q(sql`select status, outcome, approved_by like 'user:%' as by_person from experience.remediation`)).toEqual([{ status: "manual", outcome: "Remediation is off for this tenant: run it in Intune", by_person: true }]);
    await accept("ravi", boot.id as string);
    expect((await db.q(sql`select payload->>'fix' as fix from core.event where name = ${EVENTS.fixAccepted} order by created_at`)).map((r) => r.fix)).toEqual(["remediation", "ticket"]);
    const v = (await db.registry.call(await db.as("maya"), "get_experience", {}, { source: "mcp" })) as View;
    expect([v.fixes.map((f) => f.status), v.helpdesk]).toEqual([["accepted", "accepted"], true]);
    expect(db.modules.find((m) => m.id === "helpdesk")?.chatIntents).toContainEqual(expect.objectContaining({ id: "helpdesk.new-ticket", tool: "create_ticket" }));
  });

  it("AC6 a group's score down 1 point or more on four weeks earlier is announced once, with device data kept 90 days", async () => {
    const db = use();
    await runCollect(T);
    await runCollect(T);
    expect(await db.q(sql`select payload from core.event where name = ${EVENTS.scoreDropped}`)).toEqual([{ payload: { dimension: "department", group: "Quality", from: 8.3, to: 7.1, asOf: "2026-10-16" } }]);
    expect(manifest.retention!.filter((r) => r.period === "P90D").map((r) => [r.table, r.start.at, r.action])).toEqual([
      ["experience.device", ["last_seen_at"], "delete"], ["experience.device_day", ["collected_at"], "delete"], ["experience.device_app_day", ["collected_at"], "delete"]]);
  });
});
