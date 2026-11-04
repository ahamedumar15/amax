import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ProjectPage } from "../ui/ProjectPage";
import { proposalDb } from "./proposal-db";

const html = async (node: Promise<unknown> | unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

describe.skipIf(!hasDb)("081 amendment 4: the board leads like Team time (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC42 the band says what is in flight per phase and how far the tasks are, each legend item opening the filtered Proposals tab, each part pinned", async () => {
    const page = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(page).toMatch(/aria-label="\d+ proposals? in flight: [^"]+"/);
    expect(page).toMatch(/aria-label="\d+ of \d+ tasks done: \d+ by agents, \d+ by people[^"]*, \d+ open"/);
    expect(page).toContain('href="/delivery/p/CON/proposals/building"');
    expect(page).toMatch(/data-pin="[^"]*proposals in flight/);
    // The band sits between the tabs and the board (AC-45: the board itself is unchanged).
    expect(page.indexOf("dv-band")).toBeGreaterThan(page.indexOf('aria-label="Project sections"') === -1 ? 0 : page.indexOf('aria-label="Project sections"'));
    expect(page.indexOf("dv-band")).toBeLessThan(page.indexOf('class="board"'));
  });

  it("AC43 Needs you lists refused pushes for whoever may link the repo, each folded with its pin and age; others don't see them", async () => {
    const page = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(page).toContain(">Needs you</h2>");
    expect(page).toMatch(/<details class="dv-fold"><summary><span class="chip warn">Push refused<\/span><span class="dv-title">stale: 1b7d0c3/);
    expect(page).toMatch(/<time dateTime="2026-10-16T09:40:00.000Z"/);
    const leadership = await html(ProjectPage({ viewer: await db.as("maya", "Leadership"), params: { key: "CON" } }));
    expect(leadership).not.toContain("Push refused</span><span class=\"dv-title\"");
  });

  it("AC44 Repo sync folds to one row, open when a push was refused, keeping its heading, pin and table", async () => {
    const page = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(page).toMatch(/<details class="dv-fold" open=""><summary><h2>Repo sync<\/h2><span class="chip warn">2 pushes refused<\/span><small class="muted">last sync <time/);
    expect(page).toContain("2 recent pushes were refused.");
  });
});
