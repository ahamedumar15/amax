import { createHmac, randomBytes } from "node:crypto";

// Bearer tokens are 192 random bits, shown once, and stored only as a keyed SHA-256 digest. They
// aren't passwords: with that much entropy a slow hash adds nothing, and lookups must be by digest.
// The HMAC key is a fixed domain separator so a digest can't be reused as any other hash.
export const newToken = (prefix: "amx_scim" | "amx_api" | "amx_mcp" | "amx_sp") => `${prefix}_${randomBytes(24).toString("base64url")}`;
export const tokenHash = (token: string) => createHmac("sha256", "amax/bearer-token/v1").update(token).digest("hex");
export const bearer = (req: Request) => req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
