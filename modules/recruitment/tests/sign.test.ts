import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { setSignTransport, zohoSend, zohoStatus } from "../sign";
import { sharedDb } from "./db";

describe("AC-3 Zoho Sign adapter", () => {
  afterEach(() => setSignTransport(null));
  it("AC3 sends the offer from the template to the candidate and reads a completed request as signed", async () => {
    const calls: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
    setSignTransport(async (req) => {
      calls.push(req);
      return { status: 200, body: JSON.stringify({ requests: req.method === "POST" ? { request_id: "zs-1" } : { request_status: "completed" } }) };
    });
    const c = { token: "t0k", templateId: "tpl-9", dc: "eu" as const };
    const id = await zohoSend(c, { offerId: "o1", title: "Offer: AI engineer", signer: { name: "Test Candidate", email: "test@candidates.example" }, fields: { starts_on: "2026-11-02" } });
    expect([id, await zohoStatus(c, id)]).toEqual(["zs-1", "signed"]);
    expect(calls.map((r) => [r.method, r.url, r.headers.authorization])).toEqual([
      ["POST", "https://sign.zoho.eu/api/v1/templates/tpl-9/createdocument", "Zoho-oauthtoken t0k"], ["GET", "https://sign.zoho.eu/api/v1/requests/zs-1", "Zoho-oauthtoken t0k"]]);
    const data = JSON.parse(new URLSearchParams(calls[0].body).get("data")!);
    expect(data.templates.actions[0]).toEqual({ recipient_name: "Test Candidate", recipient_email: "test@candidates.example", action_type: "SIGN" });
  });
});

describe.skipIf(!hasDb)("AC-3 offers through the adapter (Postgres)", () => {
  const use = sharedDb();

  it("AC3 send_offer creates the envelope and a signed one hires; Zoho needs its 031 credential", async () => {
    const db = use();
    const hr = await db.as("maya", "HR");
    const [a] = await db.q(sql`select a.id from recruitment.application a join recruitment.candidate c on c.id = a.candidate_id where c.name = 'Ravindu Jayasuriya'`);
    await expect(db.registry.call(hr, "send_offer", { applicationId: a.id, startsOn: "2026-11-16" }, { source: "mcp" })).rejects.toThrow(/zoho-sign/);
    const sent = (await db.registry.call(hr, "send_offer", { applicationId: a.id, startsOn: "2026-11-16", provider: "demo" }, { source: "mcp" })) as { offerId: string; envelopeId: string };
    expect(sent.envelopeId).toBe(`demo-${sent.offerId}`);
    const checked = await db.registry.call(hr, "check_offer_signature", { offerId: sent.offerId }, { source: "mcp" });
    expect(checked).toMatchObject({ status: "signed", hired: true, startsOn: "2026-11-16" });
    const [e] = await db.q(sql`select payload from core.event where name = 'recruitment.hired' and payload->>'applicationId' = ${a.id}`);
    expect(Object.keys(e.payload as object).sort()).toEqual(["applicationId", "by", "legalEntityId", "roleId", "startsOn"]);
  }, 60_000);
});
