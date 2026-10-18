import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { ForbiddenError } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { recordCertification } from "../server/certifications";
import { enrolPeople, recordCompletion } from "../server/enrolment";
import { createProgramme } from "../server/programmes";
import { getProgramme, listCertifications, listProgrammes } from "../server/queries";
import { learningStats } from "../server/stats";
import { learningDb } from "./db";

const ON = "2026-10-16";

describe.skipIf(!hasDb)("learning against Postgres", () => {
  let db: Awaited<ReturnType<typeof learningDb>>;
  let hr: Viewer, maya: Viewer;
  beforeAll(async () => { db = await learningDb(); [hr, maya] = [await db.as("maya", "HR"), await db.as("maya", "PM")]; }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-1 programmes, enrolment, completion and certifications with expiry match fixtures.md", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const s = await learningStats(maya, ON);
    expect(s).toMatchObject({ headcount: 184, programmes: { total: 18, internal: 11, external: 7 }, optional: { people: 126, share: 68 }, completion: { rate: 74, target: 80 },
      mandatory: [{ title: "ISO 27001 awareness", completed: 184 }], certifications: { valid: 41, expiringThisYear: 6 } });
    expect(s.participation.map((m) => m.people)).toEqual([8, 14, 22, 19, 31, 26, 18, 34, 41, 29]);
    const rows = await listProgrammes(maya, ON);
    expect(rows.slice(0, 4).map((p) => [p.title, p.kind, p.people, p.completion, p.hours, p.status])).toEqual([
      ["Azure AI Engineer cohort", "certification", 22, 58, 640, "running"], ["Agentic engineering with MCP", "workshop", 38, 92, 456, "running"],
      ["ISO 27001 awareness", "compliance", 184, 100, 184, "done"], ["Leading delivery teams", "leadership", 9, 33, 108, "running"],
    ]);
    const soon = await listCertifications(maya, { on: ON, until: "2026-12-31" });
    expect(soon.slice(0, 2).map((c) => [c.name, c.personName, c.expiresOn])).toEqual([["AZ-305 Solutions Architect", "Nimal Silva", "2026-12-02"], ["ISTQB Advanced", "Ayesha Rahman", "2026-12-18"]]);
  });

  it("AC-1 HR adds a programme, enrols people, records completion and a certification, each audited", async () => {
    const ctx = ctxFor(hr);
    const p = await createProgramme(ctx, { title: "Threat modelling (fictional)", kind: "workshop", delivery: "internal", mandatory: false, startsOn: "2026-10-01", endsOn: "2026-12-11" });
    expect(p.number).toBe("LP-0019");
    expect(await enrolPeople(ctx, { programmeId: p.id, employeeNos: ["LL-0417", "LL-0291"] })).toEqual({ enrolled: 2, already: 0 });
    expect(await enrolPeople(ctx, { programmeId: p.id, employeeNos: ["LL-0417"] })).toEqual({ enrolled: 0, already: 1 });
    await expect(enrolPeople(ctx, { programmeId: p.id, employeeNos: ["LL-9999"] })).rejects.toThrow("no person LL-9999");
    await recordCompletion(ctx, { programmeId: p.id, employeeNo: "LL-0417", progress: 40, hours: 3 });
    await expect(recordCompletion(ctx, { programmeId: p.id, employeeNo: "LL-0417", progress: 20 })).rejects.toThrow("progress only goes up");
    expect(await recordCompletion(ctx, { programmeId: p.id, employeeNo: "LL-0417", hours: 2 })).toMatchObject({ completed: true });
    const one = (await getProgramme(maya, p.id, ON))!;
    expect([one.people, one.completion, one.hours, one.participants.map((x) => [x.name, x.progress])]).toEqual([2, 50, 5, [["Ayesha Rahman", 0], ["Kasun Dias", 100]]]);
    await expect(recordCertification(ctx, { employeeNo: "LL-0417", name: "X", issuedOn: "2026-10-01", expiresOn: "2026-09-01" })).rejects.toThrow("must expire after");
    const actions = await db.q(sql`select action, source from core.audit_event where resource like 'learning.%' order by seq`);
    expect(actions.map((a) => a.action)).toEqual(["learning.programme.create", "learning.enrolment.create", "learning.enrolment.create", "learning.enrolment.complete", "learning.enrolment.complete"]);
  });

  it("AC-3 permissions: HR manages, Leadership and PMs read, engineers see nothing", async () => {
    const [sarah, nimal] = [await db.as("sarah"), await db.as("nimal")];
    expect((await listProgrammes(sarah, ON)).length).toBeGreaterThanOrEqual(18);
    await expect(listProgrammes(nimal, ON)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createProgramme(ctxFor(maya), { title: "Nope", kind: "course", delivery: "internal", mandatory: false, startsOn: "2026-11-01" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(recordCertification(ctxFor(sarah), { employeeNo: "LL-0417", name: "X", issuedOn: "2026-10-01" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
