import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { ScopeError } from "@amax/auth";
import { ctxFor } from "../server/context";
import { getChecklist, listChecklists, onboardingSummary } from "../server/queries";
import { completeTask } from "../server/tasks";
import { onboardingDb } from "./db";

// The fixtures' today (fixtures.md); queries take the day, so this reads as the demo does.
const ON = "2026-10-16";
const owners = (c: { tasks: { title: string; owner: string; ownerLabel: string }[] }) => c.tasks.map((t) => [t.title, t.owner, t.ownerLabel]);

describe.skipIf(!hasDb)("onboarding against Postgres", () => {
  let db: Awaited<ReturnType<typeof onboardingDb>>;
  beforeAll(async () => { db = await onboardingDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-1 templates by entity and role; hr.person.joined and left start a checklist whose tasks go to HR, IT Admin and the manager", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const [maya, hr, ravi, nimal] = [await db.as("maya"), await db.as("maya", "HR"), await db.as("ravi"), await db.as("nimal")];

    // Fixtures: Mohamed Rifkhan joins Nov 2 (Engineering, Sri Lanka, Nimal his manager); Rizwan Farook's offboarding is done.
    const s = await onboardingSummary(maya, ON);
    expect([s.overdue.map((t) => [t.title, t.personName]), s.joiners.map((c) => c.personName).includes("Mohamed Rifkhan"), s.leavers]).toEqual([
      [["Collect the signed contract and ID copies", "Mohamed Rifkhan"]], true, []]);
    const all = await listChecklists(maya, ON);
    const rifkhan = all.find((c) => c.personName === "Mohamed Rifkhan")!;
    expect(owners(rifkhan)).toEqual([
      ["Send the welcome pack", "HR", "HR"], ["Collect the signed contract and ID copies", "HR", "HR"], ["Order and image a laptop", "ITAdmin", "IT Admin"],
      ["Pick a buddy and plan the first week", "Manager", "Nimal Silva"], ["Grant sign-in, email and licences", "ITAdmin", "IT Admin"],
      ["Register for EPF and ETF", "HR", "HR"], ["First-week check-in", "Manager", "Nimal Silva"],
    ]);
    expect(all.find((c) => c.personName === "Rizwan Farook")).toMatchObject({ kind: "leaver", startsOn: "2026-09-30", completedOn: expect.any(String) });

    // HR records a joiner in Australia and a leaver through hr's tools; the event tick starts their checklists.
    await db.registry.call(hr, "add_person", { name: "Jordan Example", title: "Account manager", department: "Sales", entity: "Australia", joinedOn: "2026-12-01" }, { source: "mcp" });
    await db.registry.call(hr, "record_leaver", { employeeNo: "LL-0291", leftOn: "2026-11-30" }, { source: "mcp" });
    await db.tick();
    const fresh = await listChecklists(maya, ON);
    const jordan = fresh.find((c) => c.personName === "Jordan Example")!;
    expect([jordan.kind, jordan.startsOn, owners(jordan).map((o) => o[0])]).toEqual(["joiner", "2026-12-01",
      ["Send the welcome pack", "Order a laptop", "Plan the first week", "Grant sign-in, email and licences", "Collect the TFN declaration and super choice"]]);
    const ayesha = fresh.find((c) => c.personName === "Ayesha Rahman")!;
    expect([ayesha.kind, owners(ayesha)[0]]).toEqual(["leaver", ["Agree the handover of work", "Manager", "Maya Fernando"]]);
    expect(await db.q(sql`select actor, source from core.audit_event where action = 'onboarding.checklist.start' order by actor`)).toEqual([
      { actor: "job:onboarding.joiner", source: "job" }, { actor: "job:onboarding.leaver", source: "job" }]);

    // Owners tick off their own tasks: IT Admin the IT task, the manager theirs; not someone else's.
    const task = (title: string) => rifkhan.tasks.find((t) => t.title === title)!.id;
    expect(await completeTask(ctxFor(ravi), { taskId: task("Order and image a laptop"), note: "Laptop LK-2231 (fictional) imaged" })).toMatchObject({ done: true });
    await expect(completeTask(ctxFor(ravi), { taskId: task("Register for EPF and ETF") })).rejects.toBeInstanceOf(ScopeError);
    await expect(completeTask(ctxFor(nimal), { taskId: task("Register for EPF and ETF") })).rejects.toBeInstanceOf(ScopeError);
    await completeTask(ctxFor(nimal), { taskId: task("Pick a buddy and plan the first week") });
    await expect(completeTask(ctxFor(hr), { taskId: task("Pick a buddy and plan the first week") })).rejects.toThrow("already done");
    expect((await listChecklists(nimal, ON)).map((c) => c.personName)).toEqual(["Mohamed Rifkhan"]);
    expect((await getChecklist(maya, rifkhan.id, ON))!.tasks.filter((t) => t.doneOn).map((t) => t.completedBy)).toEqual(["fixtures", expect.stringMatching(/./), expect.stringMatching(/./)]);
  });
});
