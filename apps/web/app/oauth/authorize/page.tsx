import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { issueCode, OAuthError, validateAuthorize, type AuthorizeRequest } from "@amax/mcp";
import { Card, Logo } from "@amax/ui";
import { baseUrl, getDb } from "../../../lib/server";
import { getViewer } from "../../../lib/viewer";

export const metadata = { title: "Allow access" };
export const dynamic = "force-dynamic";

const SCOPE_TEXT: Record<string, string> = {
  read: "Read projects, proposals, releases and other records you can see",
  write: "Create and change records on your behalf (each change is audited)",
  sensitive: "Read classified fields your role may see, such as pay",
};

// The consent screen (004 AC-3): who is asking, for which scopes, as which user.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = new URLSearchParams(await searchParams);
  const viewer = await getViewer();
  if (!viewer) redirect(`/signin?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  let req: Awaited<ReturnType<typeof validateAuthorize>>;
  try {
    req = await validateAuthorize(getDb()!, baseUrl(await headers()), params);
  } catch (e) {
    return <main id="main" className="signin"><Card><h1>Can't connect</h1><p role="alert" className="signin-error">{e instanceof OAuthError ? e.message : "The request is invalid."}</p></Card></main>;
  }
  const { clientName, ...authorize } = req;
  async function decide(data: FormData) {
    "use server";
    const v = await getViewer();
    if (!v) redirect("/signin");
    if (data.get("decision") !== "allow") {
      const u = new URL(authorize.redirectUri);
      u.searchParams.set("error", "access_denied");
      if (authorize.state) u.searchParams.set("state", authorize.state);
      redirect(u.toString());
    }
    redirect(await issueCode(getDb()!, v, authorize as AuthorizeRequest));
  }
  return (
    <main id="main" className="signin">
      <Card>
        <Logo />
        <h1>Allow {clientName} to use amax?</h1>
        <p>It will act as <b>{viewer.name}</b> ({viewer.email}) with your roles. It can:</p>
        <ul>{req.scopes.map((s) => <li key={s}><b>{s}</b>: {SCOPE_TEXT[s]}</li>)}</ul>
        <p className="muted">Access lasts an hour at a time and renews until you revoke it in Integrations.</p>
        <form action={decide} style={{ display: "flex", gap: 10 }}>
          <button className="btn primary" type="submit" name="decision" value="allow">Allow</button>
          <button className="btn" type="submit" name="decision" value="deny">Deny</button>
        </form>
      </Card>
    </main>
  );
}
