import type { ServiceContext } from "@amax/core/server";
import { useSecret } from "@amax/core/secrets";

// 023 AC-3: offers go out for e-signature through a provider adapter. Zoho Sign is the first; another
// provider is one more `registerSignProvider` call. The demo provider is fictional: it sends nothing
// and stands in for the candidate signing, so the demo can run end to end without a Zoho account.
export type EnvelopeStatus = "sent" | "signed" | "declined";
export type Envelope = { offerId: string; title: string; signer: { name: string; email: string }; fields: Record<string, string> };
export type SignProvider = {
  id: string;
  label: string;
  fictional?: boolean;
  send: (ctx: ServiceContext, e: Envelope) => Promise<string>;
  status: (ctx: ServiceContext, envelopeId: string) => Promise<EnvelopeStatus>;
};

const providers = new Map<string, SignProvider>();
export const registerSignProvider = (p: SignProvider) => void providers.set(p.id, p);
export const signProviders = () => [...providers.values()];
export function providerOf(id: string) {
  const p = providers.get(id);
  if (!p) throw new Error(`no e-signature provider "${id}" is installed`);
  return p;
}

/** One HTTPS call to the provider: method, URL, headers, body; answers status and body. Swapped in tests. */
export type Transport = (req: { method: "GET" | "POST"; url: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;
const httpsOnly: Transport = async (req) => {
  const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: await r.text() };
};
let transport = httpsOnly;
export const setSignTransport = (t: Transport | null) => void (transport = t ?? httpsOnly);

/** The zoho-sign credential (031) is JSON: the OAuth token, the offer template and the data centre (com, eu, in, com.au). */
export type ZohoConfig = { token: string; templateId: string; dc?: "com" | "eu" | "in" | "com.au" };
const base = (c: ZohoConfig) => `https://sign.zoho.${c.dc ?? "com"}/api/v1`;
const auth = (c: ZohoConfig) => ({ authorization: `Zoho-oauthtoken ${c.token}` });
const STATUS: Record<string, EnvelopeStatus> = { completed: "signed", declined: "declined", recalled: "declined", expired: "declined" };

function ok(r: { status: number; body: string }) {
  if (r.status < 200 || r.status > 299) throw new Error(`Zoho Sign answered HTTP ${r.status}`);
  return JSON.parse(r.body) as { requests?: { request_id?: string; request_status?: string } };
}

/** Creates and sends the signing request from the offer template, filled with the offer's fields. */
export async function zohoSend(c: ZohoConfig, e: Envelope) {
  const data = { templates: { field_data: { field_text_data: e.fields }, actions: [{ recipient_name: e.signer.name, recipient_email: e.signer.email, action_type: "SIGN" }], request_name: e.title } };
  const body = new URLSearchParams({ data: JSON.stringify(data), is_quicksend: "true" }).toString();
  const r = ok(await transport({ method: "POST", url: `${base(c)}/templates/${encodeURIComponent(c.templateId)}/createdocument`, headers: { ...auth(c), "content-type": "application/x-www-form-urlencoded" }, body }));
  if (!r.requests?.request_id) throw new Error("Zoho Sign didn't return a request id");
  return r.requests.request_id;
}

export async function zohoStatus(c: ZohoConfig, envelopeId: string): Promise<EnvelopeStatus> {
  const r = ok(await transport({ method: "GET", url: `${base(c)}/requests/${encodeURIComponent(envelopeId)}`, headers: auth(c) }));
  return STATUS[r.requests?.request_status ?? ""] ?? "sent";
}

const withZoho = <T>(ctx: ServiceContext, purpose: string, fn: (c: ZohoConfig) => Promise<T>) =>
  useSecret(ctx, { connector: "zoho-sign", purpose }, (s) => fn(JSON.parse(s.reveal()) as ZohoConfig));

export const zohoSign: SignProvider = {
  id: "zoho-sign", label: "Zoho Sign",
  send: (ctx, e) => withZoho(ctx, "send an offer for signature", (c) => zohoSend(c, e)),
  status: (ctx, id) => withZoho(ctx, "check an offer's signature", (c) => zohoStatus(c, id)),
};

export const demoSign: SignProvider = {
  id: "demo", label: "Demo e-signature (fictional, nothing is sent)", fictional: true,
  send: async (_ctx, e) => `demo-${e.offerId}`,
  status: async () => "signed",
};

registerSignProvider(zohoSign);
registerSignProvider(demoSign);
