import { describe, expect, it } from "vitest";
import manifest from "../module";
import { chatIntents } from "../chat";
import { EVENTS, LEAVE_SENSITIVE, LEAVE_TYPES, REQUEST_STATUSES } from "../contracts";
import { fillerHistory, NAMED, openingTaken } from "../fixtures/history";
import { mcpTools } from "../mcp";
import { PACKS } from "../packs";
import { workingDays } from "../server/days";
import { approveAllPrompt, approvePrompt, decidePrompt } from "../ui/prompts";

const days = (s: { from: string; to: string }) => workingDays(s.from, s.to, new Set(PACKS.LK.holidays.map((h) => h.on))).length;
const total = (xs: { from: string; to: string }[]) => xs.reduce((n, s) => n + days(s), 0);

describe("leave contracts", () => {
  it("AC1 the Sri Lanka and Australia packs carry the types, entitlements and holidays", () => {
    expect(PACKS.LK.policies.map((p) => [p.type, p.daysPerYear])).toEqual([["annual", 14], ["casual", 7], ["medical", 7], ["lieu", null], ["unpaid", null]]);
    expect(PACKS.AU.policies.map((p) => p.label)).toEqual(["Annual", "Personal/carer's", "Long service", "Unpaid"]);
    expect(PACKS.LK.holidays.filter((h) => h.kind === "poya").map((h) => h.on)).toEqual(["2026-10-26", "2026-11-24", "2026-12-23"]);
    expect(Object.values(LEAVE_SENSITIVE)).toEqual(["health", "health"]);
    expect([...new Set([...PACKS.LK.policies, ...PACKS.AU.policies].map((p) => p.type))].every((t) => (LEAVE_TYPES as readonly string[]).includes(t))).toBe(true);
  });

  it("AC1 fixture history adds up to fixtures.md: 620 days by month and by type, 41 in October by 19 people", () => {
    const approved = [...NAMED.filter((s) => !s.status), ...fillerHistory()];
    const month = (m: number) => approved.filter((s) => Number(s.from.slice(5, 7)) === m);
    expect(Array.from({ length: 10 }, (_, i) => total(month(i + 1)))).toEqual([58, 49, 71, 88, 64, 52, 61, 79, 57, 41]);
    expect(["annual", "casual", "medical", "lieu"].map((t) => total(approved.filter((s) => s.type === t)))).toEqual([357, 161, 84, 18]);
    expect(new Set(month(10).map((s) => s.who)).size).toBe(19);
    expect(approved.filter((s) => s.from <= "2026-10-16" && s.to >= "2026-10-16").map((s) => s.type).sort()).toEqual(["annual", "annual", "annual", "casual", "casual", "medical"]);
    expect(openingTaken([14, 14, 2], 20)).toEqual([4, 4, 2]);
  });

  it("AC2 Ask amax prompts name the exact request by id", () => {
    const r = { id: "11111111-1111-4111-8111-111111111111", personName: "Nimal Silva", label: "Annual", dates: "Oct 27 – Oct 30", clashes: ["Overlaps Fleet Tracker v1.8.0 UAT retry"] };
    expect(approvePrompt(r)).toBe("Approve Nimal Silva's annual leave, Oct 27 – Oct 30 (request id 11111111-1111-4111-8111-111111111111)");
    expect(decidePrompt(r)).toContain("Overlaps Fleet Tracker v1.8.0 UAT retry.");
    expect(approveAllPrompt([r, r]).match(/request id/g)).toHaveLength(2);
  });

  it("AC3 and AC4 the manifest declares its events and payloads, the request leave intent, the tools and its integrations", () => {
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(manifest.events?.payloads?.[EVENTS.approved]).toMatchObject({ paid: "plain", days: "plain", halfDay: "plain" });
    expect(manifest.events?.handles?.map((h) => h.event)).toEqual(["delivery.release.deployed"]);
    expect(REQUEST_STATUSES).toEqual(["pending", "approved", "rejected", "cancelled"]);
    expect(chatIntents.map((c) => [c.id, c.tool])).toEqual([["leave.request", "request_leave"]]);
    expect(mcpTools.filter((t) => t.scope === "write").map((t) => t.name)).toEqual(["request_leave", "approve_leave", "reject_leave", "cancel_leave", "apply_leave_pack"]);
    expect(manifest).toMatchObject({ id: "leave", group: "People", dependsOn: ["hr"], integratesWith: ["delivery"] });
  });
});
