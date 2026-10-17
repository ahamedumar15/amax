import { AwsClient } from "aws4fetch";
import { KmsError, type Kms } from "./kms";

export type AwsKmsConfig = { region: string; keyId: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string };
export type AzureKmsConfig = { vaultUrl: string; keyName: string; tenantId: string; clientId: string; clientSecret: string; region?: string };

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

async function json(res: Response, op: string) {
  if (!res.ok) throw new KmsError(op, res.status);
  return (await res.json()) as Record<string, string>;
}

export function awsKms(cfg: AwsKmsConfig, fetchImpl: typeof fetch = fetch): Kms {
  const aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken, region: cfg.region, service: "kms" });
  const call = async (target: string, body: object) =>
    json(await fetchImpl(await aws.sign(`https://kms.${cfg.region}.amazonaws.com/`, {
      method: "POST",
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `TrentService.${target}` },
      body: JSON.stringify(body),
    })), target);
  return {
    id: "aws",
    label: `AWS KMS, ${cfg.region}`,
    async wrap(tenantId, dataKey) {
      const out = await call("Encrypt", { KeyId: cfg.keyId, Plaintext: b64(dataKey), EncryptionContext: { tenant: tenantId } });
      return { keyRef: out.KeyId ?? cfg.keyId, wrapped: out.CiphertextBlob };
    },
    async unwrap(tenantId, w) {
      const out = await call("Decrypt", { KeyId: w.keyRef, CiphertextBlob: w.wrapped, EncryptionContext: { tenant: tenantId } });
      return new Uint8Array(Buffer.from(out.Plaintext, "base64"));
    },
  };
}

export function azureKeyVault(cfg: AzureKmsConfig, fetchImpl: typeof fetch = fetch): Kms {
  const vault = cfg.vaultUrl.replace(/\/$/, "");
  let token: { value: string; until: number } | undefined;
  const bearer = async () => {
    if (token && token.until > Date.now()) return token.value;
    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "https://vault.azure.net/.default" });
    const out = await json(await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, { method: "POST", body: form }), "sign-in");
    token = { value: out.access_token, until: Date.now() + (Number(out.expires_in) - 60) * 1000 };
    return token.value;
  };
  const post = async (url: string, body: object, op: string) =>
    json(await fetchImpl(`${url}?api-version=7.4`, { method: "POST", headers: { authorization: `Bearer ${await bearer()}`, "content-type": "application/json" }, body: JSON.stringify(body) }), op);
  return {
    id: "azure",
    label: `Azure Key Vault${cfg.region ? `, ${cfg.region}` : ""}`,
    async wrap(tenantId, dataKey) {
      const out = await post(`${vault}/keys/${encodeURIComponent(cfg.keyName)}/wrapkey`, { alg: "RSA-OAEP-256", value: b64url(dataKey) }, "wrap");
      return { keyRef: out.kid, wrapped: out.value };
    },
    async unwrap(tenantId, w) {
      if (!w.keyRef.startsWith(`${vault}/keys/${encodeURIComponent(cfg.keyName)}/`)) throw new Error("secrets: this tenant's data key was wrapped by a different Key Vault key");
      const out = await post(`${w.keyRef}/unwrapkey`, { alg: "RSA-OAEP-256", value: w.wrapped }, "unwrap");
      return new Uint8Array(Buffer.from(out.value, "base64url"));
    },
  };
}
