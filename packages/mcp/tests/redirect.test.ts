import { describe, expect, it } from "vitest";
import { registerClient } from "../src/oauth";

// registerClient rejects before touching the database, so a stub db is enough.
const db = { execute: async () => [] } as never;

describe("OAuth redirect URIs", () => {
  it("accepts https, loopback http and reverse-domain app schemes", async () => {
    for (const uri of ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:33418/callback", "http://localhost:8080/cb", "com.anthropic.claude:/callback"]) {
      await expect(registerClient(db, { redirect_uris: [uri] })).resolves.toMatchObject({ redirect_uris: [uri] });
    }
  });
  it("refuses script, data, file, non-loopback http and bare app schemes", async () => {
    for (const uri of ["javascript:alert(1)", "vbscript:msgbox(1)", "data:text/html,x", "file:///etc/passwd", "http://evil.example/cb", "myapp:/cb"]) {
      await expect(registerClient(db, { redirect_uris: [uri] })).rejects.toThrow(/redirect_uris/);
    }
  });
});
