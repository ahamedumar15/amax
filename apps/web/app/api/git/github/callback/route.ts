import type { ServiceContext } from "@amax/core/server";
import { provided } from "@amax/core/server";
import { contextForViewer } from "@amax/auth";
import { installed } from "../../../../../lib/registry";
import { getViewer } from "../../../../../lib/viewer";

export const dynamic = "force-dynamic";

/** The slot a Git accounts module fills: GitHub's return, as the Git accounts screen's query (108). */
type GitHubCallback = (ctx: ServiceContext, params: Record<string, string>) => Promise<Record<string, string>>;

// 108 AC-2: GitHub's return. Only a signed-in person finishes their own connect. The module that fills the slot does the
// work (final pass 2: the app names no module package), so with none installed there's nothing here.
export async function GET(req: Request) {
  const viewer = await getViewer();
  const [handle] = installed.length ? provided<GitHubCallback>("app.github-callback") : [];
  if (!viewer || !handle) return new Response("Not found", { status: 404 });
  const query = await handle(contextForViewer(viewer, "ui"), Object.fromEntries(new URL(req.url).searchParams));
  return Response.redirect(new URL(`/git-accounts?${new URLSearchParams(query)}`, req.url), 303);
}
