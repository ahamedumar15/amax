import { createHash } from "node:crypto";
import { open, seal } from "../secrets/crypto";

export type Wrapped = { keyRef: string; wrapped: string };

export type Kms = {
  id: "local" | "aws" | "azure";
  label: string;
  wrap(tenantId: string, dataKey: Uint8Array): Promise<Wrapped>;
  unwrap(tenantId: string, wrapped: Wrapped): Promise<Uint8Array>;
};

export class KmsError extends Error {
  readonly retryable: boolean;
  constructor(op: string, status: number) {
    super(`secrets: key service ${op} failed (${status})`);
    this.name = "KmsError";
    this.retryable = status >= 500 || status === 429;
  }
}

export function parseKeyFile(text: string): Uint8Array {
  const t = text.trim();
  const key = /^[0-9a-f]{64}$/i.test(t) ? Buffer.from(t, "hex") : Buffer.from(t, "base64");
  if (key.length !== 32) throw new Error("secrets: the local key file must hold 32 bytes, as 64 hex characters or base64");
  return new Uint8Array(key);
}

export function localKms(masterKey: Uint8Array, label = "Local key file"): Kms {
  const keyRef = `local:${createHash("sha256").update(masterKey).digest("hex").slice(0, 16)}`;
  return {
    id: "local",
    label,
    async wrap(tenantId, dataKey) {
      return { keyRef, wrapped: seal(masterKey, dataKey, tenantId) };
    },
    async unwrap(tenantId, w) {
      if (w.keyRef !== keyRef) throw new Error("secrets: this tenant's data key was wrapped by a different local key file");
      return open(masterKey, w.wrapped, tenantId);
    },
  };
}
