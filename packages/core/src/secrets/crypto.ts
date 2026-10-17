import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1:";

export const newDataKey = () => new Uint8Array(randomBytes(32));

export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function open(key: Uint8Array, sealed: string, aad: string): Uint8Array {
  if (!sealed.startsWith(PREFIX)) throw new Error("secrets: unknown ciphertext format");
  const raw = Buffer.from(sealed.slice(PREFIX.length), "base64");
  if (raw.length < 28) throw new Error("secrets: ciphertext is truncated");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(12, 28));
  return new Uint8Array(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]));
}
