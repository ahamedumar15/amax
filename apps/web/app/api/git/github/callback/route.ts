import { GITHUB_CALLBACK_SLOT, provided, type GitHubCallback } from "@amax/core/server";
import { contextForViewer } from "@amax/auth";
import { installed } from "../../../../../lib/registry";
import { getViewer } from "../../../../../lib/viewer";

export const dynamic = "force-dynamic";

// 108 AC-2: GitHub's return. Only a signed-in person finishes their own connect; the module that fills the core-declared
// slot does the work (the app names no module package). 112 AC-5: a signed-out return goes to sign-in and back here.
export async function GET(req: Request) {
  const [handle] = installed.length ? provided<GitHubCallback>(GITHUB_CALLBACK_SLOT) : [];
  if (!handle) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const viewer = await getViewer();
  if (!viewer) return Response.redirect(new URL(`/signin?next=${encodeURIComponent(url.pathname + url.search)}`, req.url), 303);
  const query = await handle(contextForViewer(viewer, "ui"), Object.fromEntries(url.searchParams));
  return Response.redirect(new URL(`/git-accounts?${new URLSearchParams(query)}`, req.url), 303);
}
