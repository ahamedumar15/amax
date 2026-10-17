import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";

// Files go through this one interface. s3Storage speaks the S3 API over fetch + SigV4, so the same
// code reaches AWS S3, Cloudflare R2 and MinIO from Node or a Worker.
export type PutOptions = {
  contentType?: string;
  /** Write-once: object lock in compliance mode until this date. The bucket needs object lock enabled. */
  retainUntil?: Date;
};

export type Storage = {
  put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** A time-limited URL a browser can GET (or PUT) directly. */
  presign(key: string, opts?: { expiresIn?: number; method?: "GET" | "PUT" }): Promise<string>;
};

export class ObjectLockedError extends Error {
  constructor(key: string) {
    super(`storage: ${key} is under retention and can't be changed`);
    this.name = "ObjectLockedError";
  }
}

export type S3Config = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string };

const bytes = (body: Uint8Array | string) => (typeof body === "string" ? new TextEncoder().encode(body) : body);

export function s3Storage(cfg: S3Config, fetchImpl: typeof fetch = fetch): Storage {
  const aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region ?? "auto", service: "s3" });
  const url = (key: string) => `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const send = async (req: Request) => fetchImpl(await aws.sign(req));
  const fail = async (op: string, key: string, res: Response) => {
    const text = await res.text();
    if (res.status === 403 && /ObjectLocked|AccessDenied.*retention|WORM/i.test(text)) throw new ObjectLockedError(key);
    throw new Error(`storage: ${op} ${key} failed (${res.status}) ${text.slice(0, 200)}`);
  };

  return {
    async put(key, body, opts = {}) {
      const data = bytes(body);
      const headers: Record<string, string> = { "content-type": opts.contentType ?? "application/octet-stream" };
      if (opts.retainUntil) {
        headers["x-amz-object-lock-mode"] = "COMPLIANCE";
        headers["x-amz-object-lock-retain-until-date"] = opts.retainUntil.toISOString();
        headers["content-md5"] = createHash("md5").update(data).digest("base64");
      }
      const res = await send(new Request(url(key), { method: "PUT", body: new Uint8Array(data), headers }));
      if (!res.ok) await fail("put", key, res);
    },
    async get(key) {
      const res = await send(new Request(url(key)));
      if (res.status === 404) return null;
      if (!res.ok) await fail("get", key, res);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await send(new Request(url(key), { method: "DELETE" }));
      if (!res.ok && res.status !== 404) await fail("delete", key, res);
    },
    async presign(key, { expiresIn = 900, method = "GET" } = {}) {
      const u = new URL(url(key));
      u.searchParams.set("X-Amz-Expires", String(expiresIn));
      const signed = await aws.sign(new Request(u, { method }), { aws: { signQuery: true } });
      return signed.url;
    },
  };
}

// In-process storage for tests and local development. Honours retention like a locked bucket.
export function memoryStorage(now: () => Date = () => new Date()) {
  const objects = new Map<string, { body: Uint8Array; opts: PutOptions }>();
  const locked = (key: string) => {
    const until = objects.get(key)?.opts.retainUntil;
    return until !== undefined && until > now();
  };
  const storage: Storage & { objects: typeof objects } = {
    objects,
    async put(key, body, opts = {}) {
      if (locked(key)) throw new ObjectLockedError(key);
      objects.set(key, { body: bytes(body), opts });
    },
    async get(key) {
      return objects.get(key)?.body ?? null;
    },
    async delete(key) {
      if (locked(key)) throw new ObjectLockedError(key);
      objects.delete(key);
    },
    async presign(key, { expiresIn = 900 } = {}) {
      return `memory://${key}?expires=${Math.floor(now().getTime() / 1000) + expiresIn}`;
    },
  };
  return storage;
}

export function storageFromEnv(env: Record<string, string | undefined> = process.env): Storage | null {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  return s3Storage({ endpoint: S3_ENDPOINT, bucket: S3_BUCKET, accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, region: S3_REGION });
}
