import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { createRelease, recordDeployment } from "../server/services";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { ReleaseBody } from "../ui/ReleasePage";
import { completedLine } from "../ui/ReleaseInfo";
import { When } from "../ui/When";
import { mcpTools } from "../mcp";
import { OPEN, releaseDb } from "./release-db";

describe.skipIf(!hasDb)("125 the release page (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let done: string, open: string;
  const page = async (viewer: Viewer, key: string, version: string) => {
    const [release, envs, project] = await Promise.all([getRelease(db.sahan, key, version), listEnvironments(db.sahan, key), getProject(db.sahan, key)]);
    return renderToStaticMarkup(createElement(ReleaseBody, { viewer, release: { ...release!, projectId: project!.project.id }, envs }));
  };
  beforeAll(async () => {
    db = await releaseDb();
    const p = await db.proposal("RTK");
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "d1", name: "Done one", proposalKeys: [p] });
    for (const environment of ["Dev", "UAT"]) await recordDeployment(db.admin(), { projectKey: "RTK", version: "d1", environment, pipelineRun: `run-${environment}` });
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "o1", name: "Open one" });
    [done, open] = [await page(db.sahan, "RTK", "d1"), await page(db.sahan, "RTK", "o1")];
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-5 the information card: category, status, dates and the completion with On time", () => {
    expect(done).toMatch(/<dt>Category<\/dt><dd>UAT<\/dd>/);
    expect(done).toMatch(/<dt>Completed<\/dt><dd>\d+ \w+ \d{4} · On time<\/dd>/);
    expect(open).toMatch(/<dt>Completed<\/dt><dd><span class="muted">Not yet<\/span>/);
  });

  it("AC-6 the proposals card links each proposal and shows its phase", () => {
    expect(done).toMatch(/href="\/delivery\/proposals\/RTK-\d+"><b>RTK-\d+<\/b>/);
    expect(done).toContain(">Verified<");
  });

  it("AC-7 deployments grouped by environment, the completing one marked, an empty environment said so", () => {
    expect(done).toMatch(/aria-label="UAT deployments">.*Run run-UAT.*Completed the release/);
    expect(done).toMatch(/aria-label="Dev deployments">(?:(?!Completed the release).)*<\/section>/);
    expect(done).toMatch(/aria-label="Prod deployments"><h3>Prod<span class="chip">Prod<\/span><\/h3><p class="muted">Not deployed yet/);
  });

  it("AC-8 the status history: from, to, why and who, oldest first", () => {
    expect(done).toMatch(/Created<\/td>.*Deployed to UAT<\/td>/);
    expect(done).toMatch(/In progress<\/span><\/td><td data-label="To"><span class="chip">Completed/);
    expect(done).not.toMatch(/(user|sp):[0-9a-f]{8}-/);
  });

  it("AC-7 AC-8 each history row pins its own change; the completion day is the project's; times render labelled UTC until the browser has them", async () => {
    const release = (await getRelease(db.sahan, "RTK", "d1"))!;
    const change = release.statusHistory.at(-1)!;
    expect(done).toContain(`&quot;tool&quot;:&quot;get_release_status_change&quot;,&quot;args&quot;:{&quot;changeId&quot;:&quot;${change.id}&quot;}`);
    expect(await mcpTools.find((t) => t.name === "get_release_status_change")!.run(db.sahan as never, { changeId: change.id } as never, "mcp")).toMatchObject({ id: change.id, to: "completed" });
    expect(completedLine({ ...release, completedAt: "2026-12-12T20:00:00Z", completedDay: "2026-12-13", completion: "late" })).toBe("Completed on 13 Dec 2026 · Late");
    expect(renderToStaticMarkup(createElement(When, { at: "2026-12-12T20:05:00Z" }))).toContain("12 Dec 2026, 20:05 UTC");
  });

  it("AC-9 AC-10 Edit for an Admin on an open release; a PM elsewhere is told; a completed release is read-only", async () => {
    expect(open).toMatch(/data-ask="Edit release o1 of RTK"[^>]*>.*Edit release/);
    const other = await page(db.maya, "RTK", "o1");
    expect(other).toContain("Only the project&#x27;s PM or an Admin can change a release.");
    expect(other).not.toContain("Edit release");
    expect(done).toContain("A completed release can&#x27;t change.");
    for (const button of ["Edit release", "Ask amax to re-tag", "Ask amax to change the proposals"]) expect(done).not.toContain(button);
    expect(await page(db.sahan, "CON", "v2.4.0")).toMatch(/isn&#x27;t tracked yet.*Ask amax to track it|Ask amax to track it.*isn&#x27;t tracked yet/);
  });
});
