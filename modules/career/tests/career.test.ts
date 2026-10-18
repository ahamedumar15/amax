import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Career, CareerEventView } from "../server/queries";
import { sharedDb } from "./db";

const GRADE = "06600000-0000-4000-8000-000000000009";

describe.skipIf(!hasDb)("career reads and the one write (Postgres)", () => {
  const use = sharedDb();
  const career = async (args: object, who = "maya") => (await use().call<Career>(who, "get_career", args))!;

  it("AC9 the fixtures give Kasun Dias the mock's history", async () => {
    const { events, importedFrom } = await career({ employeeNo: "LL-0417" });
    const count = (k: string) => events.filter((e) => e.kind === k).length;
    const techs = new Set(events.flatMap((e) => (e.kind === "project" ? e.technologies.map((t) => t.name) : [])));
    expect([count("joined") + count("grade"), count("project"), techs.size, count("certification"), count("move")]).toEqual([3, 5, 9, 2, 2]);
    expect(events.filter((e) => e.kind === "certification").map((e) => e.kind === "certification" && e.expiresOn! < "2026-10-16")).toEqual([true, false]);
    expect(importedFrom).toMatch(/fictional/);
  });

  it("AC5 get_career answers what Kasun has worked on since 2023, in the screen's rows", async () => {
    const all = await career({ employeeNo: "LL-0417" });
    expect(all.rows.map((r) => r.title)).toEqual(["AWS, PostgreSQL proposed on Fleet Tracker", "Adatum claims spike, 10%", "Internal Design System, 20%", "AWS Developer Associate", "Senior Engineer",
      "Fleet Tracker, 70%", "Manager Maya Fernando", "Northwind Claims", "Engineer", "Azure Developer AZ-204", "Contoso Portal", "Manager Nimal Silva", "Joined as Associate Engineer"]);
    expect(all.rows[1].sub).toBe("Apr – May 2025 · Python, AWS");
    const since = await career({ personId: all.person.id, since: "2023-01-01" });
    expect(since.events.flatMap((e) => (e.kind === "project" ? [e.name] : []))).toEqual(["Northwind Claims", "Fleet Tracker", "Internal Design System", "Adatum claims spike"]);
  });

  it("AC4 a pin on an event resolves to that event and its trace; live records name who recorded them", async () => {
    const db = use();
    const { person } = await career({ employeeNo: "LL-0417" });
    const v = await db.call<CareerEventView>("maya", "get_career_event", { personId: person.id, eventId: GRADE });
    expect([v.trace.title, v.trace.lines, v.trace.source]).toEqual(["Promoted to Senior Engineer", [["Grade", "Engineer → Senior Engineer"], ["Effective", "Apr 1, 2024"],
      ["Recorded by", "HR agent for Dilini Perera, Mar 22, 2024"], ["Approved by", "Maya Fernando, Mar 25, 2024"]], { label: "HR employment period", href: "/hr/p/LL-0417", ref: "a41f09c2" }]);
    await db.call("maya", "record_certification", { employeeNo: "LL-0233", name: "CKA Kubernetes Administrator", issuedOn: "2026-10-02", expiresOn: "2028-10-02" }, "HR");
    const nimal = await career({ employeeNo: "LL-0233" });
    const cert = nimal.events.find((e) => e.kind === "certification" && e.name === "CKA Kubernetes Administrator")!;
    const live = await db.call<CareerEventView>("maya", "get_career_event", { personId: nimal.person.id, eventId: cert.id });
    expect(live.trace.lines[2]).toEqual(["Recorded by", expect.stringMatching(/^Maya Fernando, Oct \d+, 20\d\d$/)]);
    expect(nimal.events[0]).toMatchObject({ kind: "joined", on: "2020-06-01", grade: "E5", department: "Engineering" });
  });

  it("AC3 chat confirms a proposed tag or adds one with tag_technology; the screen has no other write", async () => {
    const db = use();
    await expect(db.call("kasun", "tag_technology", { personId: "LL-0417", project: "FLT", technology: "AWS" })).rejects.toThrow();
    expect(await db.call("maya", "tag_technology", { personId: "LL-0417", project: "FLT", technology: "AWS" })).toMatchObject({ project: "Fleet Tracker", technology: "AWS", added: false });
    expect(await db.call("maya", "tag_technology", { personId: "LL-0417", project: "Contoso Portal", technology: "Terraform" })).toMatchObject({ added: true });
    await expect(db.call("maya", "tag_technology", { personId: "LL-0417", project: "CON", technology: "terraform" })).rejects.toThrow(/already confirmed/);
    await expect(db.call("maya", "tag_technology", { personId: "LL-0417", project: "Woodgrove", technology: "Go" })).rejects.toThrow(/no project/);
    const { events } = await career({ employeeNo: "LL-0417" });
    const fleet = events.find((e) => e.kind === "project" && e.project === "FLT");
    expect(fleet?.kind === "project" && fleet.technologies).toEqual([{ name: "Go", proposed: false }, { name: "AWS", proposed: false }, { name: "PostgreSQL", proposed: true }]);
    expect(events.filter((e) => e.kind === "technology").map((e) => e.kind === "technology" && e.names)).toEqual([["PostgreSQL"]]);
    expect(use().registry.all.filter((t) => t.module === "career" && t.scope !== "read").map((t) => t.name)).toEqual(["tag_technology"]);
    expect((await db.q(sql`select count(*)::int as n from core.audit_event where action = 'career.technology.tag'`))[0].n).toBe(2);
  });
});
