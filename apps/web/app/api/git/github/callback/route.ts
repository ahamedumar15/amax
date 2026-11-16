import { z } from "zod";
import { contextForViewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { installed } from "../../../../../lib/registry";
import { getViewer } from "../../../../../lib/viewer";

export const dynamic = "force-dynamic";

const Query = z.object({ state: z.string().min(16).max(200), code: z.string().min(1).max(200) });
const back = (req: Request, q: Record<string, string>) => Response.redirect(new URL(`/git-accounts?${new URLSearchParams(q)}`, req.url), 303);
const REASONS = ["expired", "no-email", "all-taken", "login-taken"];

// 108 AC-2, AC-3, AC-11: GitHub's return. Only a signed-in person finishes their own connect; the module checks the
// state and stores the result; the Git accounts screen says how it went. Final pass: the URL carries only a result code
// and a count, never free text or anyone's email. Without the module installed, there's nothing here.
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer || !installed.some((m) => m.id === "git-accounts")) return new Response("Not found", { status: 404 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  if (params.error) return back(req, { github: params.error === "access_denied" ? "denied" : "incomplete" });
  const q = Query.safeParse(params);
  if (!q.success) return back(req, { github: "incomplete" });
  const { completeGitHubConnect, isGitHubReplyError } = await import("@amax/git-accounts/contracts");
  try {
    const r = await completeGitHubConnect(contextForViewer(viewer, "ui"), q.data);
    return back(req, { github: "connected", ...(r.skipped.length ? { skipped: String(r.skipped.length) } : {}) });
  } catch (e) {
    const reason = (e as { reason?: string } | null)?.reason;
    if (reason && REASONS.includes(reason)) return back(req, { github: reason });
    if (isGitHubReplyError(e)) return back(req, { github: "github" });
    logError("git-accounts.callback", e);
    return back(req, { github: "error" });
  }
}
