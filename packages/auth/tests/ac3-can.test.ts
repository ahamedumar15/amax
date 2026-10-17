import { beforeAll, describe, expect, it } from "vitest";
import { contextFor, ForbiddenError, setAuthorizer, authorize } from "@amax/core/server";
import { applyViewAs, can, installAuthorizer, setGrants } from "../src";
import { AU, LK, viewer } from "./fixtures";

beforeAll(() => {
  setGrants([
    { grants: { Employee: ["time:read@own", "time:submit@own"], PM: ["time:read@managed", "time:approve@managed", "delivery:read"], Engineer: ["time:read@assigned", "delivery:read"], HR: ["hr:*"], Payroll: ["payroll:read"] } },
    { grants: { Finance: ["finance:read"] } },
  ]);
});

const maya = viewer("maya", ["PM", "Leadership"], { managedProjects: ["con", "hri"] });
const nimal = viewer("nimal", ["Engineer", "Employee"], { assignedProjects: ["flt", "con"] });
const admin = viewer("sahan", ["Admin"]);

describe("AC-3 can()", () => {
  it("grants come from manifests and roles combine", () => {
    expect(can(maya, "delivery:read")).toBe(true);
    expect(can(maya, "finance:read")).toBe(false);
    expect(can(viewer("hr", ["HR"]), "hr:employee:update")).toBe(true);
  });

  it("@managed limits to projects the viewer manages", () => {
    expect(can(maya, "time:approve", { projectId: "con" })).toBe(true);
    expect(can(maya, "time:approve", { projectId: "flt" })).toBe(false);
    expect(can(maya, "time:approve")).toBe(false);
  });

  it("canEver() counts qualified grants for the up-front check; the record check still applies", async () => {
    const { canEver } = await import("../src/can");
    expect(canEver(maya, "time:approve")).toBe(true);
    expect(canEver(maya, "finance:read")).toBe(false);
  });

  it("@assigned and @own", () => {
    expect(can(nimal, "time:read", { projectId: "flt" })).toBe(true);
    expect(can(nimal, "time:read", { projectId: "hri" })).toBe(false);
    expect(can(nimal, "time:submit", { ownerUserId: "nimal" })).toBe(true);
    expect(can(nimal, "time:submit", { ownerUserId: "kasun" })).toBe(false);
  });

  it("legal-entity and department scopes narrow every role, Admin included", () => {
    const lkPayroll = viewer("p", [{ role: "Payroll", legalEntityIds: [LK], departments: null }]);
    expect(can(lkPayroll, "payroll:read", { legalEntityId: LK })).toBe(true);
    expect(can(lkPayroll, "payroll:read", { legalEntityId: AU })).toBe(false);
    const engHr = viewer("h", [{ role: "HR", legalEntityIds: null, departments: ["Engineering"] }]);
    expect(can(engHr, "hr:read", { department: "Finance" })).toBe(false);
    const lkAdmin = viewer("a", [{ role: "Admin", legalEntityIds: [LK], departments: null }]);
    expect(can(lkAdmin, "anything", { legalEntityId: AU })).toBe(false);
    expect(can(admin, "anything:at-all", { legalEntityId: AU })).toBe(true);
  });

  it("View as previews a role's grants, and only for Admins", () => {
    const asPm = applyViewAs(admin, "PM");
    expect(asPm.viewAs).toBe("PM");
    expect(can(asPm, "finance:read")).toBe(false);
    expect(asPm.actualRoles).toEqual(["Admin"]);
    expect(applyViewAs(maya, "Admin").viewAs).toBeUndefined();
    expect(can(applyViewAs(maya, "Admin"), "finance:read")).toBe(false);
  });

  it("is what defineService's authorize step calls", async () => {
    installAuthorizer();
    const ctx = { ...contextFor.ui(maya.tenantId, { id: "maya" }), viewer: maya };
    expect(await authorize(ctx, "delivery:read", "x", {})).toBe(true);
    expect(await authorize(ctx, "finance:read", "x", {})).toBe(false);
    expect(await authorize(contextFor.ui(maya.tenantId, { id: "anon" }), "delivery:read", "x", {})).toBe(false);
    expect(await authorize(contextFor.job(maya.tenantId, "nightly"), "finance:read", "x", {})).toBe(true);
    setAuthorizer(() => false);
    expect(ForbiddenError).toBeDefined();
  });
});
