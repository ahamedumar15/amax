import { z } from "zod";
import { createCredential, MAX_CREDENTIAL_DAYS, revokeCredential, rotateCredential, SCOPE } from "@amax/auth/credentials";
import { listCredentialViews } from "@amax/auth/credentials-read";
import { apiStats, listWebhooks, PROVIDERS, resumeWebhook, subscribeWebhook, unsubscribeWebhook } from "@amax/api";
import type { Viewer } from "@amax/auth";
import { chatOnly, ctxFor, notFound, read, tool, write, type AdminDeps } from "./tool";

const CRED_READ = "api:credential:read";
const CRED_MANAGE = "api:credential:manage";
const HOOK_READ = "api:webhook:read";
const HOOK_MANAGE = "api:webhook:manage";
const id = z.object({ id: z.uuid() });

const KEY_ONCE = "a new API key is shown once, on amax chat's confirm card; create or rotate credentials there";

export const apiTools = (d: AdminDeps) => {
  const creds = (v: Viewer) => listCredentialViews(d.db(), v.tenantId);
  const hooks = (v: Viewer) => listWebhooks(d.db(), v.tenantId);
  return [
    tool({ ...read(CRED_READ), name: "list_api_credentials", description: "Service credentials for CI and tools: owner, scopes, who they act for, expiry and last use. Never the keys.", input: z.object({}), run: (v) => creds(v) }),
    tool({ ...read(CRED_READ), name: "get_api_credential", description: "One service credential: owner, scopes, who it acts for, expiry and last use. Never the key.", input: id,
      run: async (v, a) => (await creds(v)).find((c) => c.id === a.id) ?? Promise.reject(notFound(`credential ${a.id}`)) }),
    tool({ ...write(CRED_MANAGE), name: "create_api_credential", description: "Create a service credential. Its API key is shown once, on the confirm card, then stored hashed.",
      input: z.object({
        name: z.string().trim().min(2).max(80),
        scopes: z.array(z.string().regex(SCOPE)).min(1).describe("Per module: '<module>:read', '<module>:write' (includes read) or '<module>:sensitive'"),
        actsFor: z.array(z.email()).default([]).describe("Emails of the people it may act for; empty for no one"),
        days: z.number().int().min(1).max(MAX_CREDENTIAL_DAYS).describe(`Days until it expires, at most ${MAX_CREDENTIAL_DAYS}`),
      }),
      run: async (v, a, s) => (chatOnly(s, KEY_ONCE), createCredential(ctxFor(v, s), { ...a, ownerUserId: v.userId })) }),
    tool({ ...write(CRED_MANAGE), name: "rotate_api_credential", description: "Rotate a service credential's API key. The new key is shown once, on the confirm card; the old one stops working at once.", input: id,
      run: async (v, a, s) => (chatOnly(s, KEY_ONCE), rotateCredential(ctxFor(v, s), a)) }),
    tool({ ...write(CRED_MANAGE), name: "revoke_api_credential", description: "Revoke a service credential now; its key and access tokens stop working.", destructive: true,
      input: z.object({ id: z.uuid(), reason: z.enum(["replaced", "compromised", "unused"]) }), run: (v, a, s) => revokeCredential(ctxFor(v, s), a) }),
    tool({ ...read(HOOK_READ), name: "get_api_overview", description: "This week's API picture: outgoing webhooks and deliveries, incoming webhooks verified and rejected per provider, and requests rate-limited.", input: z.object({ provider: z.enum(PROVIDERS).optional(), channel: z.enum(["page", "prefetch", "rest", "mcp", "chat"]).optional() }),
      run: async (v, a) => {
        const s = await apiStats(d.db(), v.tenantId);
        if (a.provider) return s.inbound.find((i) => i.provider === a.provider);
        if (a.channel) return s.limited.byChannel.find((c) => c.channel === a.channel) ?? { channel: a.channel, subjects: 0, count: 0 };
        return s;
      } }),
    tool({ ...read(HOOK_READ), name: "list_webhooks", description: "Outgoing webhooks: URL, events, status and deliveries this week.", input: z.object({}), run: (v) => hooks(v) }),
    tool({ ...read(HOOK_READ), name: "get_webhook", description: "One outgoing webhook: URL, events, status, failures and deliveries this week.", input: id,
      run: async (v, a) => (await hooks(v)).find((h) => h.id === a.id) ?? Promise.reject(notFound(`webhook ${a.id}`)) }),
    tool({ ...write(HOOK_MANAGE), name: "subscribe_webhook", description: "Send amax events to an https URL, signed with the amax webhook signing secret.",
      input: z.object({ name: z.string().trim().min(2).max(80), url: z.string().max(2000), events: z.array(z.string()).min(1).describe("Event names, e.g. delivery.release.deployed") }),
      run: (v, a, s) => subscribeWebhook(ctxFor(v, s), a) }),
    tool({ ...write(HOOK_MANAGE), name: "unsubscribe_webhook", description: "Stop sending events to an outgoing webhook.", destructive: true, input: id, run: (v, a, s) => unsubscribeWebhook(ctxFor(v, s), a) }),
    tool({ ...write(HOOK_MANAGE), name: "resume_webhook", description: "Switch an outgoing webhook back on after it was switched off for failing.", input: id, run: (v, a, s) => resumeWebhook(ctxFor(v, s), a) }),
  ];
};
