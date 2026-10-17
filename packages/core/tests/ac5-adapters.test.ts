import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryCache } from "../src/adapters/cache";
import { memoryStorage, ObjectLockedError, s3Storage, storageFromEnv } from "../src/adapters/storage";
import { repoRoot } from "@amax/db";
// @ts-ignore — plain ESM helper from the graph checker
import { walk } from "../../../scripts/graph/scan.mjs";

const cfg = { endpoint: "https://s3.example.test", bucket: "amax", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };

function recorder(status = 200, body = "") {
  const calls: Request[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(input instanceof Request ? input : new Request(input, init));
    return new Response(body, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("AC-5 S3-compatible storage", () => {
  it("signs requests with SigV4 against the bucket path", async () => {
    const { calls, fetchImpl } = recorder();
    await s3Storage(cfg, fetchImpl).put("files/a b.txt", "hello", { contentType: "text/plain" });
    const [req] = calls;
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("https://s3.example.test/amax/files/a%20b.txt");
    expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request/);
    expect(req.headers.get("x-amz-object-lock-mode")).toBeNull();
  });

  it("write-once puts send compliance-mode object lock and Content-MD5", async () => {
    const { calls, fetchImpl } = recorder();
    const until = new Date("2033-10-17T00:00:00Z");
    await s3Storage(cfg, fetchImpl).put("audit/x.ndjson", "{}\n", { retainUntil: until });
    const h = calls[0].headers;
    expect(h.get("x-amz-object-lock-mode")).toBe("COMPLIANCE");
    expect(h.get("x-amz-object-lock-retain-until-date")).toBe(until.toISOString());
    expect(h.get("content-md5")).toBe(createHash("md5").update("{}\n").digest("base64"));
  });

  it("returns null for a missing object and maps a lock refusal", async () => {
    expect(await s3Storage(cfg, recorder(404).fetchImpl).get("nope")).toBeNull();
    await expect(s3Storage(cfg, recorder(403, "<Code>ObjectLocked</Code>").fetchImpl).delete("audit/x")).rejects.toBeInstanceOf(ObjectLockedError);
  });

  it("presigns a time-limited URL", async () => {
    const url = new URL(await s3Storage(cfg).presign("files/a.pdf", { expiresIn: 60 }));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is configured from env, or not at all", () => {
    expect(storageFromEnv({})).toBeNull();
    expect(storageFromEnv({ S3_ENDPOINT: cfg.endpoint, S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" })).not.toBeNull();
  });

  it("memory storage honours retention like a locked bucket", async () => {
    let now = new Date("2026-10-17T00:00:00Z");
    const s = memoryStorage(() => now);
    await s.put("k", "v1", { retainUntil: new Date("2026-10-18T00:00:00Z") });
    await expect(s.put("k", "v2")).rejects.toBeInstanceOf(ObjectLockedError);
    await expect(s.delete("k")).rejects.toBeInstanceOf(ObjectLockedError);
    now = new Date("2026-10-19T00:00:00Z");
    await s.delete("k");
    expect(await s.get("k")).toBeNull();
  });
});

describe("AC-5 cache adapter", () => {
  it("expires entries", async () => {
    let now = 0;
    const c = memoryCache(() => now);
    await c.set("k", { a: 1 }, 10);
    expect(await c.get("k")).toEqual({ a: 1 });
    now = 10_001;
    expect(await c.get("k")).toBeUndefined();
  });
});

describe("AC-5 no host-specific code outside the adapters", () => {
  const HOST = /^(@vercel\/|cloudflare:|@cloudflare\/|@opennextjs\/|@aws-sdk\/|ioredis|redis$|@upstash\/|@netlify\/)/;
  const ADAPTERS = "packages/core/src/adapters/";
  // node:fs is allowed only in build-time and test tooling, never in request-path code.
  const FS_OK = ["packages/core/src/registry.ts", "packages/db/src/migrate.ts", "packages/db/src/testdb.ts", "packages/db/bin/"];

  it("packages and modules import host APIs only through packages/core/src/adapters", () => {
    const problems: string[] = [];
    for (const top of ["packages", "modules"]) {
      for (const file of walk(join(repoRoot, top)) as Iterable<string>) {
        const rel = relative(repoRoot, file);
        if (rel.includes("/tests/") || rel.startsWith("packages/testing/")) continue;
        const specs = [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2]);
        for (const spec of specs) {
          if (HOST.test(spec) && !rel.startsWith(ADAPTERS)) problems.push(`${rel}: ${spec}`);
          if (/^(node:)?fs(\/|$)/.test(spec) && !FS_OK.some((ok) => rel.startsWith(ok))) problems.push(`${rel}: ${spec}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
