import { z } from "zod";
import { contextForViewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { installed } from "../../../../../lib/registry";
import { getViewer } from "../../../../../lib/viewer";

export const dynamic = "force-dynamic";

const Query = z.object({ state: z.string().min(16).max(200), code: z.string().min(1).max(200) });
const back = (req: Request, q: Record<string, string>) => Response.redirect(new URL(`/git-accounts?${new URLSearchParams(q)}`, req.url), 303);

// 108 AC-2, AC-3, AC-11: GitHub's return. Only a signed-in person finishes their own connect; the module checks the
// state and stores the result; the Git accounts screen says how it went. Without the module installed, there's nothing here.
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer || !installed.some((m) => m.id === "git-accounts")) return new Response("Not found", { status: 404 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  // Review round 1: only fixed words reach the page; nothing from the query string or an unknown error is shown.
  if (params.error) return back(req, { github: "failed", reason: params.error === "access_denied" ? "you didn't approve it on GitHub" : "GitHub didn't finish the sign-in" });
  const q = Query.safeParse(params);
  if (!q.success) return back(req, { github: "failed", reason: "GitHub's reply was incomplete" });
  const { completeGitHubConnect, isGitHubReplyError } = await import("@amax/git-accounts/contracts");
  try {
    const r = await completeGitHubConnect(contextForViewer(viewer, "ui"), q.data);
    const skipped = r.skipped.length ? `; ${r.skipped.join(", ")} ${r.skipped.length === 1 ? "is" : "are"} linked to another person, ask an Admin` : "";
    return back(req, { github: "connected", reason: `@${r.login}, ${r.linked.length} email${r.linked.length === 1 ? "" : "s"}${skipped}` });
  } catch (e) {
    const known = isGitHubReplyError(e) || (e as { code?: string } | null)?.code === "invalid_input";
    if (!known) logError("git-accounts.callback", e);
    return back(req, { github: "failed", reason: known ? (e as Error).message : "something went wrong; try again" });
  }
}
