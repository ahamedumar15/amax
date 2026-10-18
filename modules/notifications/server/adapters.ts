import type { ServiceContext } from "@amax/core/server";
import { useSecret, type SecretUse } from "@amax/core/secrets";
import { safePost, safeRequest } from "@amax/api/egress";
import type { Channel } from "../contracts";

export type Outgoing = { to: { userId: string; name: string; email: string }; subject: string; text: string; link: string | null; urgent: boolean };
/** One channel's way out (030 AC-2). Slack, SMTP or a Teams bot is another adapter beside these. */
export type ChannelAdapter = { id: string; channel: Channel; send: (ctx: ServiceContext, m: Outgoing, signal: AbortSignal) => Promise<void> };

const ok = (status: number, what: string) => {
  if (status < 200 || status > 299) throw new Error(`${what} answered HTTP ${status}`);
};
const json = { "content-type": "application/json" };
const withSecret = <T>(ctx: ServiceContext, req: SecretUse, fn: (value: string) => Promise<T>) => useSecret(ctx, req, (s) => fn(s.reveal()));

type GraphMail = { tenant: string; clientId: string; clientSecret: string; sender: string };

async function graphToken(c: GraphMail, signal: AbortSignal) {
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString();
  const r = await safeRequest(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, { body, signal, headers: { "content-type": "application/x-www-form-urlencoded" } });
  ok(r.status, "Microsoft sign-in");
  return (JSON.parse(r.body) as { access_token: string }).access_token;
}

/** Email through Microsoft Graph sendMail; the msgraph-mail secret is JSON: tenant, clientId, clientSecret, sender. */
export const graphEmail: ChannelAdapter = {
  id: "graph", channel: "email",
  send: (ctx, m, signal) => withSecret(ctx, { connector: "msgraph-mail", purpose: "send a notification email" }, async (value) => {
    const c = JSON.parse(value) as GraphMail;
    const token = await graphToken(c, signal);
    const content = m.link ? `${m.text}\n\nOpen in amax: ${m.link}` : m.text;
    const body = JSON.stringify({ message: { subject: m.subject, importance: m.urgent ? "high" : "normal", body: { contentType: "Text", content }, toRecipients: [{ emailAddress: { address: m.to.email, name: m.to.name } }] }, saveToSentItems: false });
    const r = await safeRequest(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.sender)}/sendMail`, { body, signal, headers: { ...json, authorization: `Bearer ${token}` } });
    ok(r.status, "Microsoft Graph");
  }),
};

/** Teams through an incoming webhook; the teams secret is the webhook URL. The message names the person it is for. */
export const teamsWebhook: ChannelAdapter = {
  id: "webhook", channel: "teams",
  send: (ctx, m, signal) => withSecret(ctx, { connector: "teams", purpose: "post a notification to Teams" }, async (url) => {
    const text = [`**${m.to.name}**: ${m.urgent ? "Urgent: " : ""}${m.subject}`, m.text, m.link ? `[Open in amax](${m.link})` : ""].filter(Boolean).join("\n\n");
    ok(await safePost(url, { body: JSON.stringify({ text }), headers: json, signal }), "Teams");
  }),
};

const adapters: Record<Channel, ChannelAdapter> = { email: graphEmail, teams: teamsWebhook };
export const adapterFor = (channel: Channel) => adapters[channel];
/** Tests and hosts swap an adapter (a fake wire, or SMTP in place of Graph). */
export const setAdapter = (a: ChannelAdapter) => void (adapters[a.channel] = a);
export const resetAdapters = () => Object.assign(adapters, { email: graphEmail, teams: teamsWebhook });
