import { redirect } from "next/navigation";
import { listProviders, providerIdFor } from "@amax/auth/authjs";
import { loadEnv } from "@amax/core/env";
import { Card, Logo } from "@amax/ui";
import { signIn } from "../../auth";
import { authEnabled, getDb } from "../../lib/server";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "no-role": "Your account isn't in any amax group yet. Ask your administrator for access.",
  "wrong-tenant": "That account belongs to a different organisation. Sign in with your own organisation's button.",
  "unknown-directory": "Your organisation isn't set up in amax.",
  deactivated: "Your account has been deactivated.",
  AccessDenied: "Access was denied.",
  CredentialsSignin: "No demo user with that email.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (!authEnabled()) redirect("/");
  const { error, next } = await searchParams;
  const to = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const providers = await listProviders(getDb()!);
  const env = loadEnv();
  const demo = env.AMAX_AUTH_DEMO === "1" && env.NODE_ENV !== "production";
  return (
    <main id="main" className="signin">
      <Card>
        <Logo />
        <h1>Sign in to amax</h1>
        {error && <p role="alert" className="signin-error">{ERRORS[error] ?? "Sign-in failed. Try again."}</p>}
        {providers.map((p) => (
          <form key={p.providerId} action={async () => { "use server"; await signIn(providerIdFor(p.providerId), { redirectTo: to }); }}>
            <button className="btn primary" type="submit">Sign in with Microsoft · {p.tenantName}</button>
          </form>
        ))}
        {!providers.length && !demo && <p>No organisation is set up yet. Run the first-tenant seed (see README).</p>}
        {demo && (
          <form action={async (data: FormData) => { "use server"; await signIn("demo", { email: String(data.get("email") ?? ""), redirectTo: to }); }}>
            <label htmlFor="demo-email">Demo user (fixtures only)</label>
            <input id="demo-email" name="email" type="email" defaultValue="maya@lumenlabs.test" required />
            <button className="btn" type="submit">Sign in as demo user</button>
          </form>
        )}
      </Card>
    </main>
  );
}
