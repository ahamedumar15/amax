import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(__dirname, "../../..");
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const helm = spawnSync("helm", ["template", "smoke", join(repo, "deploy/helm/amax")], { encoding: "utf8" });

describe("AC6 deploy anywhere", () => {
  it("AC6 each target is wired to the same app and the chart probes /healthz", () => {
    const wrangler = JSON.parse(read("apps/web/wrangler.jsonc"));
    // 003: worker.ts wraps OpenNext's worker to add the Cron Trigger for /api/jobs/tick.
    expect(wrangler.main).toBe("worker.ts");
    expect(read("apps/web/worker.ts")).toContain('from "./.open-next/worker.js"');
    expect(wrangler.compatibility_flags).toContain("nodejs_compat");
    expect(JSON.parse(read("apps/web/vercel.json")).framework).toBe("nextjs");
    expect(read("Dockerfile")).toMatch(/HEALTHCHECK[\s\S]*\/healthz[\s\S]*apps\/web\/server\.js/);
    expect(read(".github/workflows/ci.yml")).toMatch(/vercel[\s\S]*build:cloudflare[\s\S]*k3d cluster create/);
    if (helm.error) return;
    expect(helm.status).toBe(0);
    expect(helm.stdout.match(/path: \/healthz/g)).toHaveLength(2);
    expect(helm.stdout).toMatch(/readOnlyRootFilesystem: true/);
  });
});
