import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { awsKms, azureKeyVault, localKms, parseKeyFile } from "../src/secrets";

const vaultKey = randomBytes(32);
const box = (b: Buffer) => { const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", vaultKey, iv); const ct = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]); };
const unbox = (b: Buffer) => { const d = createDecipheriv("aes-256-gcm", vaultKey, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); };
const reply = (body: object) => new Response(JSON.stringify(body), { status: 200 });

const awsFake: typeof fetch = async (input, init) => {
  const req = new Request(input, init);
  expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 .*kms/);
  const body = await req.json();
  expect(body.EncryptionContext).toEqual({ tenant: "t1" });
  return req.headers.get("x-amz-target") === "TrentService.Encrypt"
    ? reply({ KeyId: "arn:aws:kms:ap-southeast-2:1:key/k", CiphertextBlob: box(Buffer.from(body.Plaintext, "base64")).toString("base64") })
    : reply({ Plaintext: unbox(Buffer.from(body.CiphertextBlob, "base64")).toString("base64") });
};

const azureFake: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://login.microsoftonline.com/")) return reply({ access_token: "test-token", expires_in: 3600 });
  expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
  const body = JSON.parse(String(init?.body));
  return url.includes("/wrapkey")
    ? reply({ kid: "https://amax-test.vault.azure.net/keys/tenant-keys/v1", value: box(Buffer.from(body.value, "base64url")).toString("base64url") })
    : reply({ value: unbox(Buffer.from(body.value, "base64url")).toString("base64url") });
};

describe("031 AC-1 KMS adapters wrap and unwrap each tenant's data key", () => {
  it("AC1 local key file, AWS KMS and Azure Key Vault round-trip, and refuse keys they didn't wrap", async () => {
    const dek = new Uint8Array(randomBytes(32));
    const local = localKms(parseKeyFile(randomBytes(32).toString("hex")));
    const aws = awsKms({ region: "ap-southeast-2", keyId: "alias/amax", accessKeyId: "AKIATEST", secretAccessKey: "test-secret" }, awsFake);
    const azure = azureKeyVault({ vaultUrl: "https://amax-test.vault.azure.net", keyName: "tenant-keys", tenantId: "tid", clientId: "cid", clientSecret: "test-secret", region: "australiaeast" }, azureFake);
    for (const kms of [local, aws, azure]) {
      const w = await kms.wrap("t1", dek);
      expect(w.wrapped).not.toContain(Buffer.from(dek).toString("base64"));
      expect(await kms.unwrap("t1", w)).toEqual(dek);
    }
    expect(azure.label).toBe("Azure Key Vault, australiaeast");
    await expect(localKms(new Uint8Array(randomBytes(32))).unwrap("t1", await local.wrap("t1", dek))).rejects.toThrow(/different local key/);
    await expect(local.unwrap("t2", await local.wrap("t1", dek))).rejects.toThrow();
    await expect(azure.unwrap("t1", { keyRef: "https://evil.example/keys/x/1", wrapped: "AA" })).rejects.toThrow(/different Key Vault key/);
  });
});
