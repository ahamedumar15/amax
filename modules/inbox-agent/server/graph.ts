import { z } from "zod";
import type { RawMessage, SourceToRead } from "./reader";
import { getJson, GraphError, postForm } from "./wire";

// Microsoft Graph reads with application permissions (Mail.Read, ChannelMessage.Read.All) that an
// Entra admin consented to. Each call names one allow-listed mailbox or channel; nothing else is asked.
export type GraphApp = { tenant: string; clientId: string; clientSecret: string };

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOP = 25;
const id = z.string().min(1).max(400);
const Mail = z.object({ value: z.array(z.object({ id, receivedDateTime: z.string(), bodyPreview: z.string().nullish(), webLink: z.string().nullish() })).max(100) });
const Posts = z.object({ value: z.array(z.object({ id, createdDateTime: z.string(), messageType: z.string().nullish(), webUrl: z.string().nullish(), body: z.object({ content: z.string().nullish() }).nullish() })).max(100) });
const Token = z.object({ access_token: z.string().min(1) });
const enc = encodeURIComponent;

function shaped<T>(schema: z.ZodType<T>, v: unknown, what: string): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new GraphError(`Microsoft Graph's ${what} answer wasn't in the expected shape`);
  return r.data;
}

async function token(app: GraphApp) {
  const r = await postForm(`https://login.microsoftonline.com/${enc(app.tenant)}/oauth2/v2.0/token`, { client_id: app.clientId, client_secret: app.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  return shaped(Token, r, "sign-in").access_token;
}

async function mailbox(s: SourceToRead, bearer: string): Promise<RawMessage[]> {
  const url = `${GRAPH}/users/${enc(s.address)}/messages?$select=id,receivedDateTime,bodyPreview,webLink&$orderby=receivedDateTime%20desc&$top=${TOP}&$filter=receivedDateTime%20gt%20${enc(s.since)}`;
  return shaped(Mail, await getJson(url, bearer), "mail").value.map((m) => ({ sourceId: s.id, id: m.id, at: m.receivedDateTime, body: m.bodyPreview ?? "", link: m.webLink ?? null }));
}

async function channel(s: SourceToRead, bearer: string): Promise<RawMessage[]> {
  const [team, chan] = s.address.split("/");
  const posts = shaped(Posts, await getJson(`${GRAPH}/teams/${enc(team)}/channels/${enc(chan)}/messages?$top=${TOP}`, bearer), "channel").value;
  return posts.filter((p) => (p.messageType ?? "message") === "message" && Date.parse(p.createdDateTime) > Date.parse(s.since))
    .map((p) => ({ sourceId: s.id, id: p.id, at: p.createdDateTime, body: p.body?.content ?? "", link: p.webUrl ?? null }));
}

export const graphReader = (app: GraphApp) => async (sources: SourceToRead[]): Promise<RawMessage[]> => {
  const bearer = await token(app);
  const out: RawMessage[] = [];
  for (const s of sources) out.push(...(await (s.kind === "mailbox" ? mailbox(s, bearer) : channel(s, bearer))));
  return out;
};
