import { describe, expect, it } from "vitest";
import manifest from "../module";
import { chatIntents } from "../chat";
import { CONTROLS, DATA_CLASSES, EVENTS, RISK_LEVELS } from "../contracts";
import { mcpTools } from "../mcp";
import { breachRuleFor, notifyBy } from "../packs";
import { controlsOf, type Overview } from "../server/overview";
import { levelOf } from "../server/risks";
import { lede } from "../ui/CompliancePage";
import { decidePrompt } from "../ui/prompts";

const ID = "11111111-1111-4111-8111-111111111111";
const incident = { id: ID, ref: "INC-002", title: "Payslip emailed to the wrong person", regulator: "OAIC", notifyBy: "2026-11-15T02:00:00.000Z", breach: true, decision: null, status: "assessing" };
const base = {
  coverage: { people: 184, fullyAcknowledged: 167, policies: [{ id: ID, key: "acceptable-use", title: "Acceptable Use", version: 4, control: "A.5.1", publishedOn: "2026-10-12", inScope: 184, acknowledged: 167, pending: 17, pendingPeople: [] }] },
  incidents: [incident], risks: [], suppliers: [], chain: { id: ID, checkedAt: new Date().toISOString(), ok: true, events: 1_900_000, headSeq: 1_900_000, brokenAt: null, reason: null, brokenAction: null, brokenResource: null, source: "job" }, training: null,
} as unknown as Omit<Overview, "controls">;

describe("compliance contracts", () => {
  it("AC2 country packs set the breach deadline: 30 days to assess in Australia, 72 hours in Sri Lanka, 72 hours without a pack", () => {
    const at = new Date("2026-10-16T02:00:00Z");
    expect(notifyBy(at, "AU").toISOString()).toBe("2026-11-15T02:00:00.000Z");
    expect(notifyBy(at, "LK").toISOString()).toBe("2026-10-19T02:00:00.000Z");
    expect([breachRuleFor("AU").regulator, breachRuleFor("LK").regulator, breachRuleFor("NZ").hours]).toEqual(["OAIC", "Data Protection Authority", 72]);
    expect(decidePrompt(incident)).toContain(`(incident id ${ID})`);
  });

  it("AC6 the screen leads with what needs attention and shows each control's evidence or its gap", () => {
    expect(lede({ ...base, controls: [] })).toBe("17 people still need to acknowledge the updated Acceptable Use policy, and one possible data breach needs a decision by Nov 15.");
    expect(controlsOf(base).map((c) => [c.control, c.status])).toEqual([
      ["A.5.18", "Needs IT access (021)"], ["A.6.3", "Needs Learning (024)"], ["A.8.15", "Verified daily"], ["A.5.1", "167 of 184"], ["A.5.24", "1 recorded, 1 open"],
    ]);
    expect([levelOf(3, 5), levelOf(2, 3), levelOf(1, 5)]).toEqual(["high", "medium", "low"]);
  });

  it("AC7 the manifest declares its events and payloads, intents, tools, schedules, notification rules and integrations", () => {
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(chatIntents.map((c) => [c.id, c.tool])).toEqual([["compliance.report-incident", "report_incident"], ["compliance.new-risk", "add_risk"]]);
    expect(mcpTools.filter((t) => t.scope === "write").map((t) => t.name)).toEqual(["report_incident", "update_incident", "add_risk", "update_risk", "add_supplier", "update_supplier", "publish_policy", "acknowledge_policy", "export_evidence", "check_audit_chain"]);
    expect(mcpTools.filter((t) => t.scope === "read").every((t) => t.pin)).toBe(true);
    expect(manifest.notifications?.map((n) => n.event)).toEqual([EVENTS.acknowledgementRequested, EVENTS.breachFlagged, EVENTS.breachDeadline, EVENTS.chainChecked]);
    expect((manifest.schedules as { name: string }[]).map((s) => s.name)).toEqual(["compliance.audit-chain", "compliance.breach-reminders"]);
    expect([CONTROLS.length, DATA_CLASSES.length, RISK_LEVELS.length]).toEqual([5, 6, 3]);
    expect(manifest).toMatchObject({ id: "compliance", group: "Operations", dependsOn: ["hr"], integratesWith: ["it-access", "learning"] });
  });
});
