import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { revokeUserTx } from "./revoke";
import { bearer, newToken, tokenHash } from "./tokens";

// SCIM 2.0 Users (RFC 7643/7644), enough for Entra ID and Okta provisioning: create, read, list with
// `userName eq`, replace, patch, delete. Deactivation or delete revokes sessions and tokens at once.
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/scim+json" } });
const fail = (status: number, detail: string, scimType?: string) => json({ schemas: [ERROR], status: String(status), detail, ...(scimType ? { scimType } : {}) }, status);

type Row = Record<string, unknown>;
type ScimUser = {
  userName?: string;
  externalId?: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string; formatted?: string };
  emails?: { value: string; primary?: boolean }[];
  active?: boolean;
};

const resource = (u: Row, base: string) => ({
  schemas: [USER],
  id: u.id,
  externalId: u.scim_id ?? undefined,
  userName: u.email,
  displayName: u.name,
  name: { formatted: u.name },
  emails: [{ value: u.email, primary: true }],
  active: u.status === "active",
  meta: { resourceType: "User", created: new Date(u.created_at as string).toISOString(), lastModified: new Date(u.updated_at as string).toISOString(), location: `${base}/Users/${u.id}` },
});

const nameOf = (b: ScimUser) => b.displayName ?? b.name?.formatted ?? [b.name?.givenName, b.name?.familyName].filter(Boolean).join(" ");
const emailOf = (b: ScimUser) => (b.emails?.find((e) => e.primary) ?? b.emails?.[0])?.value ?? b.userName;

export async function scimTenant(db: Db, req: Request) {
  const token = bearer(req);
  if (!token) return null;
  const [row] = await db.execute(sql`select auth.lookup_scim(${tokenHash(token)}) as tenant_id`);
  return (row?.tenant_id as string | null) ?? null;
}

async function setActive(tx: Tx, tenantId: string, u: Row, active: boolean) {
  if (active && u.status !== "active") await tx.execute(sql`update auth.user set status = 'active', updated_at = now() where id = ${u.id}`);
  if (!active && u.status === "active") await revokeUserTx(tx, tenantId, u.id as string, { deactivate: true, reason: "scim" });
}

const getUser = async (tx: Tx, id: string) => (await tx.execute(sql`select * from auth.user where id::text = ${id}`))[0];

export async function scimHandler(db: Db, req: Request, id?: string): Promise<Response> {
  const tenantId = await scimTenant(db, req);
  if (!tenantId) return fail(401, "invalid or missing bearer token");
  const url = new URL(req.url);
  const base = url.pathname.replace(/\/Users(\/.*)?$/, "");
  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? ((await req.json().catch(() => null)) as Row | null) : null;
  if (body === null && ["POST", "PUT", "PATCH"].includes(req.method)) return fail(400, "body must be JSON", "invalidSyntax");

  return withTenant(db, tenantId, async (tx) => {
    if (!id && req.method === "GET") {
      const filter = url.searchParams.get("filter");
      const m = filter?.match(/^userName eq "([^"]+)"$/i);
      if (filter && !m) return fail(400, 'only `userName eq "..."` filters are supported', "invalidFilter");
      const start = Math.max(1, Number(url.searchParams.get("startIndex") ?? 1));
      const count = Math.min(200, Math.max(0, Number(url.searchParams.get("count") ?? 100)));
      const where = m ? sql`where email = ${m[1].toLowerCase()}` : sql``;
      const [{ total }] = await tx.execute(sql`select count(*)::int as total from auth.user ${where}`);
      const rows = await tx.execute(sql`select * from auth.user ${where} order by created_at limit ${count} offset ${start - 1}`);
      return json({ schemas: [LIST], totalResults: total, startIndex: start, itemsPerPage: rows.length, Resources: rows.map((r) => resource(r, base)) });
    }

    if (!id && req.method === "POST") {
      const b = body as ScimUser;
      const email = emailOf(b)?.toLowerCase();
      if (!email) return fail(400, "userName or emails is required", "invalidValue");
      const exists = await tx.execute(sql`select 1 from auth.user where email = ${email}`);
      if (exists.length) return fail(409, "a user with this userName exists", "uniqueness");
      const [u] = await tx.execute(sql`insert into auth.user (tenant_id, email, name, scim_id, status)
        values (${tenantId}, ${email}, ${nameOf(b) || email}, ${b.externalId ?? null}, ${b.active === false ? "deactivated" : "active"}) returning *`);
      return json(resource(u, base), 201);
    }

    if (!id) return fail(405, "method not allowed");
    const u = await getUser(tx, id);
    if (!u) return fail(404, "user not found");

    if (req.method === "GET") return json(resource(u, base));

    if (req.method === "DELETE") {
      await setActive(tx, tenantId, u, false);
      return new Response(null, { status: 204 });
    }

    if (req.method === "PUT") {
      const b = body as ScimUser;
      await tx.execute(sql`update auth.user set email = ${(emailOf(b) ?? (u.email as string)).toLowerCase()}, name = ${nameOf(b) || (u.name as string)},
        scim_id = ${b.externalId ?? u.scim_id ?? null}, updated_at = now() where id = ${u.id}`);
      await setActive(tx, tenantId, u, b.active !== false);
      return json(resource(await getUser(tx, id), base));
    }

    if (req.method === "PATCH") {
      if (!(body!.schemas as string[] | undefined)?.includes(PATCH)) return fail(400, "expected a PatchOp", "invalidSyntax");
      // Entra sends {op:"Replace", path:"active", value:"False"}; Okta sends {op:"replace", value:{active:false}}.
      const changes: ScimUser = {};
      for (const op of (body!.Operations as { op: string; path?: string; value: unknown }[]) ?? []) {
        if (!/^(replace|add)$/i.test(op.op)) return fail(400, `unsupported op ${op.op}`, "invalidValue");
        const pairs = op.path ? [[op.path, op.value]] : Object.entries((op.value as Row) ?? {});
        for (const [path, value] of pairs as [string, unknown][]) {
          if (path === "active") changes.active = value === true || String(value).toLowerCase() === "true";
          else if (path === "displayName" || path === "name.formatted") changes.displayName = String(value);
          else if (path === "userName" || path === 'emails[type eq "work"].value') changes.userName = String(value);
          else if (path === "externalId") changes.externalId = String(value);
        }
      }
      if (changes.displayName || changes.userName || changes.externalId) {
        await tx.execute(sql`update auth.user set name = ${changes.displayName ?? (u.name as string)}, email = ${(changes.userName ?? (u.email as string)).toLowerCase()},
          scim_id = ${changes.externalId ?? u.scim_id ?? null}, updated_at = now() where id = ${u.id}`);
      }
      if (changes.active !== undefined) await setActive(tx, tenantId, u, changes.active);
      return json(resource(await getUser(tx, id), base));
    }
    return fail(405, "method not allowed");
  });
}

// Admin: mint a SCIM token for a tenant (shown once).
export async function createScimToken(db: Db, tenantId: string) {
  const token = newToken("amx_scim");
  await withTenant(db, tenantId, (tx) => tx.execute(sql`insert into auth.scim_token (tenant_id, token_hash) values (${tenantId}, ${tokenHash(token)})`));
  return token;
}
