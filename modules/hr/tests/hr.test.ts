import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { isMasked } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { getPersonView } from "../server/queries";
import { addPerson, changePerson, recordLeaver } from "../server/services";
import { peopleStats } from "../server/stats";
import { hrDatabase, TODAY } from "./setup";

describe.skipIf(!hasDb)("hr against Postgres", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-1 the hr schema is tenant-isolated and every retention entry names real columns", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const missing: string[] = [];
    for (const r of manifest.retention ?? []) {
      const [schema, table] = r.table.split(".");
      const cols = new Set((await db.t.owner`select column_name from information_schema.columns where table_schema = ${schema} and table_name = ${table}`).map((c) => c.column_name as string));
      for (const c of [...r.fields, ...r.start.at, ...(r.start.idle ? ["updated_at"] : [])]) if (!cols.has(c)) missing.push(`${r.table}.${c}`);
    }
    expect(missing).toEqual([]);
  });

  it("AC-2 People numbers come from rows and match fixtures.md; the Person page masks pay and health for a PM", async () => {
    const s = await peopleStats(db.mayaAs("PM"), TODAY);
    expect(s.headcount).toBe(184);
    expect(s.byEntity.map((e) => [e.country, e.n])).toEqual([["LK", 171], ["AU", 13]]);
    expect(Object.fromEntries(s.departments.map((d) => [d.name, d.n]))).toEqual({ Engineering: 112, Quality: 24, Delivery: 14, Sales: 9, "People and Culture": 8, Finance: 6, IT: 6, Leadership: 5 });
    expect(s.joiners).toEqual([5, 4, 5, 4, 4, 4, 6, 4, 3, 3]);
    expect(s.leavers).toEqual([2, 1, 3, 1, 2, 1, 2, 1, 1, 0]);
    expect(s).toMatchObject({ quarter: { joined: 3, left: 0 }, upcoming: { n: 2, on: "2026-11-02" }, probation: { open: 11, dueThisMonth: 3 }, documentsMissing: 7, contractsEndingNextMonth: 2 });
    const pm = (await getPersonView(db.mayaAs("PM"), "LL-0417"))!;
    expect(isMasked(pm.employment!.baseSalary)).toBe(true);
    expect(pm.documents.map((d) => [d.title, d.status])).toEqual([["Updated NIC copy", "missing"], ["Promotion letter, E4", "signed"], ["Employment contract", "signed"]]);
    const [health] = await db.tx((tx) => tx.execute(sql`select p.employee_no from hr.document d join hr.person p on p.id = d.person_id where d.class = 'health'`));
    expect(isMasked((await getPersonView(db.mayaAs("PM"), health.employee_no as string))!.documents[0].title)).toBe(true);
    expect((await getPersonView(db.mayaAs("HR"), health.employee_no as string))!.documents[0].title).toBe("Medical certificate");
  });

  it("AC-3 add, change and leave emit hr.person.joined, changed and left; the add-person intent fills add_person", async () => {
    const hr = ctxFor(db.mayaAs("HR"));
    const added = await addPerson(hr, { name: "Ishara Peiris", title: "QA engineer", department: "Quality", entity: "Sri Lanka", joinedOn: "2026-12-01", managerEmployeeNo: "LL-0291" });
    expect(added).toMatchObject({ employeeNo: "LL-1190", status: "joining" });
    await changePerson(hr, { employeeNo: added.employeeNo, effectiveOn: "2027-03-01", grade: "E2", fte: 0.8 });
    await recordLeaver(hr, { employeeNo: "LL-0598", leftOn: "2026-10-31" });
    const events = await db.tx((tx) => tx.execute(sql`select name, payload from core.event where name like 'hr.person.%' order by created_at, id`));
    expect(events.map((e) => e.name)).toEqual(["hr.person.joined", "hr.person.changed", "hr.person.left"]);
    expect(events[1].payload).toMatchObject({ changed: ["grade", "fte"], effectiveOn: "2027-03-01" });
    await expect(addPerson(ctxFor(db.mayaAs("PM")), { name: "No Access", title: "x", department: "IT", entity: "LK", joinedOn: "2026-12-01" })).rejects.toThrow(/forbidden/);
    const intent = (manifest.chatIntents as { id: string; tool: string; required: string[] }[]).find((i) => i.id === "hr.add-person")!;
    const tool = createRegistry([manifest]).toolsFor(db.mayaAs("HR")).find((t) => t.name === intent.tool);
    expect(tool).toBeDefined();
    expect(Object.keys((manifest.mcpTools!.find((t) => t.name === "add_person")!.input as unknown as { shape: object }).shape)).toEqual(expect.arrayContaining(intent.required));
  });
});
