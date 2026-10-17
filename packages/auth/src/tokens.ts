import { createHash, randomBytes } from "node:crypto";

// Bearer tokens are random, shown once, and stored only as a SHA-256 hash (they're high-entropy,
// so a slow hash adds nothing). The prefix says what a leaked token is for.
export const newToken = (prefix: "amx_scim" | "amx_api" | "amx_mcp" | "amx_sp") => `${prefix}_${randomBytes(24).toString("base64url")}`;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const bearer = (req: Request) => req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
